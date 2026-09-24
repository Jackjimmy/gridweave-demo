import { fitNameFontSize } from '../../utils/fitFontSize'

/** 空格不绘制，但要占住字距；用不换行空格占位，避免被 measureText 折叠掉 */
export const NBSP = ' '

/**
 * 字号下界。再小就不成其为标题了。
 *
 * 达到下界仍放不下的本地名称交回 DOM 换行，不删减名称或继续缩字。
 */
export const MIN_WORD_FONT_PX = 20

/**
 * 画布左右各预留的余量。
 *
 * 字形入场时会放大到 1.08 倍，首尾两个字的墨迹因此会向外多占半个字宽的 4%。
 * DOM 时代这点溢出无害（h2 不裁剪），画布会直接裁掉，所以排版时先让出来。
 */
export const WORD_EDGE_PADDING_PX = 2

export interface WordGlyph {
  /** 真正画上去的字符 */
  drawable: string
  width: number
  /** 相对画布左边缘的中心横坐标 */
  centerX: number
}

export interface WordLayout {
  /** 单行画布装不下时，调用方必须改用可换行文本。 */
  needsWrap: boolean
  /** 收敛后的字号；放得下时就是基准字号 */
  fontPx: number
  /** 收敛后的字距，按字号等比缩过 */
  spacing: number
  totalWidth: number
  glyphs: WordGlyph[]
}

/**
 * 结算卡上那个单词的排版：字号、字距、每个字形的宽度与中心位置。
 *
 * **为什么要自己排版**：整段动画画在一张 canvas 上（见 WinModal 的 WordReveal），
 * 而 canvas 只认坐标，不认布局。代价是浏览器的两件事都得自己补上：
 *
 *   换行——画布保持单行；到字号下界仍装不下时由 needsWrap 通知调用方
 *          改用 DOM。结算卡已有实际高度测量，棋盘按新高度让位。
 *   裁剪——canvas 会把越界的墨迹直接切掉，不像 h2 那样任其溢出。
 *          所以左右预留 WORD_EDGE_PADDING_PX，上下由 CSS 的画布出血负责。
 *
 * 不这么做的后果是实测过的：34px 下「T4 Bacteriophage」在 360px 屏上要 327.7px，
 * 而卡片内容宽只有 312px，首尾两个字母被齐边切掉。
 *
 * measureGlyph(fontPx, glyph) 返回该字号下单个字形的步进宽度，由调用方接到真实 canvas 上。
 */
export function layoutWord(
  measureGlyph: (fontPx: number, glyph: string) => number,
  word: string,
  options: {
    /** 基准字号（CSS 上写的那个） */
    basePx: number
    /** 基准字号下的字距（letter-spacing 的计算值） */
    baseSpacing: number
    /** 画布宽度 */
    boxWidth: number
    minPx?: number
    edgePadding?: number
  },
): WordLayout {
  const { basePx, baseSpacing, boxWidth } = options
  const minPx = options.minPx ?? MIN_WORD_FONT_PX
  const edgePadding = options.edgePadding ?? WORD_EDGE_PADDING_PX

  const drawables = [...word].map((letter) => (letter === ' ' ? NBSP : letter))
  const gaps = Math.max(0, drawables.length - 1)

  // 字距是 em 单位写的，收字号时要跟着一起收，否则字缩了间距没缩
  const spacingAt = (fontPx: number) => (basePx > 0 ? (baseSpacing * fontPx) / basePx : baseSpacing)
  const widthsAt = (fontPx: number) => drawables.map((glyph) => measureGlyph(fontPx, glyph))
  const sum = (widths: number[], fontPx: number) =>
    widths.reduce((total, width) => total + width, 0) + spacingAt(fontPx) * gaps

  const available = Math.max(0, boxWidth - edgePadding * 2)
  const fontPx = fitNameFontSize((size) => sum(widthsAt(size), size), basePx, available, minPx)

  const widths = widthsAt(fontPx)
  const spacing = spacingAt(fontPx)
  const totalWidth = sum(widths, fontPx)

  let cursor = (boxWidth - totalWidth) / 2
  const glyphs = drawables.map((drawable, index) => {
    const width = widths[index]
    const centerX = cursor + width / 2
    cursor += width + spacing
    return { drawable, width, centerX }
  })

  return { fontPx, spacing, totalWidth, glyphs, needsWrap: boxWidth > 0 && totalWidth > available }
}
