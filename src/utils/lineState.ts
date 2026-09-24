import type { Board, Clues } from '../types'
import { getColumn, getCompletedClueSegments, isLineSatisfied } from './clues'

/** 界面每帧要用的整盘派生量：进度计数、行列是否满足、各段线索是否已确定 */
export interface BoardLineState {
  filledCount: number
  satisfiedRows: boolean[]
  satisfiedCols: boolean[]
  completedRowSegments: boolean[][]
  completedColSegments: boolean[][]
}

/** 上一次的结果连同它对应的盘面与线索，作为增量计算的基准 */
export interface LineStateCache {
  board: Board
  clues: Clues
  state: BoardLineState
}

function computeLine(line: Board[number], clue: number[]) {
  return {
    satisfied: isLineSatisfied(line, clue),
    segments: getCompletedClueSegments(line, clue),
  }
}

function countFilled(board: Board): number {
  let filled = 0
  for (const row of board) {
    for (const cell of row) if (cell === 'filled') filled++
  }
  return filled
}

function computeAll(board: Board, clues: Clues): BoardLineState {
  const size = board.length
  const satisfiedRows: boolean[] = []
  const satisfiedCols: boolean[] = []
  const completedRowSegments: boolean[][] = []
  const completedColSegments: boolean[][] = []
  for (let r = 0; r < size; r++) {
    const { satisfied, segments } = computeLine(board[r], clues.rows[r])
    satisfiedRows.push(satisfied)
    completedRowSegments.push(segments)
  }
  for (let c = 0; c < size; c++) {
    // 一次取列、两处复用；从前 satisfied 与 segments 各取一次，白复制一遍
    const { satisfied, segments } = computeLine(getColumn(board, c), clues.cols[c])
    satisfiedCols.push(satisfied)
    completedColSegments.push(segments)
  }
  return {
    filledCount: countFilled(board),
    satisfiedRows,
    satisfiedCols,
    completedRowSegments,
    completedColSegments,
  }
}

/**
 * 整盘派生量，只重算被这一步改动波及的那几条线。
 *
 * 全量重算的代价不在遍历，而在 getCompletedClueSegments：它要枚举该线所有
 * 合法排布，是整个对局里最贵的纯函数。全量意味着每落一子跑 2×size 次，
 * 而拖动时每跨一格就是一次落子——15×15 上是每格 30 次枚举。
 *
 * 实际上一次落子只可能改变它所在的那一行、那一列（自动补叉会一次改一整行/列，
 * 那就是那一行/列上的每一格各自波及的行列）。所以这里先用 O(size²) 次原始比较
 * 找出真正变了的行列，再只对它们重算——拖动时通常是 1 行 + 1 列。
 *
 * 传入的 cache 必须是本函数上一次的输出；盘面尺寸或线索换了会自动退回全量。
 */
export function deriveLineState(
  board: Board,
  clues: Clues,
  cache?: LineStateCache | null,
): BoardLineState {
  const size = board.length
  if (
    !cache ||
    cache.clues !== clues ||
    cache.board.length !== size ||
    cache.state.satisfiedRows.length !== size
  ) {
    return computeAll(board, clues)
  }
  if (cache.board === board) return cache.state

  const previous = cache.board
  const changedRows: number[] = []
  const changedCols = new Set<number>()
  let filledDelta = 0
  for (let r = 0; r < size; r++) {
    const before = previous[r]
    const after = board[r]
    if (before === after) continue
    let rowChanged = false
    for (let c = 0; c < size; c++) {
      if (before[c] === after[c]) continue
      rowChanged = true
      changedCols.add(c)
      if (after[c] === 'filled') filledDelta++
      if (before[c] === 'filled') filledDelta--
    }
    if (rowChanged) changedRows.push(r)
  }

  if (changedRows.length === 0) return cache.state

  const previousState = cache.state
  const satisfiedRows = previousState.satisfiedRows.slice()
  const satisfiedCols = previousState.satisfiedCols.slice()
  const completedRowSegments = previousState.completedRowSegments.slice()
  const completedColSegments = previousState.completedColSegments.slice()

  for (const r of changedRows) {
    const { satisfied, segments } = computeLine(board[r], clues.rows[r])
    satisfiedRows[r] = satisfied
    completedRowSegments[r] = segments
  }
  for (const c of changedCols) {
    const { satisfied, segments } = computeLine(getColumn(board, c), clues.cols[c])
    satisfiedCols[c] = satisfied
    completedColSegments[c] = segments
  }

  return {
    filledCount: previousState.filledCount + filledDelta,
    satisfiedRows,
    satisfiedCols,
    completedRowSegments,
    completedColSegments,
  }
}
