/**
 * 首页收藏架的布局模型。
 *
 * 0–20 幅时收藏区以两行 40px 格子为理想高度；实际画墙在这块稳定的区域里
 * 居中。前 16 幅在 335px 宽的手机上都能保持 40px，17 幅起只在横向确实装不下时
 * 缩小；21 幅之后回到十列铺满时的统一格子。
 *
 * 从前格子按"这几幅在窗口里最大能画多大"来定，稀疏时 40px、密了 37、再密 33，
 * 每过几关缩一档；区域高度跟着排法走，24 → 25 → 28 关时反而一路变矮，31 关
 * 又猛地拔高。首页其余部分按份额分富余，收藏架每变一次，字标、主题卡、底部入口
 * 全跟着挪。现在高度只在两个明确的节点升级：第 21 关（两行 → 三行）、
 * 第 31 关（三行 → 四行）。0 到 20 关一律两行高，1 关的那一幅画居中摆在里面。
 */

import { isDemoBuild } from '../config/demo'

/** 一行最多十幅；再多的画在解锁库里看。网页试玩只有 24 关，摆成 8×3 正好一面墙 */
export const SHELF_MAX_COLUMNS = isDemoBuild ? 8 : 10
/** 最多四行；到了这一步就是那面 10×4 的马赛克墙 */
export const SHELF_MAX_ROWS = isDemoBuild ? 3 : 4
/** 正常高屏上的视觉基线：不管解开几关，区域至少留两行的高度 */
export const SHELF_BASE_ROWS = 2
/** 画墙里格与格之间那条缝，全架只有这一个权威来源（CSS 通过 --collection-gap 取） */
export const COLLECTION_GAP = 1
/** 格子边长的上限：窗口再宽，缩略图也不再放大 */
export const SHELF_CELL_MAX = 40
/** 窗口摆满就是这个数 */
export const SHELF_CAPACITY = SHELF_MAX_COLUMNS * SHELF_MAX_ROWS

/** 露 rows 行时窗口摆得下多少幅。 */
export function shelfCapacity(rows: number): number {
  return SHELF_MAX_COLUMNS * rows
}

/**
 * 十列铺满时的基准格子边长，宽屏封顶。
 *
 * 它是三、四行档的实际尺寸，也是判断屏幕能露几行的安全尺寸；两行档的
 * 少量收藏可以在区域与横向宽度允许时放大到 40px（见 shelfDisplayCell）。
 */
export function shelfCell(width: number): number {
  return Math.min(
    SHELF_CELL_MAX,
    (width - (SHELF_MAX_COLUMNS - 1) * COLLECTION_GAP) / SHELF_MAX_COLUMNS,
  )
}

/**
 * 这一档的画墙实际用多大的格子。
 *
 * 两行基线里尽量保留 40px，但同时受横向宽度和实际分到的高度约束；
 * 三、四行仍用十列铺满的稳定尺寸，不让旧版“每多几幅就缩一档”的抖动回来。
 */
export function shelfDisplayCell(
  width: number,
  height: number,
  count: number,
  layout: ShelfLayout,
): number {
  const denseCell = shelfCell(width)
  if (layout.shown === 0 || layout.columns === 0 || layout.rows === 0) return denseCell
  if (shelfTierRows(count) > SHELF_BASE_ROWS) return denseCell

  const gridRows = Math.ceil(layout.shown / layout.columns)
  const byWidth = (width - (layout.columns - 1) * COLLECTION_GAP) / layout.columns
  const byHeight = (Math.max(0, height) - (gridRows - 1) * COLLECTION_GAP) / gridRows
  return Math.max(0, Math.min(SHELF_CELL_MAX, byWidth, byHeight))
}

/** 露 rows 行的画墙有多高（含行间的缝；0 行就是 0） */
export function shelfHeight(rows: number, cell: number): number {
  return rows <= 0 ? 0 : rows * cell + (rows - 1) * COLLECTION_GAP
}

/**
 * 解开这么多关时，正常高屏上区域该留几行。
 *
 * 0–20 关两行、21–30 关三行、31 关起四行：高度只在第 21、31 关升级，
 * 每一档都是"上一档摆满了才升"，不会因为多解一关先变矮再变高。
 */
export function shelfTierRows(count: number): number {
  return Math.min(SHELF_MAX_ROWS, Math.max(SHELF_BASE_ROWS, Math.ceil(count / SHELF_MAX_COLUMNS)))
}

/**
 * 按收藏区实际分到的空间决定能完整展示几行。
 *
 * 只按屏高分档会漏掉内容本身的变化：法语等语言的两行画册名会把主题卡撑高，
 * 同一台 812pt 的手机留给收藏架的高度便可能从四行变成三行。这里直接量窗口，
 * 装不下的那一行整行收起，避免半格缩略图与底部行动互相覆盖。
 *
 * 地板是 0 不是 1：一行都摆不下时整架收起。取 1 会让 320×480 这类极窄高度上
 * 分到十来个像素的窗口仍按一行摊开，露出被拦腰切断的一排缩略图——
 * 那正是这条规矩要防的东西，最后一行也不例外。
 *
 * 「量不到」只看宽：没排版（display: none、jsdom）时宽高一起是 0，那才是
 * 保持现状；宽正常、高被 flex 挤到 0 是一次真实的测量——375 高的横屏上
 * 正是这样，答案是 0 行整架收起，而不是当没量过、照旧把格子摆进 0 高的窗口。
 */
export function shelfRowsThatFit(width: number, height: number): number | undefined {
  if (!(width > 0) || Number.isNaN(height)) return undefined
  const cell = shelfCell(width)
  if (!(cell > 0)) return undefined
  const rows = Math.floor((Math.max(0, height) + COLLECTION_GAP) / (cell + COLLECTION_GAP))
  return Math.min(SHELF_MAX_ROWS, Math.max(0, rows))
}

export interface ShelfLayout {
  /** 区域露几行的高度；0 就是整架收起 */
  rows: number
  /** 首页摆几幅：装不下的从排序末尾裁掉，留下的永远是最靠前（最近解锁）的 */
  shown: number
  /** 画墙几列；0 幅时为 0 */
  columns: number
}

/**
 * 解开 count 关、区域最多能露 rowsAvailable 行时，首页这片画墙怎么摆。
 *
 * 行数取"这么多关该有的档位"与"这块屏幕装得下的行数"里小的那个；能摆的幅数
 * 就是这几行的容量，多出来的进解锁库。只显示完整行、完整格——数量先按行数截，
 * 父级的 overflow: hidden 只是安全网，不参与布局决策。
 *
 * 1–5 幅排成一行（区域仍是两行高，画居中）；6 幅起把行摆满，列数 = 幅数 ÷ 行数
 * 向上取整：6 关是 3×2、15 关是 8×2、20 关正好 10×2，21 关升成 7×3。
 */
export function shelfLayout(count: number, rowsAvailable: number): ShelfLayout {
  const rows = Math.max(0, Math.min(shelfTierRows(count), rowsAvailable))
  const shown = Math.min(count, shelfCapacity(rows))
  if (shown === 0) return { rows, shown, columns: 0 }
  const gridRows = shown <= SHELF_MAX_COLUMNS / 2 ? 1 : rows
  return { rows, shown, columns: Math.ceil(shown / gridRows) }
}
