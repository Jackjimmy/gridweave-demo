import { useEffect, useRef } from 'react'
import type { RevealPlan } from './revealTimeline'
import {
  DEFAULT_FLASH_COLOR,
  DEFAULT_SCENE_FADE,
  sceneAlpha,
  sceneScale,
  subjectColorMix,
  subjectScale,
} from './revealTimeline'
import styles from './Board.module.css'

interface Props {
  size: number
  finishImmediately?: boolean
  plan: RevealPlan
  /** 主体格终色矩阵；null 或单格 null 时回退 --color-fill */
  artColors: (string | null)[][] | null
  /** 背景格终色矩阵；关卡无场景时为 null，此时 plan 里也不会有 scene 格 */
  sceneColors: (string | null)[][] | null
  /** 放慢倍数，仅调试用；1 = 正常速度 */
  speed?: number
  /**
   * 主体格入场时先保持的高亮色；'none' 为不闪色、直接以该格终色入场。
   * 缺省走 DEFAULT_FLASH_COLOR。
   */
  flashColor?: string | 'none'
  /** 背景格是否做透明度淡入；缺省走 DEFAULT_SCENE_FADE，见 revealTimeline.sceneAlpha */
  sceneFade?: boolean
  /** 拿不到 2d 上下文时通知调用方转走 DOM 兜底配色 */
  onUnavailable?: () => void
  onComplete: () => void
}

type Rgb = [number, number, number]

/** 解析 #rgb / #rrggbb / rgb(r,g,b)；只在建表时跑一次，不进每帧循环 */
function parseColor(input: string): Rgb | null {
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
    return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
  }
  const rgb = value.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i)
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
  return null
}

function readVar(element: Element, name: string, fallback: Rgb): Rgb {
  const raw = getComputedStyle(element).getPropertyValue(name)
  return (raw && parseColor(raw)) || fallback
}

/** 每格的绘制资料：颜色与几何都在建表/尺寸变化时算好，绘制循环里只做加减和 fillRect */
interface DrawItem {
  isSubject: boolean
  delayMs: number
  /** 结束时刻，用于判断本帧是否还在飞行中 */
  endMs: number
  /** 1 / durationMs，绘制时用乘法代替除法 */
  invDuration: number
  targetCss: string
  targetRgb: Rgb
  col: number
  row: number
  x: number
  y: number
  w: number
  h: number
}

/**
 * 胜利揭晓的绘制层：整段动画在一张 canvas 上用单个 rAF 循环画完，
 * **并且画完之后继续留在上面，成为终态那幅画本身**。
 *
 * DOM 逐格动画的问题是 background-color 属于 paint 属性、不可合成，
 * 同元素上再叠一个 transform 又会触发大量图层提升，两者互相抵消；
 * canvas 只有一个合成层、零 DOM paint，开销与棋盘尺寸基本脱钩。
 *
 * 动画结束后不把画面交还给 DOM，是因为 DOM 终态是 100~225 个独立盒子拼出来的：
 * 每个盒子各自按设备像素取整，格宽一旦落在半个物理像素上（--cell-size 由每关不同的
 * 线索槽宽参与计算，设备 DPR 又常是 2.75 这类小数），相邻两格之间就会漏出板底白线，
 * 整幅画被切成网格——同一个坑 Thumbnail 用 gap:0、ArtImage 用 crispEdges 各自绕过。
 * canvas 上相邻矩形共用同一条边界坐标、在同一个表面上依次覆盖，不存在这种缝。
 *
 * 未轮到的格子不绘制，canvas 在该处保持透明、透出下方 DOM 的对局态外观；
 * DOM 终态样式仍然保留，作为拿不到 2d 上下文时的兜底。
 */
export function RevealCanvas({
  size,
  finishImmediately = false,
  plan,
  artColors,
  sceneColors,
  speed = 1,
  flashColor = DEFAULT_FLASH_COLOR,
  sceneFade = DEFAULT_SCENE_FADE,
  onUnavailable,
  onComplete,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const completeRef = useRef(onComplete)
  completeRef.current = onComplete
  const unavailableRef = useRef(onUnavailable)
  unavailableRef.current = onUnavailable

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    /*
     * iOS WebKit 会让 canvas 与父棋盘在右/下沿的取整偶尔相差一个物理像素，
     * 露出下方 DOM 格子的白底。画布多铺一个物理像素，外层 .won 的圆角裁切
     * 会把真正越界的部分收掉，因此只填平接缝，不改变成品外轮廓。
     */
    const dpr = window.devicePixelRatio || 1
    canvas.style.setProperty('--reveal-overscan', `${1 / dpr}px`)
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      // 拿不到 2d 上下文（极老 WebView）：转 DOM 兜底配色，直接落终态，不要卡在动画里
      unavailableRef.current?.()
      completeRef.current()
      return
    }

    const fillRgb = readVar(canvas, '--color-fill', [59, 74, 104])
    const fallbackFillCss = `rgb(${fillRgb[0]},${fillRgb[1]},${fillRgb[2]})`
    // 缺色的背景格必须回退到 DOM 终态用的白底（Board.module.css 的 .revealed .cell），
    // 而不是主体格那套 --color-fill——否则未着色的场景留白会在揭晓时糊成深藏青，
    // 再在 canvas 卸载时闪回白。
    const surfaceRgb = readVar(canvas, '--color-surface', [255, 255, 255])
    const fallbackSurfaceCss = `rgb(${surfaceRgb[0]},${surfaceRgb[1]},${surfaceRgb[2]})`
    // null = 不闪色，主体格直接以终色入场
    const flashRgb: Rgb | null =
      flashColor === 'none'
        ? null
        : ((flashColor ? parseColor(flashColor) : null) ??
          readVar(canvas, '--color-accent', [59, 130, 246]))

    // ---- 建表：颜色解析只在这里发生一次 ----
    const items: DrawItem[] = plan.cells.map((cell) => {
      const isSubject = cell.kind === 'subject'
      const raw = isSubject
        ? (artColors?.[cell.row]?.[cell.col] ?? null)
        : (sceneColors?.[cell.row]?.[cell.col] ?? null)
      const fallbackRgb = isSubject ? fillRgb : surfaceRgb
      const rgb = (raw && parseColor(raw)) || fallbackRgb
      return {
        isSubject,
        delayMs: cell.delayMs,
        endMs: cell.delayMs + cell.durationMs,
        invDuration: 1 / cell.durationMs,
        targetCss: raw ?? (isSubject ? fallbackFillCss : fallbackSurfaceCss),
        targetRgb: rgb,
        row: cell.row,
        col: cell.col,
        x: 0,
        y: 0,
        w: 0,
        h: 0,
      }
    })

    let backingWidth = 0
    let backingHeight = 0

    /**
     * 几何一律以**物理像素**为单位取整，绘制时也不再套 dpr 变换。
     *
     * 从前是「按 CSS 像素取整 + setTransform(dpr)」：dpr 是小数时（2.75 这类国产机
     * 很常见）整数 CSS 坐标乘上去仍落在半个物理像素上，相邻两格各覆盖边界像素的一部分，
     * 叠加后 alpha 到不了 1，下方的板底白就从这条缝里透出来，整幅画被切成网格。
     * 现在格 k 的右边界与格 k+1 的左边界是同一个整数物理像素，
     * 既没有缝，也没有需要抗锯齿的半覆盖像素。
     */
    function layout(target: HTMLCanvasElement) {
      // --cell-size 是 calc() 出来的小数，clientWidth 会取整，
      // 直接拿来分格会让 canvas 格与 DOM 格错开最多半像素；用未取整的盒子宽度。
      const rect = target.getBoundingClientRect()
      const cssWidth = rect.width || target.clientWidth
      const cssHeight = rect.height || target.clientHeight
      backingWidth = Math.round(cssWidth * dpr)
      backingHeight = Math.round(cssHeight * dpr)
      if (target.width !== backingWidth || target.height !== backingHeight) {
        target.width = backingWidth
        target.height = backingHeight
      }
      const unitX = backingWidth / size
      const unitY = backingHeight / size
      for (const item of items) {
        const x0 = Math.round(item.col * unitX)
        const y0 = Math.round(item.row * unitY)
        item.x = x0
        item.y = y0
        item.w = Math.round((item.col + 1) * unitX) - x0
        item.h = Math.round((item.row + 1) * unitY) - y0
      }
    }

    layout(canvas)

    // plan.cells 已按 delayMs 升序，绘制时用游标跳过尚未入场的格子
    let startedCount = 0
    // 已经落位、颜色不会再变的格子；它们只在被波前的过冲蹭到时才需要补画
    let settledCount = 0
    // 已经以终色画上画布的格子数；掉帧时它落在 settledCount 后面，靠它把欠账补上
    let paintedThrough = 0
    // 本帧要动的格子（飞行中的 + 被它们蹭到的邻居），按 plan 下标记
    const dirty = new Set<number>()
    // 格子在网格里的位置 → plan 下标，用来找邻居
    const indexByCell = new Map<number, number>()
    items.forEach((item, i) => indexByCell.set(item.row * size + item.col, i))

    /**
     * 增量绘制：每帧只重画仍在飞行中的那一圈，以及被它们的过冲蹭到的邻居。
     *
     * 从前是每帧 clearRect 整块画布再把所有已入场的格子重画一遍——15×15 在
     * DPR 3 上是每帧 0.87M 像素的清除加最多 225 次填充，60fps 下每秒重填
     * 5000 万像素。落位的格子颜色已经不会再变，重画纯属白做。
     *
     * 之所以要连邻居一起处理：主体格入场会过冲到 1.12 倍（见 subjectScale），
     * 画出去的部分会盖到相邻格上。所以先把脏格连同邻居一起清掉，再按
     * 「先落位、后飞行」的顺序重画——落位的画在自己的格位内，飞行的最后画，
     * 它溢出的那一圈因此正好压在刚补好的邻居上，与全量重画的结果一致。
     */
    // 画布被清空过（改尺寸会重置 canvas.width）或需要定妆时，下一帧转为全量重画
    let needsFullRepaint = false

    function draw(elapsed: number, context: CanvasRenderingContext2D) {
      while (startedCount < items.length && items[startedCount].delayMs <= elapsed) startedCount++
      while (settledCount < startedCount && items[settledCount].endMs <= elapsed) settledCount++

      // 几何已经是物理像素，这里不再套 dpr 变换
      context.setTransform(1, 0, 0, 1, 0, 0)

      dirty.clear()
      if (needsFullRepaint) {
        needsFullRepaint = false
        context.clearRect(0, 0, backingWidth, backingHeight)
        for (let i = 0; i < startedCount; i++) dirty.add(i)
      }
      /*
       * 起点是 paintedThrough 而不是 settledCount——这一条决定了掉帧时画面是否还完整。
       *
       * 落位的格子只在「它落位的那一帧」被画上终色。若从 settledCount 起算，
       * 一旦两帧之间隔得久（切后台、低端机掉帧、rAF 被节流），中间整批格子会
       * 直接从「未入场」跳到「已落位」，一帧都没轮到，于是永远不会被画出来——
       * 而结算定时器照样会把 revealed 置真、动画就此停住，那幅画就残了。
       * 从 paintedThrough 起算等于把欠的账都算进本帧，掉多少帧都补得回来。
       */
      for (let i = paintedThrough; i < startedCount; i++) {
        const item = items[i]
        dirty.add(i)
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const neighbour = indexByCell.get((item.row + dr) * size + (item.col + dc))
            if (neighbour !== undefined) dirty.add(neighbour)
          }
        }
      }

      for (const i of dirty) {
        const item = items[i]
        context.clearRect(item.x, item.y, item.w, item.h)
      }
      // 先补落位的，飞行中的最后画，过冲才压得住
      for (const i of dirty) {
        const item = items[i]
        if (item.delayMs > elapsed || item.endMs > elapsed) continue
        context.fillStyle = item.targetCss
        context.fillRect(item.x, item.y, item.w, item.h)
      }

      for (const i of dirty) {
        const item = items[i]
        if (item.delayMs > elapsed || item.endMs <= elapsed) continue
        const progress = (elapsed - item.delayMs) * item.invDuration

        if (item.isSubject) {
          if (flashRgb === null) {
            context.fillStyle = item.targetCss
          } else {
            const t = subjectColorMix(progress)
            const r = Math.round(flashRgb[0] + (item.targetRgb[0] - flashRgb[0]) * t)
            const g = Math.round(flashRgb[1] + (item.targetRgb[1] - flashRgb[1]) * t)
            const b = Math.round(flashRgb[2] + (item.targetRgb[2] - flashRgb[2]) * t)
            context.fillStyle = `rgb(${r},${g},${b})`
          }
          const scale = subjectScale(progress)
          const dw = (item.w * (scale - 1)) / 2
          const dh = (item.h * (scale - 1)) / 2
          context.fillRect(item.x - dw, item.y - dh, item.w + dw * 2, item.h + dh * 2)
          continue
        }

        // 背景格：不闪色、不过冲，只做轻微放大；淡入按需开启
        const scale = sceneScale(progress)
        const dw = (item.w * (scale - 1)) / 2
        const dh = (item.h * (scale - 1)) / 2
        if (sceneFade) context.globalAlpha = sceneAlpha(progress)
        context.fillStyle = item.targetCss
        context.fillRect(item.x - dw, item.y - dh, item.w + dw * 2, item.h + dh * 2)
        if (sceneFade) context.globalAlpha = 1
      }

      paintedThrough = settledCount
    }

    // 动画跑完后画面要一直留在 canvas 上，但改尺寸会重置 canvas.width 从而清空它，
    // 此时已经没有后续帧来补画——所以每次 layout 之后都要顺手整块重绘。
    let lastElapsed = 0

    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            layout(canvas)
            // layout 改了 canvas.width 就等于清空，增量补不回来，只能整块重画
            needsFullRepaint = true
            draw(lastElapsed, ctx)
          })
    observer?.observe(canvas)

    let frame = 0
    // 计时锚在第一帧回调、而不是 effect 里：胜利那一帧要重渲染整盘格子、
    // 撤下网格线、挂载 canvas，提交与首帧之间常被吃掉几十毫秒。
    // 若从 effect 起算，动画一开跑 elapsed 就已经跨过好几步，
    // 恰好把「从手指底下荡开」的头几圈整段跳过——起手最该看清的部分反而丢了。
    let start: number | null = null
    const tick = (now: number) => {
      start ??= now
      const elapsed = (now - start) / speed
      lastElapsed = elapsed
      draw(elapsed, ctx)
      if (elapsed >= plan.totalMs) {
        // 全部落位后脏格集合为空，这里显式定妆一次，保证留在画面上的是终态
        needsFullRepaint = true
        draw(elapsed, ctx)
        completeRef.current()
        return
      }
      frame = requestAnimationFrame(tick)
    }
    if (finishImmediately) {
      lastElapsed = plan.totalMs
      needsFullRepaint = true
      draw(lastElapsed, ctx)
      completeRef.current()
    } else {
      frame = requestAnimationFrame(tick)
    }

    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
    }
  }, [plan, artColors, sceneColors, size, speed, flashColor, sceneFade, finishImmediately])

  return <canvas ref={canvasRef} className={styles.revealCanvas} aria-hidden="true" />
}
