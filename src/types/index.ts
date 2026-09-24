/** 棋盘单格三态：empty=未知、filled=填充、marked=标记 X（确定空白） */
export type CellState = 'empty' | 'filled' | 'marked'

/** 行优先棋盘：board[row][col] */
export type Board = CellState[][]

/** 一行或一列的线索；空线表示为 [0] */
export type Clue = number[]

export interface Clues {
  rows: Clue[]
  cols: Clue[]
}

export type Difficulty = 'easy' | 'medium' | 'hard'

export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard']

export const PUZZLE_SIZES: readonly number[] = [5, 10, 15]

/** 主题词表，见 docs/PUZZLE_SPEC.md 6.3 */
export const PUZZLE_THEMES: readonly string[] = [
  'animal',
  'plant',
  'object',
  'food',
  'weather',
  'symbol',
  'vehicle',
  'scene',
]

/** 关卡 JSON 的原始结构，见 docs/PUZZLE_SPEC.md 第 2 节 */
export interface PuzzleData {
  id: string
  name: { zh: string; en: string }
  size: number
  difficulty: Difficulty
  /** 行优先 0/1 答案矩阵，1=填充 */
  solution: number[][]
  /** 彩色图案调色板，与 art 成对出现 */
  palette?: string[]
  /** 每格颜色索引矩阵：0=空白，k=palette[k-1]；非零位置必须与 solution 的 1 一一对应 */
  art?: number[][]
  tags: string[]
  author: string
  createdAt: string
}

/** 运行时关卡：JSON 数据 + 派生线索 */
export interface Puzzle extends PuzzleData {
  clues: Clues
}

/**
 * 完成图的场景背景层，与关卡 JSON 分开存放（见 work/scene-backgrounds/README.md）。
 * 只覆盖 solution=0 的格子，与关卡数据叠加后即为整张场景图。
 */
export interface SceneData {
  id: string
  size: number
  /** 生成时使用的主题模板名，仅供追溯，不参与渲染 */
  theme: string
  /** 背景调色板 #rrggbb */
  bgPalette: string[]
  /** size × size；0=无背景，k=bgPalette[k-1]；非零位置必须落在 solution 的 0 上 */
  background: number[][]
  /** 存在时整体替换关卡 palette（长度必须一致），用于与新背景协调 */
  subjectPalette?: string[]
  createdAt: string
}

export type GameStatus = 'playing' | 'won'

/** 单关存档 */
export interface PuzzleProgress {
  version: 1
  /** encodeBoard 产物；已完成关卡为空串 */
  board: string
  elapsedSeconds: number
  completed: boolean
  /** 曾经通关过：重玩期间保持 true，选关页据此持续展示图案与单词 */
  everCompleted?: boolean
  bestTimeSeconds?: number
  /**
   * 最近一次通关的时刻（epoch ms）。解锁库按它倒序，最新解开的那张排在最前。
   *
   * 老存档没有这一项——它是 2026-08 加的，此前通关只留下 completed。
   * 缺这一项的关卡一律当成"更早"，排在有时间戳的后面（见 utils/unlocked.ts）。
   */
  completedAt?: number
  /**
   * 第一次通关的时刻（epoch ms）。藏品详情里那行"首次完成"读它。
   *
   * 与 completedAt 的区别是它**只写一次**：重玩不刷新，那才叫"第一次"。
   * 2026-08 之前的存档没有这一项，也补不回来（当时只留下最近一次通关的时间），
   * 缺这一项时详情页整行不显示——宁可少一行，不拿最近一次冒充第一次。
   */
  firstClearedAt?: number
}
