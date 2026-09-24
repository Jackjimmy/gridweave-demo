import type { Board, CellState, Clue, Clues } from '../types'
import { getColumn } from './clues'

export type SolveStatus = 'solved' | 'stuck' | 'contradiction'

export interface SolveResult {
  status: SolveStatus
  /** 求解到的棋盘；'empty' 表示无法确定的格子 */
  board: Board
  /** 全行全列扫一遍计一轮 */
  iterations: number
  /** 每轮新确定的格子数；最后一轮通常为 0，便于区分传播节奏与停滞。 */
  progressPerIteration: number[]
}

/**
 * 单线约束传播（交集法）：枚举该线所有与当前已知状态相容的摆放，
 * 每格在全部摆放中取值一致时即可确定。
 *
 * 输入输出约定：'marked' 表示确定空白，'filled' 表示确定填充，'empty' 表示未知。
 * 无任何相容摆放时返回 null（当前已知状态与线索矛盾）。
 */
export function solveLine(line: CellState[], clue: Clue): CellState[] | null {
  const n = line.length
  const runs = clue.length === 1 && clue[0] === 0 ? [] : clue

  const canFill = new Array<boolean>(n).fill(false)
  const canBlank = new Array<boolean>(n).fill(false)
  let found = false

  // suffixNeeded[i]：摆下第 i 个及之后全部段所需的最小格数（段间含 1 空格）
  const suffixNeeded = new Array<number>(runs.length + 1)
  suffixNeeded[runs.length] = 0
  for (let i = runs.length - 1; i >= 0; i--) {
    suffixNeeded[i] = runs[i] + (i < runs.length - 1 ? 1 : 0) + suffixNeeded[i + 1]
  }

  const placement = new Array<boolean>(n).fill(false)
  const cellCanBlank = (i: number) => line[i] !== 'filled'
  const cellCanFill = (i: number) => line[i] !== 'marked'

  const record = () => {
    found = true
    for (let i = 0; i < n; i++) {
      if (placement[i]) canFill[i] = true
      else canBlank[i] = true
    }
  }

  const recurse = (pos: number, runIdx: number): void => {
    if (runIdx === runs.length) {
      for (let i = pos; i < n; i++) {
        if (!cellCanBlank(i)) return
      }
      record()
      return
    }
    const len = runs[runIdx]
    for (let s = pos; s + suffixNeeded[runIdx] <= n; s++) {
      let fits = true
      for (let i = s; i < s + len; i++) {
        if (!cellCanFill(i)) {
          fits = false
          break
        }
      }
      const end = s + len
      // 非末段后必须留 1 个空格作分隔
      if (fits && runIdx < runs.length - 1 && !cellCanBlank(end)) fits = false
      if (fits) {
        for (let i = s; i < end; i++) placement[i] = true
        recurse(runIdx < runs.length - 1 ? end + 1 : end, runIdx + 1)
        for (let i = s; i < end; i++) placement[i] = false
      }
      // 段起点右移意味着格 s 留空；s 必须可为空白才能继续右移
      if (!cellCanBlank(s)) break
    }
  }

  recurse(0, 0)
  if (!found) return null

  const result: CellState[] = new Array(n)
  for (let i = 0; i < n; i++) {
    if (canFill[i] && canBlank[i]) result[i] = 'empty'
    else if (canFill[i]) result[i] = 'filled'
    else result[i] = 'marked'
  }
  return result
}

/**
 * 全盘逐线约束传播直至不动点。
 * - solved：全部格子确定 —— 该线索组唯一解且纯逻辑可解
 * - stuck：不动点仍有未定格 —— 多解，或超出逐线推理能力
 * - contradiction：某线无相容摆放
 */
export function solve(clues: Clues, size: number): SolveResult {
  const board: Board = Array.from({ length: size }, () =>
    new Array<CellState>(size).fill('empty'),
  )
  let iterations = 0
  const progressPerIteration: number[] = []
  let changed = true
  while (changed) {
    changed = false
    iterations++
    let progress = 0
    for (let r = 0; r < size; r++) {
      const res = solveLine(board[r], clues.rows[r])
      if (!res) return { status: 'contradiction', board, iterations, progressPerIteration: [...progressPerIteration, progress] }
      for (let c = 0; c < size; c++) {
        if (res[c] !== 'empty' && board[r][c] === 'empty') {
          board[r][c] = res[c]
          changed = true
          progress++
        }
      }
    }
    for (let c = 0; c < size; c++) {
      const res = solveLine(getColumn(board, c), clues.cols[c])
      if (!res) return { status: 'contradiction', board, iterations, progressPerIteration: [...progressPerIteration, progress] }
      for (let r = 0; r < size; r++) {
        if (res[r] !== 'empty' && board[r][c] === 'empty') {
          board[r][c] = res[r]
          changed = true
          progress++
        }
      }
    }
    progressPerIteration.push(progress)
  }
  const complete = board.every((row) => row.every((cell) => cell !== 'empty'))
  return { status: complete ? 'solved' : 'stuck', board, iterations, progressPerIteration }
}
