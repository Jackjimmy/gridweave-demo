import type { Board, CellState, Clue, Clues } from '../types'

/** 提取一条线中 filled 连续段的长度序列；无填充段时记为 [0]，与线索格式一致 */
export function lineToRuns(line: CellState[]): number[] {
  const runs: number[] = []
  let current = 0
  for (const cell of line) {
    if (cell === 'filled') {
      current++
    } else if (current > 0) {
      runs.push(current)
      current = 0
    }
  }
  if (current > 0) runs.push(current)
  return runs.length > 0 ? runs : [0]
}

function solutionLineToCells(line: number[]): CellState[] {
  return line.map((v) => (v === 1 ? 'filled' : 'empty'))
}

/** 从 0/1 答案矩阵派生行列线索。线索永远由此派生，关卡 JSON 不存线索。 */
export function deriveClues(solution: number[][]): Clues {
  const size = solution.length
  const rows = solution.map((row) => lineToRuns(solutionLineToCells(row)))
  const cols: Clue[] = []
  for (let c = 0; c < size; c++) {
    cols.push(lineToRuns(solutionLineToCells(solution.map((row) => row[c]))))
  }
  return { rows, cols }
}

export function getColumn(board: Board, col: number): CellState[] {
  return board.map((row) => row[col])
}

/** 该线的填充状态是否与线索完全匹配（marked 与 empty 均视为空白） */
export function isLineSatisfied(line: CellState[], clue: Clue): boolean {
  const runs = lineToRuns(line)
  return runs.length === clue.length && runs.every((r, i) => r === clue[i])
}

/**
 * 只根据玩家可见状态判断各段线索的位置是否已经确定。
 *
 * empty 仍是未知格，可以填也可以空；filled 必须被某一段覆盖；marked 必须为空。
 * 某段只有在全部合法排列中的起点相同、且该段当前已全部填充时才算完成。
 * 冲突盘面没有合法排列时不提供局部完成提示。
 */
export function getCompletedClueSegments(line: CellState[], clue: Clue): boolean[] {
  const completed = clue.map(() => false)
  if (clue.length === 1 && clue[0] === 0) return completed
  if (clue.length === 0 || clue.some((run) => run <= 0)) return completed

  const suffixMinimum = clue.map(() => 0)
  for (let i = clue.length - 1; i >= 0; i--) {
    suffixMinimum[i] = clue[i] + (i + 1 < clue.length ? 1 + suffixMinimum[i + 1] : 0)
  }

  const validStarts: number[][] = []
  const starts: number[] = []

  const enumerate = (clueIndex: number, minimumStart: number) => {
    if (clueIndex === clue.length) {
      const covered = line.map(() => false)
      starts.forEach((start, index) => {
        for (let cell = start; cell < start + clue[index]; cell++) covered[cell] = true
      })
      const consistent = line.every(
        (cell, index) =>
          (cell !== 'filled' || covered[index]) && (cell !== 'marked' || !covered[index]),
      )
      if (consistent) validStarts.push([...starts])
      return
    }

    const latestStart = line.length - suffixMinimum[clueIndex]
    for (let start = minimumStart; start <= latestStart; start++) {
      starts[clueIndex] = start
      enumerate(clueIndex + 1, start + clue[clueIndex] + 1)
    }
    starts.length = clueIndex
  }

  enumerate(0, 0)
  if (validStarts.length === 0) return completed

  return clue.map((run, clueIndex) => {
    const start = validStarts[0][clueIndex]
    const positionIsFixed = validStarts.every((candidate) => candidate[clueIndex] === start)
    const segmentIsFilled = line
      .slice(start, start + run)
      .every((cell) => cell === 'filled')
    return positionIsFixed && segmentIsFilled
  })
}

/** 胜利判定：所有行列均满足线索。判定基于线索而非答案矩阵。 */
export function checkWinByClues(board: Board, clues: Clues): boolean {
  return (
    clues.rows.every((clue, r) => isLineSatisfied(board[r], clue)) &&
    clues.cols.every((clue, c) => isLineSatisfied(getColumn(board, c), clue))
  )
}
