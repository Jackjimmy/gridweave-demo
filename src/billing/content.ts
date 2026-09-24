import { ALBUM_GROUP_META, ALBUM_META } from '../data/albums'

/**
 * 完整版（Full Game）里装着什么。
 *
 * 这一层**不重新划一遍免费与付费**。哪一摞白送、哪一摞属于完整版，2026-09-03
 * 定稿时就写在 `src/data/albums.ts` 的 `ALBUM_GROUPS` 里了（精选合集 100 关免费，
 * 其余三题 500 关属于完整版），那一栏当时就是留给内购的判断依据——首页与画册页
 * 上那枚 Free / Full Game 角标读的也是它。这里只是把同一份定稿翻译成三个问句，
 * 让 App 里每一处「这个要不要钱」都问同一张表。
 *
 * 唯一在 albums.ts 之外新增的一条是每日挑战：**今天那一期免费，往期属于完整版**。
 * 它不在画册目录里（每日关卡的 id 是 `daily-<date>`，与正式库 id 空间隔离，
 * 见 types/daily.ts），所以只能在这里定。
 */

/**
 * Play Console 里那件一次性商品的 id。
 *
 * **改这个字符串等于换一件商品**：已经买过的人手上那张收据认的是旧 id，
 * 换名之后 queryPurchases 再也匹配不上，全体买家静默掉档。要改只能在没有
 * 任何一笔真实交易之前改。
 */
export const FULL_GAME_PRODUCT_ID = 'nonogram.full_game'

const fullGameAlbums = new Set<string>()
const fullGameLevels = new Set<string>()
for (const meta of ALBUM_META) {
  if (ALBUM_GROUP_META[meta.group]?.tier !== 'full') continue
  fullGameAlbums.add(meta.id)
  for (const id of meta.levels) fullGameLevels.add(id)
}

/**
 * 完整版里有多少关、多少本册子。
 *
 * 由目录算出来，不写死：接一批新关进来时这两个数自己就跟上了，而付费墙上那句
 * 「再多 500 幅画」正是玩家会拿来对账的话——它比任何一处文案都不该过期。
 */
export const FULL_GAME_LEVEL_COUNT = fullGameLevels.size
export const FULL_GAME_ALBUM_COUNT = fullGameAlbums.size

/** 这个主题（首页那一横排上的一张卡）要不要买完整版 */
export function isFullGameGroup(group: string): boolean {
  return ALBUM_GROUP_META[group]?.tier === 'full'
}

/** 这本画册要不要买完整版 */
export function isFullGameAlbum(albumId: string): boolean {
  return fullGameAlbums.has(albumId)
}

/**
 * 这一关要不要买完整版。
 *
 * 目录里没点过名的 id 一律算免费，包括每日挑战那批 `daily-<date>`——它们走的是
 * 下面 isFullGameDaily 那条线。正式库里「有关卡但没进任何画册」是不允许的状态，
 * albums.test.ts 会拦下来，所以这里不必替那种情况兜底。
 */
export function isFullGameLevel(puzzleId: string): boolean {
  return fullGameLevels.has(puzzleId)
}

/**
 * 这一期每日挑战要不要买完整版：今天那一期白送，往期（Daily Archive）属于完整版。
 *
 * 判据是「是不是今天」而不是「有没有打过」：免费玩家每天都有一期可以打，
 * 昨天那期到了今天就归档——这正是完整版里那本「补打往期」的价值。
 * 日期一律走上海口径（shanghaiToday），与发布脚本、日历页同一把尺子。
 */
export function isFullGameDaily(date: string, today: string): boolean {
  return date !== today
}
