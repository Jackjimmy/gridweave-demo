import type { Clue, Clues } from '../types'

export interface SolutionCountResult {
  /** 精确解数；达到 limit 后提前截断。 */
  count: number
  truncated: boolean
  searchNodes: number
}

function linePatterns(size: number, clue: Clue): number[] {
  const runs = clue.length === 1 && clue[0] === 0 ? [] : clue
  if (runs.length === 0) return [0]

  const suffix = new Array<number>(runs.length + 1).fill(0)
  for (let i = runs.length - 1; i >= 0; i--) {
    suffix[i] = runs[i] + suffix[i + 1] + (i < runs.length - 1 ? 1 : 0)
  }

  const patterns: number[] = []
  const place = (runIndex: number, start: number, mask: number): void => {
    if (runIndex === runs.length) {
      patterns.push(mask)
      return
    }
    const length = runs[runIndex]
    for (let offset = start; offset + suffix[runIndex] <= size; offset++) {
      const runMask = ((1 << length) - 1) << offset
      place(runIndex + 1, offset + length + 1, mask | runMask)
    }
  }
  place(0, 0, 0)
  return patterns
}

function filterPatterns(patterns: number[], knownMask: number, valueMask: number): number[] {
  return patterns.filter((pattern) => ((pattern ^ valueMask) & knownMask) === 0)
}

/**
 * 独立的精确解计数器。它不调用项目的逐线 solver，而是枚举每条线的全部合法模式，
 * 传播所有模式共同确定的格子，并在仍不确定的格子上分支；达到 limit 即停止。
 */
export function countSolutions(clues: Clues, size: number, limit = 2): SolutionCountResult {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('limit 必须为正整数')

  const initialRows = clues.rows.map((clue) => linePatterns(size, clue))
  const initialCols = clues.cols.map((clue) => linePatterns(size, clue))
  let count = 0
  let searchNodes = 0

  const search = (
    rowCandidates: number[][],
    colCandidates: number[][],
    knownRows: number[],
    valueRows: number[],
  ): void => {
    if (count >= limit) return
    searchNodes++

    let changed = true
    while (changed) {
      changed = false

      for (let r = 0; r < size; r++) {
        const filtered = filterPatterns(rowCandidates[r], knownRows[r], valueRows[r])
        if (filtered.length === 0) return
        rowCandidates[r] = filtered
        let allOnes = filtered[0]
        let anyOnes = filtered[0]
        for (let i = 1; i < filtered.length; i++) {
          allOnes &= filtered[i]
          anyOnes |= filtered[i]
        }
        const forcedMask = allOnes | (~anyOnes & ((1 << size) - 1))
        const newMask = forcedMask & ~knownRows[r]
        if (newMask !== 0) {
          knownRows[r] |= newMask
          valueRows[r] |= allOnes & newMask
          changed = true
        }
      }

      for (let c = 0; c < size; c++) {
        let knownCol = 0
        let valueCol = 0
        for (let r = 0; r < size; r++) {
          const cellBit = 1 << c
          if ((knownRows[r] & cellBit) !== 0) {
            knownCol |= 1 << r
            if ((valueRows[r] & cellBit) !== 0) valueCol |= 1 << r
          }
        }
        const filtered = filterPatterns(colCandidates[c], knownCol, valueCol)
        if (filtered.length === 0) return
        colCandidates[c] = filtered
        let allOnes = filtered[0]
        let anyOnes = filtered[0]
        for (let i = 1; i < filtered.length; i++) {
          allOnes &= filtered[i]
          anyOnes |= filtered[i]
        }
        for (let r = 0; r < size; r++) {
          const colBit = 1 << r
          if (((allOnes | ~anyOnes) & colBit) === 0) continue
          const rowBit = 1 << c
          if ((knownRows[r] & rowBit) !== 0) continue
          knownRows[r] |= rowBit
          if ((allOnes & colBit) !== 0) valueRows[r] |= rowBit
          changed = true
        }
      }
    }

    const fullMask = (1 << size) - 1
    const branchRow = knownRows.findIndex((mask) => mask !== fullMask)
    if (branchRow === -1) {
      count++
      return
    }
    const unknown = (~knownRows[branchRow]) & fullMask
    const branchBit = unknown & -unknown
    for (const filled of [false, true]) {
      if (count >= limit) return
      const nextKnown = [...knownRows]
      const nextValues = [...valueRows]
      nextKnown[branchRow] |= branchBit
      if (filled) nextValues[branchRow] |= branchBit
      search(
        rowCandidates.map((patterns) => [...patterns]),
        colCandidates.map((patterns) => [...patterns]),
        nextKnown,
        nextValues,
      )
    }
  }

  if (initialRows.every((patterns) => patterns.length > 0) && initialCols.every((patterns) => patterns.length > 0)) {
    search(initialRows, initialCols, new Array<number>(size).fill(0), new Array<number>(size).fill(0))
  }

  return { count, truncated: count >= limit, searchNodes }
}
