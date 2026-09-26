/*
 * 2026-09-26 正式库关卡改 ID 之后的存档迁移（规则见 docs/content/puzzle-identity.md）。
 *
 * 进度按 `nonogram:progress:<关卡 ID>` 存。ID 从 `easy-01-heart` / `d0016-diamond`
 * 换成 `festive-tales-01-heart` 这一类之后，老存档要搬到新键上，否则玩家一升级
 * 就会看到解过的画全部清零。
 *
 * 迁移表 src/data/legacy-puzzle-ids.json 有六百条，不进主包：先扫一遍本地键，
 * 只有真找到旧格式的进度键才去取那张表（新装机和已经迁过的设备零成本）。
 * 搬完写一个完成标记，之后每次开机只多读一个键。
 *
 * 与挂树的关系同 libraryBoot：永不拒绝。迁不动（隐私模式、配额满）就留着旧键下次再试，
 * 不能因为这一步让首页出不来。
 */

const PROGRESS_PREFIX = 'nonogram:progress:'
const DONE_KEY = 'nonogram:ids-migrated:2026-09-26'
/** 迁移前正式库的两种旧 ID 格式；每日关的存档键按日期（daily-YYYY-MM-DD），不受影响 */
const LEGACY_ID = /^(?:(?:easy|medium|hard)-\d{2,3}|d\d{4,})-[a-z0-9-]+$/

type LoadTable = () => Promise<Record<string, string>>

const loadTable: LoadTable = () =>
  import('../data/legacy-puzzle-ids.json').then((module) => module.default.ids as Record<string, string>)

function legacyProgressIds(storage: Storage): string[] {
  const ids: string[] = []
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)
    if (!key?.startsWith(PROGRESS_PREFIX)) continue
    const id = key.slice(PROGRESS_PREFIX.length)
    if (LEGACY_ID.test(id)) ids.push(id)
  }
  return ids
}

/**
 * 把旧 ID 下的进度搬到新 ID。新键已有进度时以新键为准（说明升级后已经玩过），旧键照删。
 * 返回搬动的条数；任何异常都吞掉，返回已完成的部分。
 */
export async function migrateLegacyProgress(
  storage: Storage = localStorage,
  load: LoadTable = loadTable,
): Promise<number> {
  let moved = 0
  try {
    if (storage.getItem(DONE_KEY) === '1') return 0
    const legacy = legacyProgressIds(storage)
    if (legacy.length > 0) {
      const table = await load()
      for (const from of legacy) {
        const to = table[from]
        if (!to) continue
        const oldKey = PROGRESS_PREFIX + from
        const value = storage.getItem(oldKey)
        if (value === null) continue
        const newKey = PROGRESS_PREFIX + to
        if (storage.getItem(newKey) === null) storage.setItem(newKey, value)
        storage.removeItem(oldKey)
        moved += 1
      }
    }
    storage.setItem(DONE_KEY, '1')
  } catch {
    // 没写完成标记：下次开机从剩下的旧键接着搬
  }
  return moved
}
