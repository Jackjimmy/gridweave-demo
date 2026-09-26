import { describe, expect, it } from 'vitest'
import type { CellState } from '../types'
import { deriveClues } from './clues'
import { solve, solveLine } from './solver'

const line = (s: string): CellState[] =>
  [...s].map((ch) => (ch === '#' ? 'filled' : ch === 'x' ? 'marked' : 'empty'))

describe('solveLine', () => {
  it('满线索直接确定整线', () => {
    expect(solveLine(line('.....'), [5])).toEqual(line('#####'))
  })

  it('空线索 [0] 确定整线空白', () => {
    expect(solveLine(line('.....'), [0])).toEqual(line('xxxxx'))
  })

  it('交集法：[4] 于 5 格线确定中间 3 格', () => {
    expect(solveLine(line('.....'), [4])).toEqual(line('.###.'))
  })

  it('结合已知状态推进：x 处强制分段', () => {
    // [2] 在 5 格线上，第 2 格(索引1)已标记空白 → 段只能在右侧 2..4
    const result = solveLine(line('.x...'), [2])
    expect(result).not.toBeNull()
    expect(result![0]).toBe('marked') // 段进不了索引 0
  })

  it('无相容摆放时返回 null（矛盾）', () => {
    expect(solveLine(line('#x#x#'), [5])).toBeNull()
    expect(solveLine(line('#....'), [0])).toBeNull()
  })
})

describe('solve', () => {
  it('求解心形关卡并与 solution 一致', () => {
    const heart = [
      [0, 1, 0, 1, 0],
      [1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1],
      [0, 1, 1, 1, 0],
      [0, 0, 1, 0, 0],
    ]
    const result = solve(deriveClues(heart), 5)
    expect(result.status).toBe('solved')
    expect(result.progressPerIteration.at(-1)).toBe(0)
    expect(result.progressPerIteration.reduce((sum, value) => sum + value, 0)).toBe(25)
    heart.forEach((row, r) =>
      row.forEach((v, c) => {
        expect(result.board[r][c]).toBe(v === 1 ? 'filled' : 'marked')
      }),
    )
  })

  it('多解关卡返回 stuck（对角双解）', () => {
    const ambiguous = [
      [1, 0],
      [0, 1],
    ]
    const result = solve(deriveClues(ambiguous), 2)
    expect(result.status).toBe('stuck')
  })

  it('矛盾线索返回 contradiction', () => {
    // 行线索要求全空，列线索要求有填充
    const clues = { rows: [[0], [0]], cols: [[1], [1]] }
    expect(solve(clues, 2).status).toBe('contradiction')
  })

  it('15×15 关卡在 500ms 内收敛', async () => {
    const { default: rocket } = await import('../data/puzzles/hard/sky-beyond-22-rocket.json')
    const start = performance.now()
    const result = solve(deriveClues(rocket.solution), rocket.size)
    expect(performance.now() - start).toBeLessThan(500)
    expect(result.status).toBe('solved')
  })
})
