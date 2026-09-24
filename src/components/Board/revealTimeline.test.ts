import { describe, expect, it } from 'vitest'
import {
  REVEAL_TIMING,
  buildRevealPlan,
  getRevealDurationMs,
  sceneDelayGrid,
  sceneScale,
  subjectColorMix,
  subjectScale,
  targetRevealMs,
} from './revealTimeline'

/** 中间一格填充的 5×5 */
const CROSS_5 = [
  [0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0],
  [0, 0, 1, 0, 0],
  [0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0],
]

function delayAt(solution: number[][], row: number, col: number, hasScene = true) {
  const plan = buildRevealPlan(solution, hasScene)
  return plan.cells.find((cell) => cell.row === row && cell.col === col)?.delayMs
}

describe('sceneDelayGrid', () => {
  it('背景格的入场时刻 = 最近主体格的入场时刻 + 环数 × 环间隔', () => {
    const grid = sceneDelayGrid(CROSS_5, REVEAL_TIMING)
    const subjectDelay = (2 + 2) * REVEAL_TIMING.subjectStepMs

    expect(grid[2][2]).toBe(subjectDelay)
    expect(grid[1][2]).toBe(subjectDelay + REVEAL_TIMING.sceneRingStepMs)
    expect(grid[1][1]).toBe(subjectDelay + 2 * REVEAL_TIMING.sceneRingStepMs)
  })

  it('主体格入场时刻不同时取最早到达的那条路径，而不是最短距离', () => {
    // 左上角主体格入场早（row+col=0），右下角晚（row+col=8）
    const solution = [
      [1, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 1],
    ]
    const grid = sceneDelayGrid(solution, REVEAL_TIMING)
    const early = 0
    const late = 8 * REVEAL_TIMING.subjectStepMs

    // [4][3] 距右下角主体只有 1 环、距左上角主体有 7 环。
    // 右下角近却入场晚（360+32=392），左上角远却入场早（0+224=224），
    // 应当跟左上角那道波走——即比的是到达时刻，不是距离。
    const viaNear = late + 1 * REVEAL_TIMING.sceneRingStepMs
    const viaFar = early + 7 * REVEAL_TIMING.sceneRingStepMs
    expect(viaNear).toBeGreaterThan(viaFar)
    expect(grid[4][3]).toBe(viaFar)
  })

  it('没有主体格时不会留下 Infinity', () => {
    const blank = Array.from({ length: 3 }, () => Array<number>(3).fill(0))
    expect(sceneDelayGrid(blank, REVEAL_TIMING).flat().every(Number.isFinite)).toBe(true)
  })
})

describe('buildRevealPlan', () => {
  it('整段揭晓被压到该尺寸的目标时长，单格动画本身不受影响', () => {
    const solution = Array.from({ length: 15 }, () => Array<number>(15).fill(0))
    solution[14][14] = 1

    const plan = buildRevealPlan(solution, false)

    expect(plan.cells).toHaveLength(1)
    expect(plan.cells[0]).toMatchObject({ kind: 'subject', durationMs: 420 })
    expect(plan.totalMs).toBe(targetRevealMs(15))
  })

  it('全部格子同时入场时不缩放，避免除以零把时长拉成目标值', () => {
    const solution = [[1]]

    const plan = buildRevealPlan(solution, false)

    expect(plan.cells[0].delayMs).toBe(0)
    expect(plan.totalMs).toBe(REVEAL_TIMING.subjectDurationMs)
  })

  it('背景格紧跟同处主体格入场，而不是等整个主体拍放完', () => {
    const subjectDelay = delayAt(CROSS_5, 2, 2)!
    const neighbour = delayAt(CROSS_5, 1, 2)!

    // 归一化是等比缩放，绝对间隔会变，但「相邻背景格紧跟主体」的量级不变：
    // 仍远小于主体格自己那段动画，不会读成先后两拍
    expect(neighbour).toBeGreaterThan(subjectDelay)
    expect(neighbour - subjectDelay).toBeLessThan(REVEAL_TIMING.subjectDurationMs)
  })

  it('主体先于同处背景入场，保证主体是主角', () => {
    const plan = buildRevealPlan(CROSS_5, true)
    const subject = plan.cells.find((c) => c.kind === 'subject')!
    const firstScene = plan.cells.find((c) => c.kind === 'scene')!

    expect(subject.delayMs).toBeLessThan(firstScene.delayMs)
  })

  it('cells 按入场时刻升序，绘制时可用游标跳过未入场的格子', () => {
    const plan = buildRevealPlan(CROSS_5, true)
    const delays = plan.cells.map((c) => c.delayMs)

    expect(delays).toEqual([...delays].sort((a, b) => a - b))
    expect(plan.cells).toHaveLength(25)
  })

  it('diagonal 波形下主体与背景共用同一条对角线波', () => {
    const plan = buildRevealPlan(CROSS_5, true, REVEAL_TIMING, 'diagonal')
    const cell = plan.cells.find((c) => c.row === 0 && c.col === 0)!

    expect(cell.kind).toBe('scene')
    // [0][0] 的对角步数为 0，所以只剩固定的领先量
    expect(cell.delayMs).toBe(REVEAL_TIMING.subjectLeadMs)
  })

  it('无场景时只产出主体格，退化成接入前的行为', () => {
    const plan = buildRevealPlan(CROSS_5, false)

    expect(plan.cells).toHaveLength(1)
    expect(plan.cells[0].kind).toBe('subject')
  })

  it('主体格靠前时不会为棋盘右下角空等', () => {
    const solution = Array.from({ length: 5 }, () => Array<number>(5).fill(0))
    solution[0][0] = 1

    expect(getRevealDurationMs(solution, false)).toBe(420)
  })
})

describe('缓动曲线', () => {
  it('主体格从 0.55 起跳、过冲到 1.12、收在 1（与原 keyframes 同形）', () => {
    expect(subjectScale(0)).toBeCloseTo(0.55, 5)
    expect(subjectScale(0.55)).toBeCloseTo(1.12, 5)
    expect(subjectScale(1)).toBeCloseTo(1, 5)
  })

  it('主体格前 55% 保持 accent 高亮，之后才过渡到终色', () => {
    expect(subjectColorMix(0)).toBe(0)
    expect(subjectColorMix(0.55)).toBe(0)
    expect(subjectColorMix(1)).toBeCloseTo(1, 5)
  })

  it('背景格不过冲、不闪色，只轻微放大后以实色落位', () => {
    expect(sceneScale(0)).toBeCloseTo(0.86, 5)
    expect(sceneScale(1)).toBeCloseTo(1, 5)
    for (let t = 0; t <= 1; t += 0.05) {
      expect(sceneScale(t)).toBeLessThanOrEqual(1)
    }
  })
})

describe('from-touch 波形', () => {
  const FULL_5 = Array.from({ length: 5 }, () => Array<number>(5).fill(1))

  it('从起点格开始，起点最先入场', () => {
    const origin = { row: 4, col: 0 }
    const plan = buildRevealPlan(FULL_5, false, REVEAL_TIMING, 'from-touch', origin)
    const at = (r: number, c: number) =>
      plan.cells.find((cell) => cell.row === r && cell.col === c)!.delayMs

    expect(at(4, 0)).toBe(0)
    expect(Math.min(...plan.cells.map((c) => c.delayMs))).toBe(0)
  })

  it('按到起点的欧氏距离扩散，等距的格子同时入场', () => {
    const origin = { row: 2, col: 2 }
    const plan = buildRevealPlan(FULL_5, false, REVEAL_TIMING, 'from-touch', origin)
    const at = (r: number, c: number) =>
      plan.cells.find((cell) => cell.row === r && cell.col === c)!.delayMs

    // 四个正邻居等距，应当同时入场
    expect(at(1, 2)).toBeCloseTo(at(3, 2), 5)
    expect(at(2, 1)).toBeCloseTo(at(2, 3), 5)
    // 斜邻居比正邻居远 √2 倍
    expect(at(1, 1)).toBeCloseTo(at(1, 2) * Math.SQRT2, 5)
  })

  it('起点不同，波的推进方向随之改变', () => {
    const fromTopLeft = buildRevealPlan(FULL_5, false, REVEAL_TIMING, 'from-touch', {
      row: 0,
      col: 0,
    })
    const fromBottomRight = buildRevealPlan(FULL_5, false, REVEAL_TIMING, 'from-touch', {
      row: 4,
      col: 4,
    })
    const at = (plan: typeof fromTopLeft, r: number, c: number) =>
      plan.cells.find((cell) => cell.row === r && cell.col === c)!.delayMs

    expect(at(fromTopLeft, 0, 0)).toBe(0)
    expect(at(fromBottomRight, 0, 0)).toBeGreaterThan(0)
    expect(at(fromBottomRight, 4, 4)).toBe(0)
  })

  it('拿不到起点时退化成对角波，不影响程序化完成的关卡', () => {
    const withoutOrigin = buildRevealPlan(FULL_5, false, REVEAL_TIMING, 'from-touch', null)
    const diagonal = buildRevealPlan(FULL_5, false, REVEAL_TIMING, 'subject-out', null)

    expect(withoutOrigin.cells.map((c) => c.delayMs)).toEqual(
      diagonal.cells.map((c) => c.delayMs),
    )
  })

  it('背景格仍跟着最近的主体格走，起点只改变主体的入场次序', () => {
    const solution = [
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 1, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
    ]
    const plan = buildRevealPlan(solution, true, REVEAL_TIMING, 'from-touch', {
      row: 2,
      col: 2,
    })
    const at = (r: number, c: number) =>
      plan.cells.find((cell) => cell.row === r && cell.col === c)!.delayMs

    // 起点即唯一主体格，入场为 0；背景按环数一圈圈往外，归一化只等比缩放不改次序
    expect(at(2, 2)).toBe(0)
    expect(at(1, 2)).toBeGreaterThan(0)
    expect(at(0, 2)).toBeGreaterThan(at(1, 2))
    expect(at(0, 0)).toBeGreaterThan(at(0, 2))

    // 同一环上的格子仍然完全同步
    expect(at(1, 2)).toBe(at(3, 2))
    expect(at(1, 2)).toBe(at(2, 1))
  })
})
