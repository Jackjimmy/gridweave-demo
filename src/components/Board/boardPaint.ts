/**
 * 对局盘面的像素数学与配色。
 *
 * 这里的每一个数都以**物理像素**为单位，且都是整数。整块盘面（格底、网格线、
 * 高亮、提示）由 BoardCanvas 按这套坐标画在同一张 canvas 上，因此不存在
 * 「格子按自己的规则取整、网格线按另一套规则抗锯齿」这种分叉——那正是
 * DOM 盒子 + SVG 覆盖层的老画法在 DPR 3 上露缝、发虚的根因。
 *
 * 同一套思路 RevealCanvas 早就用在胜利画面上了（见那边的头注释）。
 */

export type Rgb = [number, number, number]
export type Rgba = [number, number, number, number]

/** 不同棋盘密度的网格线宽（CSS px）。5×5 没有五格分隔线，major 不会实际用到。 */
export const GRID_STROKE_WIDTHS: Record<number, { normal: number; major: number }> = {
  5: { normal: 1, major: 1 },
  10: { normal: 0.75, major: 1.5 },
  15: { normal: 0.6, major: 1.2 },
}

const FALLBACK_STROKE_WIDTHS = { normal: 1, major: 2 }

export function gridStrokeWidths(size: number): { normal: number; major: number } {
  return GRID_STROKE_WIDTHS[size] ?? FALLBACK_STROKE_WIDTHS
}

/**
 * 线宽量化到整数个物理像素，至少 1。
 *
 * 设计值是 0.6~1.5 CSS px，在 DPR 3 上等于 1.8~4.5 个物理像素。不量化就必然
 * 摊在相邻两列像素上、各覆盖一部分——那是「线看着发灰发虚」的来源，
 * 与位置对不对齐是两回事。
 */
export function quantizeLineWidth(cssWidth: number, dpr: number): number {
  return Math.max(1, Math.round(cssWidth * dpr))
}

/**
 * 第 index 条格边在物理像素里的位置。
 *
 * 用 round(index · extent / size) 而不是 index · round(extent / size)：
 * 前者让 size 条格子把 extent 恰好分完，不会在最后一格攒出累积误差，
 * 相邻格的边界又共用同一个整数，因此既没有缝也没有重叠。
 */
export function boundaryAt(extentDevicePx: number, size: number, index: number): number {
  return Math.round((index * extentDevicePx) / size)
}

/**
 * 一条格边线要填的矩形（沿线方向的那一维）。
 *
 * 线压在格边上，宽度为奇数个物理像素时无法左右对称，这里让它向下/向右多占
 * 半个像素——偏移半个物理像素肉眼看不出来，而「填的是整数个像素」保证了它一定锐利。
 */
export function lineSpan(boundary: number, width: number): { start: number; width: number } {
  return { start: boundary - Math.floor(width / 2), width }
}

/*
 * × 标记的两笔。
 *
 * 从前这一笔是 fillText('×')，textBaseline: 'middle'。那条基线量的不是字形的墨迹，
 * 而是字体自报的 em 盒中线（ascent/descent），于是「× 落在格子哪个高度」取决于
 * 用的是哪一款字体。同一段代码、同一个引擎（Chromium），只换字体，
 * × 的墨迹中心相对格心实测如下：
 *
 *     格边长        SF Pro（iOS）   Roboto（安卓）   Hiragino（CJK）
 *      38px         偏下 3px          0              0
 *      60px         偏下 3.5px       -0.5px          0
 *     127px         偏下 8px         -1px           +0.5px
 *
 * 字体栈在两端解析出来的不是同一款字（iOS 是 -apple-system=SF Pro，安卓一路落到
 * Roboto 或国产 ROM 的 CJK 默认字体），所以同一格 × 在安卓偏上、在 iOS 偏下。
 * 引擎对 'middle' 取哪一套 ascent/descent 也各有各的实现，又叠一层。
 *
 * × 本来就是两笔直线，没有任何理由绕道字形：这里按格子边长直接算出半臂长与
 * 笔画粗细，几何居中，与字体、与引擎都无关。比例照着原来的字形量：
 * 墨迹外接方 0.32 格、笔画粗 0.067 格（SF Pro 与 Roboto 实测一致）。
 * 圆头与操作条上那枚 × 图标（两条 24×3、border-radius 2 的圆头细条）同一套画法。
 */
export const MARK_EXTENT_RATIO = 0.32
export const MARK_STROKE_RATIO = 0.067

/**
 * 一格里那个 × 的半臂长与笔画粗细（物理像素）。
 *
 * 半臂长按「圆头画完之后的外接方正好是 MARK_EXTENT_RATIO 格」倒推：圆头会在两端
 * 各多出半个笔宽，不扣掉的话小格子上的 × 会比从前那个字形明显胖一圈。
 */
export function markGeometry(cellDevicePx: number): { arm: number; width: number } {
  const width = Math.max(1, Math.round(cellDevicePx * MARK_STROKE_RATIO))
  const arm = Math.max(0.5, (cellDevicePx * MARK_EXTENT_RATIO - width) / 2)
  return { arm, width }
}

/** 解析 #rgb / #rrggbb / rgb() / rgba()，逗号与空格分隔都认，alpha 支持小数和百分比 */
export function parseCssColor(input: string): Rgba | null {
  const value = input.trim()
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (hex) {
    const body = hex[1]
    const full =
      body.length === 3
        ? body
            .split('')
            .map((ch) => ch + ch)
            .join('')
        : body
    const n = parseInt(full, 16)
    return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff, 1]
  }
  const rgb = value.match(
    /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+)(%?))?\s*\)$/i,
  )
  if (!rgb) return null
  const alpha = rgb[4] === undefined ? 1 : Number(rgb[4]) / (rgb[5] === '%' ? 100 : 1)
  return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), alpha]
}

/** 把带 alpha 的前景压到不透明底色上，得到一个不透明色。 */
export function compositeOver(front: Rgba, back: Rgb): Rgb {
  const a = front[3]
  return [
    Math.round(front[0] * a + back[0] * (1 - a)),
    Math.round(front[1] * a + back[1] * (1 - a)),
    Math.round(front[2] * a + back[2] * (1 - a)),
  ]
}

/** 两个不透明色之间线性插值，t 会被夹到 [0,1]。 */
export function mixRgb(from: Rgb, to: Rgb, t: number): Rgb {
  const k = t <= 0 ? 0 : t >= 1 ? 1 : t
  return [
    Math.round(from[0] + (to[0] - from[0]) * k),
    Math.round(from[1] + (to[1] - from[1]) * k),
    Math.round(from[2] + (to[2] - from[2]) * k),
  ]
}

export function rgbCss(rgb: Rgb): string {
  return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`
}
