import { useSyncExternalStore } from 'react'
import { ALBUM_LOADERS, CATALOG, EAGER_PUZZLES, EAGER_SCENES } from 'virtual:nonogram-library'
import type { Difficulty, Puzzle, PuzzleData } from '../types'
import { deriveClues } from '../utils/clues'
import { createLazyLoads } from '../utils/lazyResource'
import { validatePuzzle } from '../utils/validator'
import { ALBUM_META } from './albums'
import { registerScene } from './scenes'
import { tierOf } from './tiers'

/*
 * 关卡库：一份随主包走的目录 + 十六个按需加载的册块（分包见 vite/nonogram-library.ts）。
 *
 * 从前这里 `import.meta.glob(..., { eager: true })` 把 578 关连同 578 份场景一次
 * 读进主包：开机就要解析 726KB 的 JSON，而首页第一屏真正要画的只有十六张封面
 * 和自己解锁过的那几张缩略图。
 *
 * 每一关先以**占位**的样子存在：id、尺寸、难度、名字都在，只有 solution 是空的
 * （`solution: []` 就是「这一关的画还没加载」的判据，见 isPuzzleLoaded）。册块到了，
 * 占位就地换成真关卡，订阅这个库的界面重画一次。
 *
 * **运行时不按需取。** 分块刚落地时的策略是「翻开哪一册才拉哪一册，页面先按占位
 * 排好版、画到了再填」，一周之内它在首页收藏架、收藏页、左缘返回三处各出了一次
 * 同一个 bug：页面已经在屏幕上，内容才到——而渲染与导航都假定页面挂上之后是静态的。
 * 现在全库在挂树之前取齐（见 libraryBoot.ts），占位在原生上永远不会出现在屏幕上；
 * 下面那几条「取到再翻页」的门（selectPuzzle / openAlbum / openCollection）只剩
 * 网页端弱网、开机那一趟到点放行之后才走得到。分块本身留着：主包小一点无害，
 * 只是不再拿它换任何运行时的行为。
 */

/**
 * 库序：先按难度大类，再按推理难度档（轻松 / 标准 / 烧脑），档内按 id 的数值序。
 *
 * 它**不是展示顺序**，一处都不是。册内顺序由 collections.json 的定稿决定（见
 * data/albums.ts 那段「卷—章」的说明）；首页、册页、收藏页与「下一关」全走
 * buildAlbums / albumOrder 那条线，没有一处读这里排出来的次序。这段注释从前写的是
 * 「排序只动展示与『下一关』的顺序」，改成画册版式那天起就不成立了。
 *
 * 那它还留着做什么：CATALOG 是构建期 readdirSync 扫出来的，目录序随文件系统走，
 * 换台机器就可能换一个次序。这里排一次，levelIds 与 puzzleLibrary() 才是一份跨机器
 * 可复现的清单——几十个测试按下标取样本正建在它上面。生产上没有一处观察得到
 * 这个次序（levelIds 只用来建 map 和逐个写 localStorage，两处都与先后无关），
 * 所以也不为「清爽」把它换掉：换一份不解决任何问题，只会让测试样本悄悄换一批。
 */
const DIFFICULTY_ORDER: Record<string, number> = { easy: 0, medium: 1, hard: 2 }
const TIER_ORDER: Record<string, number> = { gentle: 0, standard: 1, brainy: 2 }

const ordered = [...CATALOG].sort(
  (a, b) =>
    DIFFICULTY_ORDER[a.difficulty] - DIFFICULTY_ORDER[b.difficulty] ||
    (TIER_ORDER[tierOf(a.id) ?? 'brainy'] ?? 9) - (TIER_ORDER[tierOf(b.id) ?? 'brainy'] ?? 9) ||
    // numeric：序号超过两位后（medium-100）仍按数值排序，不能按字典序
    a.id.localeCompare(b.id, undefined, { numeric: true }),
)

/** 占位关卡：画还没来，但 id、尺寸、难度和名字都已经确定——书架与页码只认这些 */
const stubs: Puzzle[] = ordered.map((entry) => ({
  id: entry.id,
  name: entry.name,
  size: entry.size,
  difficulty: entry.difficulty as Difficulty,
  solution: [],
  clues: { rows: [], cols: [] },
  tags: [],
  author: '',
  createdAt: '',
}))

const stubById = new Map(stubs.map((stub) => [stub.id, stub]))

/** 全部关卡 id，库序（见上）。存档一开机就要按它对齐，所以它必须是稳定的一份 */
export const levelIds: string[] = stubs.map((puzzle) => puzzle.id)

const levelAlbum = new Map<string, string>()
for (const album of ALBUM_META) {
  for (const id of album.levels) levelAlbum.set(id, album.id)
}

/** 已经拿到画的关卡 */
const loaded = new Map<string, Puzzle>()

function hydrate(data: PuzzleData): Puzzle {
  return { ...data, clues: deriveClues(data.solution) }
}

// 开发期自检，防止绕过 validate-puzzles 脚本手塞坏关卡（见 PUZZLE_SPEC.md 7.5）。
// 从前在开机时一次校验全库，现在跟着册块走：拉哪一册校验哪一册，同一道门槛，
// 只是不再让每一次开机都付全库的钱。
// 查重要跨册：同一张画分到两本册子里，只在册内比对是看不出来的。
// 这份累积表随加载过的册一起长，翻到哪儿就查到哪儿
const checked: PuzzleData[] = []
const checkedIds = new Set<string>()

function selfCheck(batch: PuzzleData[]): void {
  if (!import.meta.env.DEV) return
  for (const puzzle of batch) {
    // 封面那几关随主包先到，自己那一册的块里还有一份——同一关不是重复
    if (checkedIds.has(puzzle.id)) continue
    const result = validatePuzzle(puzzle, checked)
    if (!result.ok) {
      throw new Error(`关卡 ${puzzle.id} 未通过校验:\n${result.errors.join('\n')}`)
    }
    checked.push(puzzle)
    checkedIds.add(puzzle.id)
  }
}

const listeners = new Set<() => void>()
let snapshot: Puzzle[] | null = null

function absorb(puzzles: PuzzleData[]): void {
  let added = false
  for (const data of puzzles) {
    if (loaded.has(data.id)) continue
    loaded.set(data.id, hydrate(data))
    added = true
  }
  if (!added) return
  snapshot = null
  for (const listener of listeners) listener()
}

// 封面那十六关随主包走：首页第一屏就要画出它们，等册块就等于开机先看一屏灰方块。
// 顺序与册块一致：先登记场景再放关卡——关卡一出现就会有人去查它的场景
selfCheck(EAGER_PUZZLES)
for (const scene of EAGER_SCENES) registerScene(scene)
absorb(EAGER_PUZZLES)

/** 全部关卡：已加载的给真关卡，其余给占位。顺序是库序，界面各页另按画册目录排 */
export function puzzleLibrary(): Puzzle[] {
  return (snapshot ??= stubs.map((stub) => loaded.get(stub.id) ?? stub))
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * 订阅关卡库。册块加载完成时整棵树重算一次——那正是缩略图从占位换成画的那一刻。
 *
 * 用 useSyncExternalStore 而不是把库塞进 Context：库是模块级的一份数据，
 * 谁都能读，只有「读到的是第几版」需要跟着 React 走。
 */
export function usePuzzleLibrary(): Puzzle[] {
  return useSyncExternalStore(subscribe, puzzleLibrary, puzzleLibrary)
}

/** 这一关的画到手了没有。占位的 solution 是空的，画不出任何东西 */
export function isPuzzleLoaded(id: string): boolean {
  return loaded.has(id)
}

export function getPuzzleById(id: string): Puzzle | undefined {
  return loaded.get(id) ?? stubById.get(id)
}

/** 只在真拿到画时才给：要开一局的地方不能拿占位去开 */
export function getLoadedPuzzle(id: string): Puzzle | undefined {
  return loaded.get(id)
}

/*
 * 成功留住、失败丢掉（见 utils/lazyResource）。
 *
 * 从前这里是一张裸的 `Map<册 id, Promise>`，拿到什么存什么。册块拉不回来
 * （弱网、部署换版本、CDN 掉一个块）之后，那个拒绝的 Promise 就一直躺在表里：
 * 后来每一次 ensureAlbumLoaded 拿到的都是它，加载器一次都不会再跑。表现是
 * 「书架和卡片都看得见，点某一关却毫无反应」，而且网络恢复了也还是没反应，
 * 只能整页重载。失败不进表之后，下一次点击就是一次真的重试。
 */
const albumLoads = createLazyLoads<string>()
/** 画已经到手的册。与 albumLoads.has 不同：在途的不算——要的是「现在就能画」 */
const albumsLoaded = new Set<string>()

/** 这一册的画到手了没有。库里没有这一册也算到手：没有东西可等 */
export function isAlbumLoaded(albumId: string): boolean {
  return albumsLoaded.has(albumId) || !ALBUM_LOADERS[albumId]
}

/**
 * 把一册的画与场景整块拉进来。同一册只拉一次，重复调用拿到的是同一个 Promise。
 *
 * 拉不到时如实拒绝，不在这一层吞掉：谁要用这一册，谁才知道该不该为它出提示
 * （点开一关要出，趁空预取的不出）。
 */
export function ensureAlbumLoaded(albumId: string): Promise<void> {
  const loader = ALBUM_LOADERS[albumId]
  if (!loader) return Promise.resolve()
  return albumLoads.load(albumId, () =>
    loader().then((album) => {
      selfCheck(album.puzzles)
      for (const scene of album.scenes) registerScene(scene)
      absorb(album.puzzles)
      albumsLoaded.add(albumId)
    }),
  )
}

export function ensureLevelLoaded(id: string): Promise<void> {
  const albumId = levelAlbum.get(id)
  return albumId ? ensureAlbumLoaded(albumId) : Promise.resolve()
}

/** 整库拉齐。开机那一趟（libraryBoot）、测试与全库自检都走它 */
export function loadAllAlbums(): Promise<void> {
  return Promise.all(Object.keys(ALBUM_LOADERS).map(ensureAlbumLoaded)).then(() => undefined)
}
