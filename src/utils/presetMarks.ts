import type { Board, Puzzle } from '../types'
import { createEmptyBoard, decodeBoard } from './storage'

/** 空行或空列中的格子由关卡预先标记，玩家无需逐格打叉。 */
export function isPresetMark(puzzle: Pick<Puzzle, 'solution'>, row: number, col: number): boolean {
  return (
    puzzle.solution[row].every((cell) => cell === 0) ||
    puzzle.solution.every((line) => line[col] === 0)
  )
}

export function createPuzzleBoard(
  puzzle: Pick<Puzzle, 'size' | 'solution'>,
  savedBoard?: string,
): Board {
  const board = (savedBoard ? decodeBoard(savedBoard, puzzle.size) : null) ?? createEmptyBoard(puzzle.size)
  return board.map((line, row) =>
    line.map((cell, col) => (isPresetMark(puzzle, row, col) ? 'marked' : cell)),
  )
}

export function isPuzzleBoardPristine(
  puzzle: Pick<Puzzle, 'size' | 'solution'>,
  board: Board,
): boolean {
  const baseline = createPuzzleBoard(puzzle)
  return board.every((line, row) => line.every((cell, col) => cell === baseline[row][col]))
}
