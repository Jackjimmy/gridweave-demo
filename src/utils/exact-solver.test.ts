import { describe, expect, it } from 'vitest'
import { deriveClues } from './clues'
import { countSolutions } from './exact-solver'

describe('countSolutions', () => {
  it('精确确认唯一解', () => {
    const heart = [
      [0, 1, 0, 1, 0],
      [1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1],
      [0, 1, 1, 1, 0],
      [0, 0, 1, 0, 0],
    ]
    expect(countSolutions(deriveClues(heart), 5)).toMatchObject({ count: 1, truncated: false })
  })

  it('多解时最多数到 2 并提前截断', () => {
    const diagonal = [
      [1, 0],
      [0, 1],
    ]
    expect(countSolutions(deriveClues(diagonal), 2)).toMatchObject({ count: 2, truncated: true })
  })

  it('无解线索返回 0', () => {
    const clues = { rows: [[0], [0]], cols: [[1], [1]] }
    expect(countSolutions(clues, 2)).toMatchObject({ count: 0, truncated: false })
  })

  it('3×3 全部答案的计数与穷举结果一致（最多 2）', () => {
    const frequencies = new Map<string, { clues: ReturnType<typeof deriveClues>; count: number }>()
    for (let mask = 0; mask < 1 << 9; mask++) {
      const grid = Array.from({ length: 3 }, (_, r) =>
        Array.from({ length: 3 }, (_, c) => (mask >> (r * 3 + c)) & 1),
      )
      const clues = deriveClues(grid)
      const key = JSON.stringify(clues)
      const entry = frequencies.get(key)
      if (entry) entry.count++
      else frequencies.set(key, { clues, count: 1 })
    }
    for (const { clues, count } of frequencies.values()) {
      expect(countSolutions(clues, 3, 2).count).toBe(Math.min(count, 2))
    }
  })
})
