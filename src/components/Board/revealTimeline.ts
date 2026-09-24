/**
 * 胜利揭晓动画的时序模型（纯函数，不碰 DOM）。
 *
 * 主体与背景是**同一个动作**，不是先后两拍。
 * 一道波扫过棋盘，波扫到哪里，那里的主体格和背景格一起亮起来；
 * 两者的区别在「怎么亮」而不是「什么时候亮」——
 * 主体格弹跳 + accent 高亮（主角），背景格安静落位（衬托）。
 *
 * 波形见 RevealWave：
 *   subject-out：背景格跟着**它自己最近的那个主体格**走，波一过就地跟上。
 *                既保留「场景从图形里长出来」的意思，又不会产生
 *                「全部背景等全部主体」那种全局分界。
 *   diagonal：   主体与背景共用一条对角线波，整体像一道幕布扫过。
 */

export type RevealWave = 'from-touch' | 'subject-out' | 'diagonal'

/** 揭晓的起点格（from-touch 波形下即玩家点下的最后一格） */
export interface RevealOrigin {
  row: number
  col: number
}

export interface RevealTiming {
  /** 主体格单格动画时长 */
  subjectDurationMs: number
  /** 波沿对角线推进的每步间隔 */
  subjectStepMs: number
  /** 背景格单格动画时长 */
  sceneDurationMs: number
  /** subject-out 波形下，背景每远离主体一环增加的延迟 */
  sceneRingStepMs: number
  /** 背景格相对同处主体格的额外滞后；0 = 完全同步 */
  subjectLeadMs: number
}

/** 主体参数与原 CSS keyframes 对齐（420ms / 45ms），保证手感不变 */
export const REVEAL_TIMING: RevealTiming = {
  subjectDurationMs: 420,
  subjectStepMs: 45,
  sceneDurationMs: 300,
  sceneRingStepMs: 32,
  subjectLeadMs: 60,
}

/**
 * 揭晓总时长的目标值：整段动画会等比缩放到这个长度（见 normalizeDelays）。
 *
 * 步长固定时，总时长既随棋盘变大而变长，又随起点离边角远近漂移——
 * 实测 5×5 中心起手 521ms、15×15 角落起手 1311ms，差 2.5 倍，
 * 小图一闪而过、大图拖沓，同一关卡还会因为最后一笔点在哪而抖 400ms。
 * 揭晓是每关固定的仪式，时长不该由手指位置决定，
 * 因此这里只让它随图的信息量（尺寸）缓慢增长，其余一律归一。
 */
export function targetRevealMs(size: number): number {
  return 600 + size * 24
}

/**
 * 默认从玩家点下的最后一格荡开——揭晓由那一下点击引发，而不是播一段固定动画。
 * 拿不到起点时（例如键盘/程序化完成）自动退化成 subject-out 的对角波。
 */
export const DEFAULT_WAVE: RevealWave = 'from-touch'

/**
 * 主体格入场不做高亮闪色，直接以该格终色入场。
 * 原 CSS keyframes 是前 55% 保持 --color-accent 再化到终色，
 * 但那个蓝与关卡场景配色无关，铺上彩色背景后整段揭晓会明显偏蓝。
 */
export const DEFAULT_FLASH_COLOR = 'none'

/** 背景格默认做透明度淡入，见 sceneAlpha */
export const DEFAULT_SCENE_FADE = true

export type RevealCellKind = 'subject' | 'scene'

export interface RevealCell {
  row: number
  col: number
  kind: RevealCellKind
  delayMs: number
  durationMs: number
}

export interface RevealPlan {
  cells: RevealCell[]
  totalMs: number
}

const NEIGHBOURS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]

/**
 * 主体格自身的入场时刻。
 * from-touch 且有起点时按到起点的欧氏距离扩散（圆形涟漪，从手指底下荡开）；
 * 其余情况沿用原实现的 (行+列) 对角错峰。
 */
function subjectDelayAt(
  row: number,
  col: number,
  timing: RevealTiming,
  wave: RevealWave,
  origin: RevealOrigin | null,
): number {
  if (wave === 'from-touch' && origin) {
    const dr = row - origin.row
    const dc = col - origin.col
    return Math.sqrt(dr * dr + dc * dc) * timing.subjectStepMs
  }
  return (row + col) * timing.subjectStepMs
}

/**
 * 背景格的入场时刻：自各主体格向外松弛，取「最近主体格的入场时刻 + 环数 × 环间隔」的最小值。
 * 各主体格起点时刻不同，普通 BFS 的层序不成立，故松弛到稳定为止（网格很小，代价可忽略）。
 */
export function sceneDelayGrid(
  solution: number[][],
  timing: RevealTiming,
  wave: RevealWave = DEFAULT_WAVE,
  origin: RevealOrigin | null = null,
): number[][] {
  const size = solution.length
  const delay = Array.from({ length: size }, () => Array<number>(size).fill(Infinity))

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (solution[row][col] === 1) {
        delay[row][col] = subjectDelayAt(row, col, timing, wave, origin)
      }
    }
  }

  let changed = true
  while (changed) {
    changed = false
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        for (const [dr, dc] of NEIGHBOURS) {
          const r = row + dr
          const c = col + dc
          if (r < 0 || c < 0 || r >= size || c >= size) continue
          const candidate = delay[r][c] + timing.sceneRingStepMs
          if (candidate < delay[row][col]) {
            delay[row][col] = candidate
            changed = true
          }
        }
      }
    }
  }

  // 没有主体格时（validator 已排除）全部从 0 起，避免留下 Infinity
  return delay.map((row) => row.map((v) => (Number.isFinite(v) ? v : 0)))
}

/**
 * 把所有入场时刻等比缩放，使整段动画恰好落在 targetMs。
 *
 * 总时长是各格 delay+duration 的最大值，缩放系数 f 只作用于 delay，
 * 于是每格给出一个上限 f_i =（目标 − 该格时长）/ 该格延迟，取最小的那个即可：
 * 该格会精确压在目标时刻收尾，其余格必然更早。单格图或目标短于单格时长时不缩放。
 */
function normalizeDelays(cells: RevealCell[], targetMs: number): void {
  let factor = Infinity
  for (const cell of cells) {
    if (cell.delayMs <= 0) continue
    factor = Math.min(factor, (targetMs - cell.durationMs) / cell.delayMs)
  }
  if (!Number.isFinite(factor) || factor <= 0) return
  for (const cell of cells) cell.delayMs *= factor
}

/** 排布每个格子的起止时刻；hasScene=false 时只产出主体格 */
export function buildRevealPlan(
  solution: number[][],
  hasScene: boolean,
  timing: RevealTiming = REVEAL_TIMING,
  wave: RevealWave = DEFAULT_WAVE,
  origin: RevealOrigin | null = null,
): RevealPlan {
  const size = solution.length
  const cells: RevealCell[] = []

  // diagonal 让主体与背景共用一条波；其余波形下背景跟着最近的主体格走
  const sceneDelays =
    hasScene && wave !== 'diagonal' ? sceneDelayGrid(solution, timing, wave, origin) : null

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (solution[row][col] === 1) {
        const delayMs = subjectDelayAt(row, col, timing, wave, origin)
        cells.push({ row, col, kind: 'subject', delayMs, durationMs: timing.subjectDurationMs })
        continue
      }

      if (!hasScene) continue

      const base =
        sceneDelays !== null
          ? sceneDelays[row][col]
          : subjectDelayAt(row, col, timing, wave, origin)
      const delayMs = base + timing.subjectLeadMs
      cells.push({ row, col, kind: 'scene', delayMs, durationMs: timing.sceneDurationMs })
    }
  }

  // 归一化到该尺寸的目标时长，消除「大图拖沓 / 起点漂移」
  normalizeDelays(cells, targetRevealMs(size))
  const totalMs = cells.reduce((max, cell) => Math.max(max, cell.delayMs + cell.durationMs), 0)

  // 按入场时刻排一次，绘制时顺序遍历即可，运行时不再排序
  cells.sort((a, b) => a.delayMs - b.delayMs)
  return { cells, totalMs }
}

/** 整段揭晓动画的时长，供结算弹窗对齐 */
export function getRevealDurationMs(
  solution: number[][],
  hasScene: boolean,
  timing: RevealTiming = REVEAL_TIMING,
  wave: RevealWave = DEFAULT_WAVE,
  origin: RevealOrigin | null = null,
): number {
  return buildRevealPlan(solution, hasScene, timing, wave, origin).totalMs
}

// ---------- 缓动 ----------

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t)
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)
}

/** 主体格弹跳曲线，形状与原 CSS keyframes 的 0.55 → 1.12 → 1 一致 */
export function subjectScale(progress: number): number {
  const PEAK_AT = 0.55
  if (progress <= PEAK_AT) return 0.55 + (1.12 - 0.55) * easeOut(progress / PEAK_AT)
  return 1.12 + (1 - 1.12) * easeInOut((progress - PEAK_AT) / (1 - PEAK_AT))
}

/** 主体格上色进度：前 55% 保持 accent 高亮，之后过渡到终色，与原 keyframes 一致 */
export function subjectColorMix(progress: number): number {
  const HOLD_UNTIL = 0.55
  if (progress <= HOLD_UNTIL) return 0
  return easeOut((progress - HOLD_UNTIL) / (1 - HOLD_UNTIL))
}

/** 背景格落位曲线：只从 0.86 长到 1，不过冲、不闪色，安静衬在主体后面 */
export function sceneScale(progress: number): number {
  return 0.86 + 0.14 * easeOut(progress)
}

/**
 * 背景格透明度淡入（可选，默认开启，见 DEFAULT_SCENE_FADE）。
 *
 * 前 60% 完成淡入。注意揭晓期间背景格下方透出的是 DOM 白底，
 * 半透明的深色场景色叠在白底上会渲染成发灰的浅色，波前因而拖一条灰雾带——
 * 这条雾带正是让波前有厚度的东西，所以留作默认；
 * 关闭则直接以实色落位，更脆，也少一次 globalAlpha 状态切换。
 */
export function sceneAlpha(progress: number): number {
  return progress >= 1 ? 1 : easeOut(Math.min(1, progress / 0.6))
}
