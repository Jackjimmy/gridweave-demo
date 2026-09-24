import type { CSSProperties } from 'react'
import type { Clue, Clues } from '../../types'

export type ClueOrientation = 'row' | 'col'
export type ClueDensity = 'normal' | 'compact' | 'dense' | 'ultra'

const MIN_CLUE_FONT_PX = 8
const BORDER_BUDGET_PX = 4
const DIGIT_WIDTH_EM = 0.62

/*
 * 两轴的地板。原则是「常规关卡对称好看，极端关卡才放开」：
 *
 * 5×5 两轴同为 48px。这一档格子大、槽少，上、左一旦不等长眼睛立刻看得
 * 出来，美观在这里的权重高于那几个像素；它也确实盖得住全库 5×5 的需求。
 * 10×10 两轴的地板则降为 40px，给棋盘留出更多横向空间；超出地板的个别
 * 线索仍按实际需求扩展。
 *
 * 10×10 与 15×15 都开 balanceNearEqualGutters：上槽只比左槽多 2px 时把左槽
 * 补齐，换回常规关卡的视觉对称；差距更大时仍走单向规则，不为好看赔棋盘宽度。
 * 阈值取 2px 是因为槽宽恒为偶数，2px 是"几乎一样长却偏偏不一样"的唯一档位，
 * 而补齐它只花 2px 横向空间（10×10 每格 0.2px）。这条对两档一视同仁，不是
 * 某一档的特例——虽然按当前题库只有 10×10 真的会触发（265 关），15×15 一关
 * 都没有 2px 差，那里开着是为将来的新内容兜底。
 *
 * 5×5 再多一条 coupled：两槽**双向**取同一个数。它只有 22 关，其中 4 关
 * （太阳、雪花、除号、欧元符号）有 [1,1,1] 竖线索、列需求 61.2px；这一档
 * 格子最大、线索最少，左右不等长一眼就看得出来，那几像素的横向宽度换不来
 * 这个代价。10×10 与 15×15 不走这条，用下面的单向规则。
 *
 * 15×15 才真正缺横向像素，两轴分开给 28 / 40px。左槽 28px 不是拍脑袋：
 * 单数字行线索在 12px 基准字号下要 4 + 6×2 + 12 = 28px。从前给 24px 时，
 * 运行时 getClueLayout 对单数字按 max(1, 位数×0.62)=1em 分配，而这里的静态
 * 预算按 0.62em 估，两套单位对不上，24px 的槽会把字号一路压到 8px 下限
 * （每日「小提琴」15 条行线索全是单数字，正是这么被压的）。
 * 地板抬到 28px 把这个缺口补上；哪天改了 15×15 的基准字号，这个数要跟着改。
 */
const SIZE_METRICS: Record<
  number,
  {
    baseFontPx: number
    minRowGutterPx: number
    minColGutterPx: number
    coupled?: boolean
    balanceNearEqualGutters?: boolean
  }
> = {
  5: { baseFontPx: 16, minRowGutterPx: 48, minColGutterPx: 48, coupled: true },
  10: { baseFontPx: 13, minRowGutterPx: 40, minColGutterPx: 40, balanceNearEqualGutters: true },
  15: { baseFontPx: 12, minRowGutterPx: 28, minColGutterPx: 40, balanceNearEqualGutters: true },
}

const DENSITY_METRICS: Record<
  ClueDensity,
  { fontScale: number; lineHeight: number; gapPx: number; rowPaddingPx: number; colPaddingPx: number }
> = {
  normal: { fontScale: 1, lineHeight: 1, gapPx: 4, rowPaddingPx: 6, colPaddingPx: 4 },
  compact: { fontScale: 0.94, lineHeight: 0.98, gapPx: 2.5, rowPaddingPx: 5, colPaddingPx: 4 },
  dense: { fontScale: 0.86, lineHeight: 0.95, gapPx: 1.5, rowPaddingPx: 4, colPaddingPx: 3 },
  ultra: { fontScale: 0.78, lineHeight: 0.92, gapPx: 1, rowPaddingPx: 3, colPaddingPx: 2 },
}

export interface ClueLayout {
  density: ClueDensity
  segmentCount: number
  digitCount: number
  fontScale: number
  fitFontPx: number
  lineHeight: number
  gapPx: number
  paddingPx: number
  style: CSSProperties
}

function densityFor(segmentCount: number): ClueDensity {
  if (segmentCount <= 2) return 'normal'
  if (segmentCount === 3) return 'compact'
  if (segmentCount === 4) return 'dense'
  return 'ultra'
}

function digitCount(clue: Clue): number {
  return clue.reduce((total, value) => total + String(value).length, 0)
}

/**
 * 计算单组线索的密度与轴向预算。列按行高累计，行按 tabular 数字宽度累计；
 * fitFontPx 是该组在实际 gutter 内不越界的字号上限，最终还会由 CSS 的响应式
 * --clue-font（随 cell size 变化）再次限幅。
 */
export function getClueLayout(
  clue: Clue,
  orientation: ClueOrientation,
  availableAxisPx: number,
): ClueLayout {
  const segmentCount = clue.length
  const digits = digitCount(clue)
  const density = densityFor(segmentCount)
  const metrics = DENSITY_METRICS[density]
  const paddingPx = orientation === 'row' ? metrics.rowPaddingPx : metrics.colPaddingPx
  const fixedPx = BORDER_BUDGET_PX + paddingPx * 2 + metrics.gapPx * Math.max(0, segmentCount - 1)
  const contentPx = Math.max(0, availableAxisPx - fixedPx)
  const fontUnits =
    orientation === 'col'
      ? segmentCount * metrics.lineHeight
      : Math.max(1, digits * DIGIT_WIDTH_EM)
  const fitFontPx = Math.max(MIN_CLUE_FONT_PX, contentPx / fontUnits)

  return {
    density,
    segmentCount,
    digitCount: digits,
    fontScale: metrics.fontScale,
    fitFontPx,
    lineHeight: metrics.lineHeight,
    gapPx: metrics.gapPx,
    paddingPx,
    style: {
      '--clue-font-scale': metrics.fontScale,
      '--clue-fit-font': `${fitFontPx}px`,
      '--clue-line-height': metrics.lineHeight,
      '--clue-gap': `${metrics.gapPx}px`,
      '--clue-padding-axis': `${paddingPx}px`,
    } as CSSProperties,
  }
}

/** 这条线索在轴向上至少要占多少 px（含内边距与缝）。槽宽由它定。 */
function requiredAxisPx(clue: Clue, orientation: ClueOrientation, baseFontPx: number): number {
  const density = densityFor(clue.length)
  const metrics = DENSITY_METRICS[density]
  const paddingPx = orientation === 'row' ? metrics.rowPaddingPx : metrics.colPaddingPx
  const fixedPx = BORDER_BUDGET_PX + paddingPx * 2 + metrics.gapPx * Math.max(0, clue.length - 1)
  const fontPx = Math.max(MIN_CLUE_FONT_PX, baseFontPx * metrics.fontScale)
  const contentPx =
    orientation === 'col'
      ? clue.length * fontPx * metrics.lineHeight
      : digitCount(clue) * fontPx * DIGIT_WIDTH_EM
  return fixedPx + contentPx
}

/**
 * 以当前关卡最极端的行/列为准扩展线索槽，避免靠无限缩字处理理论极端。
 *
 * 两轴的耦合是**单向**的（5×5 除外，那一档双向全等，见 SIZE_METRICS）：
 * 上槽可以比左槽长，左槽不许比上槽长。
 *
 *   左槽 = max(地板, 本关最长行线索)
 *   上槽 = max(地板, 本关最长列线索, 左槽)
 *
 * 两个方向不对等，是因为两轴的像素不等价：左槽吃横向，棋盘宽度直接从
 * 100dvw 里扣它，宽 1px 全屏就少 1px 画面；上槽吃纵向，那边一向富余。所以
 *
 *   上槽跟着长线索长——不花钱。每日第 341 期「甘蔗」6 段竖线索把上槽撑到
 *   64px，左槽守住 36px，格子 19.0→21.0px、棋盘宽 285→315px，这正是分轴
 *   要保住的收益，不能为了对称把它还回去；
 *   左槽长出来时把上槽补齐到同长——只加纵向、不动横向，代价为零，换回对称；
 *   反向绝不做：为对称把左槽拉宽到上槽那么长，等于拿棋盘宽度买好看。
 *
 * 全库 836 关实测（2026-08-21）：单向补齐在 15×15 触发 23 关、10×10 触发 34 关；
 * 2px 近似补齐触发 265 关，全在 10×10。补齐之后 10×10 的左右等长率回到 76.7%
 * （与从前 48px 地板持平），而两槽差值只剩 0 或 ≥4px——那个「几乎一样长却偏偏
 * 差一点」的 2px 档位整个消失。证据见 CLUE_LAYOUT_CHANGE_EVIDENCE.md。
 */
export function getPuzzleClueLayout(
  clues: Clues,
  size: number,
  options: PuzzleClueLayoutOptions = {},
): PuzzleClueLayout {
  const preset = SIZE_METRICS[size] ?? {
    baseFontPx: 12,
    minRowGutterPx: 28,
    minColGutterPx: 40,
  }
  /*
   * 放大只动三个「像素量」：基准字号与两轴地板。密度表里的内边距与缝是按字号
   * 附近的几个像素定的，跟着字号一起放会把槽撑得松散，所以不动它们。
   */
  const scale = options.scale ?? 1
  const sizeMetrics = {
    ...preset,
    baseFontPx: preset.baseFontPx * scale,
    minRowGutterPx: preset.minRowGutterPx * scale,
    minColGutterPx: preset.minColGutterPx * scale,
  }
  const rowRequired = clues.rows.map((clue) => requiredAxisPx(clue, 'row', sizeMetrics.baseFontPx))
  const colRequired = clues.cols.map((clue) => requiredAxisPx(clue, 'col', sizeMetrics.baseFontPx))
  const rowMax = Math.max(sizeMetrics.minRowGutterPx, ...rowRequired)
  const colMax = Math.max(sizeMetrics.minColGutterPx, ...colRequired)

  // 5×5：两槽双向取同一个数，左右全等
  if (sizeMetrics.coupled) {
    const sharedPx = evenCeil(Math.max(rowMax, colMax))
    return { rowGutterPx: sharedPx, colGutterPx: sharedPx, baseFontPx: sizeMetrics.baseFontPx }
  }

  const rowNearestPx = evenNearest(rowMax)
  const canUseNearestRow = clues.rows.every((clue) =>
    fitsAtMinimumFont(clue, 'row', rowNearestPx),
  )
  const rowFittedPx = canUseNearestRow ? rowNearestPx : evenCeil(rowMax)

  const colNearestPx = evenNearest(colMax)
  const canUseNearestCol = clues.cols.every((clue) =>
    fitsAtMinimumFont(clue, 'col', colNearestPx),
  )
  const colFittedPx = canUseNearestCol ? colNearestPx : evenCeil(colMax)
  const colGutterPx = Math.max(colFittedPx, rowFittedPx)
  const shouldBalanceNearEqualGutters =
    sizeMetrics.balanceNearEqualGutters && colGutterPx - rowFittedPx <= 2

  return {
    // 10×10：只差 2px 时补齐，恢复常规关卡的对称感；更大差距仍保住棋盘宽度。
    rowGutterPx: shouldBalanceNearEqualGutters ? colGutterPx : rowFittedPx,
    // 单向补齐；两个偶数取 max 仍是偶数，通关位移不会落到半像素上
    colGutterPx,
    baseFontPx: sizeMetrics.baseFontPx,
  }
}

export interface PuzzleClueLayout {
  rowGutterPx: number
  colGutterPx: number
  baseFontPx: number
}

export interface PuzzleClueLayoutOptions {
  /**
   * 线索整体放大的倍率（默认 1）。网页试玩在宽裕的横屏上用它把线索放到桌面尺度
   * （见 config/demo.ts 的 demoRoom，倍率随视口连续走）：手机上把左槽压窄是被棋盘
   * 宽度逼的，桌面浏览器没有这个约束。CSS 那头的 --clue-font 上限要同步抬高，
   * 否则字号在这里放开了又被那道 clamp 压回去。
   */
  scale?: number
}

/*
 * 槽位取偶数：通关后棋盘要靠 translate(-左槽/2, -上槽/2) 抵消线索槽回到画面正中，
 * 槽宽为奇数时这个位移落在半个 CSS 像素上，整幅画会被重采样发虚。
 * 两槽都优先取最近偶数，避免 48.x 这类需求平白多出 2px。
 * 某槽若最近偶数连 8px 的最低字号也放不下，则回退向上取偶数。
 * 单向补齐在两者都取偶之后才做，因此结果仍是偶数。
 *
 * 那条回退按当前的 SIZE_METRICS / DENSITY_METRICS **走不到**：穷举全部
 * 密度、段数与位数组合，最近偶数与 8px 最低需求之间的余量最小是 0.000px
 * （10×10 的单数字行线索），没有一组为负。别因此把它当死代码删掉——余量
 * 恰好是零，说明它离够得着只差一根头发：DIGIT_WIDTH_EM、任何一档 baseFontPx
 * 或 MIN_CLUE_FONT_PX 动一点点就会变成负数。守卫留着，代价是零；
 * clueLayout.test.tsx 里有一条全库不变式测试钉住这件事。
 */
function evenCeil(px: number): number {
  return 2 * Math.ceil(px / 2)
}

function evenNearest(px: number): number {
  return 2 * Math.round(px / 2)
}

/** 最近偶数可能略低于理论需求；只要最低字号仍能放下，就允许由单条线索缩字兜底。 */
function fitsAtMinimumFont(
  clue: Clue,
  orientation: ClueOrientation,
  availableAxisPx: number,
): boolean {
  const density = densityFor(clue.length)
  const metrics = DENSITY_METRICS[density]
  const paddingPx = orientation === 'row' ? metrics.rowPaddingPx : metrics.colPaddingPx
  const fixedPx = BORDER_BUDGET_PX + paddingPx * 2 + metrics.gapPx * Math.max(0, clue.length - 1)
  const fontUnits =
    orientation === 'col'
      ? clue.length * metrics.lineHeight
      : Math.max(1, digitCount(clue) * DIGIT_WIDTH_EM)
  const minimumContentPx = MIN_CLUE_FONT_PX * fontUnits
  return fixedPx + minimumContentPx <= availableAxisPx
}
