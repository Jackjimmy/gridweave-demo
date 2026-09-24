import { useEffect, useLayoutEffect, useState } from 'react'
import type { RefObject } from 'react'

/**
 * 把格边长对齐到整数个物理像素。
 *
 * `--cell-size` 是视口宽高、安全区和线索槽宽算出来的小数（iPhone X 的 15×15 上
 * 约 20.87px）。WebKit 绘制时会把每个盒子的两条边各自四舍五入到物理像素，于是
 * 第 k 条格边落在 round(O + k·C)——C 带小数时，相邻格边的间距就在
 * floor(C·dpr) 与 ceil(C·dpr) 之间反复横跳：有的行比邻居高一个物理像素，
 * 填色块的边沿与网格线也对不上。行数越多、DPR 越高越明显，DPR 3 的 iPhone X
 * 上 15×15 最糟。
 *
 * 把 C 取到整数个物理像素后 round(O + k·C) = round(O) + k·C，每格边长严格相等，
 * 误差不再随 k 累积；盘面落在屏幕上的整体偏移量 round(O) 是多少都不影响这一点。
 *
 * 向下取而不是四舍五入：`--cell-size` 本身已经是「塞得下的最大值」，
 * 向上会溢出可用空间。代价是整块盘面最多缩掉 size 个物理像素。
 */

/** CSS 布局的最小单位是 1/64 px（LayoutUnit），比这更细的小数一律会被量化掉 */
const LAYOUT_UNITS_PER_PX = 64

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

/**
 * 格边长的取整步长。
 *
 * 光「整数个物理像素」还不够：DPR 3 上 k/3 是无限循环小数，CSS 会先把它量化到
 * 1/64 px 再用。于是同一个值走两条路径会得到两个结果——
 *
 *   容器高度 calc(--cell-size * 15)：先乘后量化 → 320
 *   网格轨道 repeat(15, --cell-size)：先量化每条再累加 → 319.921875
 *
 * 差 0.078125 px，在 DPR 3 上攒到第 15 行就够一个物理像素，盘面底沿因此漏出
 * 一条板底白线。DPR 2 上 k/2 恒可被 1/64 精确表示，两条路径同值，所以只有
 * DPR 3 的机器、且只有格数最多的 15×15 才看得见。
 *
 * 步长取 1/gcd(64, dpr)：这样 cell = m/gcd 同时满足 cell·dpr 与 cell·64 都是整数，
 * 两条路径不可能再分叉。DPR 3 上它等于 1 CSS px（盘面因此最多缩 15 CSS px，
 * 换来的是几何完全精确）；DPR 2 上等于 0.5 CSS px，与从前一致。
 */
export function snapStepPx(dpr: number): number {
  if (!Number.isInteger(dpr) || dpr <= 0) return 0
  return 1 / gcd(LAYOUT_UNITS_PER_PX, dpr)
}

/** 把量到的原值向下取到一个既是整数物理像素、又能被 1/64 精确表示的格边长 */
export function snapCellSize(raw: number, dpr: number): number {
  const step = snapStepPx(dpr)
  // 非整数 DPR（2.75 这类）取不到两全的步长，退回按物理像素取整，尽力而为
  if (step === 0) return Math.max(1, Math.floor(raw * dpr + 1e-4)) / dpr
  // 1e-9 只吸收除法的浮点毛刺，不足以让取整跨过一个步长
  return Math.max(step, Math.floor(raw / step + 1e-9) * step)
}

export function useSnappedCellSize(probeRef: RefObject<HTMLElement | null>): number | null {
  const [cellSize, setCellSize] = useState<number | null>(null)

  /*
   * 挂载后立刻量一次，不等 ResizeObserver。
   *
   * RO 的首次投递挂在渲染生命周期上：页面不可见（后台标签页、WebView 还没上屏）
   * 时它不会跑，盘面就一直用着没对齐的原值。这一次同步测量把「有没有生效」
   * 从时序问题变成确定的事，RO 只负责之后的变化。
   */
  useLayoutEffect(() => {
    const probe = probeRef.current
    if (!probe) return
    const raw = probe.getBoundingClientRect().width
    if (!raw || raw <= 0) return
    const snapped = snapCellSize(raw, window.devicePixelRatio || 1)
    setCellSize((prev) => (prev === snapped ? prev : snapped))
  }, [probeRef])

  useEffect(() => {
    const probe = probeRef.current
    if (!probe || typeof ResizeObserver === 'undefined') return

    /*
     * 只有探针读 `--cell-size-raw`，量到的始终是未对齐的原值，因此把结果写回
     * `--cell-size` 不会反过来改变下一次测量——两者之间没有回环。
     *
     * 用 contentRect 而不是 getBoundingClientRect：前者不含祖先 transform 的缩放，
     * 庆祝态给棋盘套的位移与缩放不会污染测量。
     */
    const observer = new ResizeObserver((entries) => {
      const raw = entries[entries.length - 1]?.contentRect.width
      if (!raw || raw <= 0) return
      const snapped = snapCellSize(raw, window.devicePixelRatio || 1)
      setCellSize((prev) => (prev === snapped ? prev : snapped))
    })
    observer.observe(probe)
    return () => observer.disconnect()
  }, [probeRef])

  return cellSize
}
