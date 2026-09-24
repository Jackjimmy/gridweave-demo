import { useEffect, useRef, useState } from 'react'
import type { Board, CellState } from '../../types'
import type { CellPosition } from '../../hooks/usePointerInput'
import type { HintView } from './hintView'
import {
  boundaryAt,
  compositeOver,
  gridStrokeWidths,
  lineSpan,
  markGeometry,
  mixRgb,
  parseCssColor,
  quantizeLineWidth,
  rgbCss,
} from './boardPaint'
import type { Rgb } from './boardPaint'
import styles from './Board.module.css'

interface Props {
  board: Board
  hovered: CellPosition | null
  /** 提示要点亮的行列；幽灵条不在这里画，它是 DOM 层（见 HintOverlay） */
  hint: HintView | null
  /**
   * 已对齐到整数物理像素的格边长（CSS px，见 useSnappedCellSize）。
   *
   * 这里不拿它做算术——几何一律现量。它是**重排信号**：这张 canvas 的盒子由
   * --cell-size 决定，而本组件是 Game 的后代、layout effect 先于 Game 跑，
   * 首帧量到的必然是还没对齐的旧值。若只靠 ResizeObserver 去纠正，页面不可见
   * 时它不投递，backing store 就一直停在旧尺寸上被拉伸——格宽重新在相邻两个
   * 整数之间跳，正好把这次要消灭的伪影原样带回来。
   */
  cellSize: number | null
  /** 拿不到 2d 上下文时通知调用方退回 DOM 画法 */
  onUnavailable: () => void
}

/** 落子那一下的背景淡入时长，与从前 .cell 上那条 CSS 过渡一致 */
const FADE_MS = 100

interface Palette {
  surface: Rgb
  fill: Rgb
  highlight: Rgb
  mark: string
  gridLine: string
  gridLineStrong: string
  /* 两侧都是填色格的那一段格线用的墨，见 tokens.css --color-grid-line-on-fill */
  gridLineOnFill: string
  gridLineStrongOnFill: string
  accentRgb: string
  accent: string
}

function readPalette(canvas: HTMLCanvasElement): Palette {
  const cs = getComputedStyle(canvas)
  const read = (name: string) => cs.getPropertyValue(name).trim()
  const surface = parseCssColor(read('--color-surface')) ?? [255, 255, 255, 1]
  const fill = parseCssColor(read('--color-fill')) ?? [59, 74, 104, 1]
  const soft = parseCssColor(read('--color-accent-soft')) ?? [59, 130, 246, 0.14]
  const surfaceRgb: Rgb = [surface[0], surface[1], surface[2]]
  return {
    surface: surfaceRgb,
    fill: [fill[0], fill[1], fill[2]],
    // 高亮在 DOM 里是半透明底色压在板底上，这里先压成不透明色，淡入才好插值
    highlight: compositeOver(soft, surfaceRgb),
    mark: read('--color-mark') || '#45536f',
    gridLine: read('--color-grid-line') || 'rgba(23,25,31,0.55)',
    gridLineStrong: read('--color-grid-line-strong') || '#17191f',
    gridLineOnFill: read('--color-grid-line-on-fill') || read('--color-grid-line') || 'rgba(23,25,31,0.55)',
    gridLineStrongOnFill:
      read('--color-grid-line-strong-on-fill') || read('--color-grid-line-strong') || '#17191f',
    accentRgb: read('--color-accent-rgb') || '59, 130, 246',
    accent: read('--color-accent') || '#3b82f6',
  }
}

/** 一格的目标底色：填色格用 --color-fill，空格/标记格只有被十字高亮时才变 */
function targetColor(state: CellState, highlighted: boolean, palette: Palette): Rgb {
  if (state === 'filled') return palette.fill
  return highlighted ? palette.highlight : palette.surface
}

/**
 * 一条格线分段落墨：沿线走一遍，把同色的相邻段并成一段再交给 fill 画。
 *
 * onFillAt(k) 回答第 k 段两侧是不是都是填色格——是就用 onFill 那一支墨。
 * boundaries 是这条线**横过去**那一轴的格边（竖线看 by、横线看 bx），
 * 段 k 从 boundaries[k] 到 boundaries[k + 1]，与格底用的是同一组整数，
 * 所以线段的两头永远落在格边上，不会比格底多出或少掉半个物理像素。
 */
function paintSeam(
  context: CanvasRenderingContext2D,
  size: number,
  boundaries: number[],
  base: string,
  onFill: string,
  onFillAt: (k: number) => boolean,
  fill: (start: number, end: number) => void,
) {
  let start = 0
  let current = onFillAt(0)
  for (let k = 1; k <= size; k++) {
    const next = k < size ? onFillAt(k) : !current
    if (next === current) continue
    context.fillStyle = current ? onFill : base
    fill(boundaries[start], boundaries[k])
    start = k
    current = next
  }
}

/**
 * 对局盘面的绘制层。
 *
 * 从前盘面由四条互不相干的光栅化路径拼出来：225 个 DOM 盒子各自按物理像素取整、
 * 网格线是一张 SVG 覆盖层走自己的抗锯齿、外框是容器的 CSS border、提示又是一叠
 * 绝对定位的 div。四者对「第 k 条格边在哪」各算各的，任何一条差半个物理像素就是
 * 一道缝或一条发虚的线——DPR 3 的机器上尤其躲不掉。
 *
 * 现在格底、× 标记、十字高亮、提示高亮和网格线全部由 boardPaint 那一套整数物理
 * 像素坐标画在同一张 canvas 上：相邻格共用同一个整数边界，网格线压在同一个整数
 * 边界上且宽度也是整数个物理像素，分叉没有了发生的余地。
 *
 * 这正是 RevealCanvas 当初为胜利画面选的路子（见那边的头注释），只是对局态一直
 * 还留在 DOM 上。落子那 100ms 的淡入是手感、必须留着，因此在绘制循环里重做了一遍：
 * 拖动中只有变成填色的格子淡入，空格与标记格直接落位——与从前 [data-dragging]
 * 摘掉过渡的行为一致。
 *
 * DOM 那 225 个格子仍然留着，但对局态里被这张不透明的 canvas 完全盖住：
 * 它们只承担无障碍（role=gridcell 与 aria-label）和指针命中，不再出像素。
 */
export function BoardCanvas({ board, hovered, hint, cellSize, onUnavailable }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // <html data-theme> 换了要重读配色；主题不走 props，只能自己盯着
  const [theme, setTheme] = useState<string | undefined>(
    typeof document === 'undefined' ? undefined : document.documentElement.dataset.theme,
  )

  useEffect(() => {
    const root = document.documentElement
    const observer = new MutationObserver(() => setTheme(root.dataset.theme))
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  const size = board.length
  // 绘制状态放 ref：每帧只做算术，不触发 React 渲染
  const shownRef = useRef<Rgb[]>([])
  const fromRef = useRef<Rgb[]>([])
  const startedAtRef = useRef<Float64Array>(new Float64Array(0))
  const targetRef = useRef<Rgb[]>([])
  const frameRef = useRef<number | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || size <= 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      // 极老 WebView 拿不到 2d 上下文：交回 DOM 画法，别把盘面画没了
      onUnavailable()
      return
    }

    const palette = readPalette(canvas)
    const count = size * size
    /*
     * 首帧（进关、换尺寸）一律直接落位，不淡入。带预置 × 或预置填色的关卡若从
     * 板底淡进来，等于进关就先放一段没人要的动画——DOM 时代初始渲染本来也不跑过渡。
     */
    const firstPaint = targetRef.current.length !== count
    if (firstPaint) {
      shownRef.current = new Array<Rgb>(count).fill(palette.surface)
      fromRef.current = new Array<Rgb>(count).fill(palette.surface)
      targetRef.current = new Array<Rgb>(count).fill(palette.surface)
      startedAtRef.current = new Float64Array(count).fill(Number.NEGATIVE_INFINITY)
    }

    // 拖动中空格/标记格不淡入，与从前 [data-dragging] 摘掉过渡的行为一致
    const dragging = canvas.closest('[data-dragging]') !== null
    const now = performance.now()
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const index = row * size + col
        const state = board[row][col]
        const highlighted =
          hovered !== null && state !== 'filled' && (hovered.row === row || hovered.col === col)
        const next = targetColor(state, highlighted, palette)
        const prev = targetRef.current[index]
        if (prev[0] === next[0] && prev[1] === next[1] && prev[2] === next[2]) continue
        targetRef.current[index] = next
        if (firstPaint || (dragging && state !== 'filled')) {
          shownRef.current[index] = next
          startedAtRef.current[index] = Number.NEGATIVE_INFINITY
        } else {
          fromRef.current[index] = shownRef.current[index]
          startedAtRef.current[index] = now
        }
      }
    }

    let geometry = { w: 0, h: 0, dpr: 0, bx: [] as number[], by: [] as number[] }

    function layout(target: HTMLCanvasElement) {
      const dpr = window.devicePixelRatio || 1
      const rect = target.getBoundingClientRect()
      const w = Math.round((rect.width || target.clientWidth) * dpr)
      const h = Math.round((rect.height || target.clientHeight) * dpr)
      if (target.width !== w || target.height !== h) {
        target.width = w
        target.height = h
      }
      const bx: number[] = []
      const by: number[] = []
      for (let i = 0; i <= size; i++) {
        bx.push(boundaryAt(w, size, i))
        by.push(boundaryAt(h, size, i))
      }
      geometry = { w, h, dpr, bx, by }
    }

    function ring(
      context: CanvasRenderingContext2D,
      x: number,
      y: number,
      w: number,
      h: number,
      thickness: number,
    ) {
      const t = Math.min(thickness, Math.floor(w / 2), Math.floor(h / 2)) || 1
      context.fillRect(x, y, w, t)
      context.fillRect(x, y + h - t, w, t)
      context.fillRect(x, y + t, t, h - t * 2)
      context.fillRect(x + w - t, y + t, t, h - t * 2)
    }

    function paint(context: CanvasRenderingContext2D, at: number) {
      const { w, h, dpr, bx, by } = geometry
      if (w <= 0 || h <= 0) return false
      let animating = false

      // 1. 格底。整块铺满，因此下方的 DOM 格子一个像素都透不出来。
      for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
          const index = row * size + col
          const startedAt = startedAtRef.current[index]
          const elapsed = at - startedAt
          let color = targetRef.current[index]
          if (elapsed < FADE_MS) {
            color = mixRgb(fromRef.current[index], color, elapsed / FADE_MS)
            animating = true
          }
          shownRef.current[index] = color
          context.fillStyle = rgbCss(color)
          context.fillRect(bx[col], by[row], bx[col + 1] - bx[col], by[row + 1] - by[row])
        }
      }

      /*
       * 2. × 标记：两笔直线，不走字形。
       *
       * 字形那条路上「× 在格子里的高度」由字体自报的 em 盒中线决定，两端解析到的
       * 不是同一款字，于是同一格 × 在安卓偏上、在 iOS 偏下（数据见 boardPaint 里
       * markGeometry 的注释）。这里按格边长算臂长、以格心为中点，几何居中，
       * 与字体无关。全盘的 × 攒成一条路径一次 stroke：225 格也只有一次描边。
       */
      const { arm, width } = markGeometry(h / size)
      context.strokeStyle = palette.mark
      context.lineWidth = width
      context.lineCap = 'round'
      context.beginPath()
      for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
          if (board[row][col] !== 'marked') continue
          const cx = (bx[col] + bx[col + 1]) / 2
          const cy = (by[row] + by[row + 1]) / 2
          context.moveTo(cx - arm, cy - arm)
          context.lineTo(cx + arm, cy + arm)
          context.moveTo(cx + arm, cy - arm)
          context.lineTo(cx - arm, cy + arm)
        }
      }
      context.stroke()

      // 3. 提示高亮。画在格子之上、网格线之下，与从前的层序一致。
      if (hint) {
        if (hint.row !== null) {
          context.fillStyle = `rgba(${palette.accentRgb}, 0.16)`
          context.fillRect(0, by[hint.row], w, by[hint.row + 1] - by[hint.row])
        }
        if (hint.col !== null) {
          context.fillStyle = `rgba(${palette.accentRgb}, 0.16)`
          context.fillRect(bx[hint.col], 0, bx[hint.col + 1] - bx[hint.col], h)
        }
        const inset = quantizeLineWidth(2, dpr)
        for (const cell of hint.cells) {
          const x = bx[cell.col]
          const y = by[cell.row]
          const cw = bx[cell.col + 1] - x
          const ch = by[cell.row + 1] - y
          if (cell.state === 'ghostMark') {
            // 呼吸叉由 HintOverlay 的 DOM 动画画，canvas 不管
          } else if (cell.state === 'marked') {
            // 叉画空心框、涂画实心块：都画成实心会把「这几格是空的」读成「填这几格」
            context.fillStyle = `rgba(${palette.accentRgb}, 0.42)`
            ring(context, x, y, cw, ch, inset)
          } else {
            context.fillStyle = `rgba(${palette.accentRgb}, 0.34)`
            context.fillRect(x, y, cw, ch)
          }
        }
        if (hint.focus) {
          context.fillStyle = palette.accent
          const x = bx[hint.focus.col]
          const y = by[hint.focus.row]
          ring(context, x, y, bx[hint.focus.col + 1] - x, by[hint.focus.row + 1] - y, inset)
        }
      }

      /*
       * 4. 网格线。压在整数格边上、宽度也是整数个物理像素，因此一定锐利。
       *
       * 一条线不是一支墨画到底：**两侧都是填色格的那一段换成 on-fill 那一支**。
       * 单支墨必然要在「空格底」和「填色底」之间二选一，深色主题下两者一暗一亮，
       * 选谁都有一边糊掉——填色格连成一片时缝就没了（理由与两套色值见
       * tokens.css 的 --color-grid-line-on-fill）。
       *
       * 同色的相邻段先并成一段再填，因此绝大多数情况下这一步的 fillRect 次数
       * 与从前一样是每条线一次：整条线上没有填色格时就只有一段。
       */
      const strokes = gridStrokeWidths(size)
      const normal = quantizeLineWidth(strokes.normal, dpr)
      const major = quantizeLineWidth(strokes.major, dpr)
      for (let index = 1; index < size; index++) {
        const strong = index % 5 === 0
        const width = strong ? major : normal
        const base = strong ? palette.gridLineStrong : palette.gridLine
        const onFill = strong ? palette.gridLineStrongOnFill : palette.gridLineOnFill
        const vertical = lineSpan(bx[index], width)
        paintSeam(context, size, by, base, onFill, (k) => (
          board[k][index - 1] === 'filled' && board[k][index] === 'filled'
        ), (start, end) => context.fillRect(vertical.start, start, vertical.width, end - start))
        const horizontal = lineSpan(by[index], width)
        paintSeam(context, size, bx, base, onFill, (k) => (
          board[index - 1][k] === 'filled' && board[index][k] === 'filled'
        ), (start, end) => context.fillRect(start, horizontal.start, end - start, horizontal.width))
      }

      return animating
    }

    function frame() {
      frameRef.current = null
      const target = canvasRef.current
      if (!target) return
      const context = target.getContext('2d')
      if (!context) return
      if (paint(context, performance.now())) schedule()
    }

    function schedule() {
      if (frameRef.current !== null) return
      frameRef.current = requestAnimationFrame(frame)
    }

    layout(canvas)
    if (paint(ctx, performance.now())) schedule()

    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            const target = canvasRef.current
            if (!target) return
            layout(target)
            const context = target.getContext('2d')
            if (context && paint(context, performance.now())) schedule()
          })
    observer?.observe(canvas)

    return () => {
      observer?.disconnect()
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
  }, [board, hovered, hint, size, theme, cellSize, onUnavailable])

  return (
    <canvas
      ref={canvasRef}
      className={styles.boardCanvas}
      data-board-canvas=""
      aria-hidden="true"
    />
  )
}
