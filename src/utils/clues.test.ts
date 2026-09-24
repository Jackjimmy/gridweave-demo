import { describe, expect, it } from 'vitest'
import type { Board, CellState } from '../types'
import {
  checkWinByClues,
  deriveClues,
  getCompletedClueSegments,
  isLineSatisfied,
  lineToRuns,
} from './clues'

const line = (s: string): CellState[] =>
  [...s].map((ch) => (ch === '#' ? 'filled' : ch === 'x' ? 'marked' : 'empty'))

describe('lineToRuns', () => {
  it('提取连续填充段', () => {
    expect(lineToRuns(line('##.#.'))).toEqual([2, 1])
    expect(lineToRuns(line('#####'))).toEqual([5])
  })

  it('全空线记为 [0]，marked 视为空白', () => {
    expect(lineToRuns(line('.....'))).toEqual([0])
    expect(lineToRuns(line('xx.xx'))).toEqual([0])
    expect(lineToRuns(line('#x#x#'))).toEqual([1, 1, 1])
  })
})

describe('deriveClues', () => {
  it('从 solution 派生行列线索（含空行列 [0]）', () => {
    const solution = [
      [1, 1, 0],
      [0, 0, 0],
      [1, 0, 1],
    ]
    expect(deriveClues(solution)).toEqual({
      rows: [[2], [0], [1, 1]],
      cols: [[1, 1], [1], [1]],
    })
  })

  it('心形示例与 PUZZLE_SPEC 一致', () => {
    const heart = [
      [0, 1, 0, 1, 0],
      [1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1],
      [0, 1, 1, 1, 0],
      [0, 0, 1, 0, 0],
    ]
    const clues = deriveClues(heart)
    expect(clues.rows).toEqual([[1, 1], [5], [5], [3], [1]])
    expect(clues.cols).toEqual([[2], [4], [4], [4], [2]])
  })
})

describe('isLineSatisfied', () => {
  it('填充段与线索完全匹配', () => {
    expect(isLineSatisfied(line('##.#.'), [2, 1])).toBe(true)
    expect(isLineSatisfied(line('##..#'), [2, 1])).toBe(true)
    expect(isLineSatisfied(line('###..'), [2, 1])).toBe(false)
    expect(isLineSatisfied(line('##.##'), [2, 1])).toBe(false)
  })

  it('空线索 [0] 只被无填充的线满足', () => {
    expect(isLineSatisfied(line('..x..'), [0])).toBe(true)
    expect(isLineSatisfied(line('#....'), [0])).toBe(false)
  })
})

describe('getCompletedClueSegments', () => {
  it('只确认 [2,2] 左侧第一个重复数字', () => {
    expect(getCompletedClueSegments(line('##x....'), [2, 2])).toEqual([true, false])
  })

  it('只确认 [2,2] 右侧第二个重复数字', () => {
    expect(getCompletedClueSegments(line('....x##'), [2, 2])).toEqual([false, true])
  })

  it('重复数字仍可映射到不同 clue index 时不误判', () => {
    expect(getCompletedClueSegments(line('...##...'), [2, 2])).toEqual([false, false])
  })

  it('支持由棋盘边缘确定的完整段', () => {
    expect(getCompletedClueSegments(line('##.....'), [2, 1])).toEqual([true, false])
  })

  it('支持由 × 封闭并确定的完整段', () => {
    expect(getCompletedClueSegments(line('x##x....'), [2, 1])).toEqual([true, false])
  })

  it.each([
    ['尚未填充', 'x..x...', [2, 1], [false, false]],
    ['段未填满且边界未确定', '.##....', [3], [false]],
    ['现有填充段过长', '###x...', [2, 1], [false, false]],
    ['位置仍有歧义', '...##...', [2, 2], [false, false]],
  ] as const)('%s 时不完成任何数字', (_description, cells, clue, expected) => {
    expect(getCompletedClueSegments(line(cells), [...clue])).toEqual([...expected])
  })

  it('盘面与线索无合法排列时不产生局部完成提示', () => {
    expect(getCompletedClueSegments(line('###....'), [2, 2])).toEqual([false, false])
  })

  it('修改或撤销格子后可即时取消并恢复完成态', () => {
    expect(getCompletedClueSegments(line('##x....'), [2, 2])).toEqual([true, false])
    expect(getCompletedClueSegments(line('.#x....'), [2, 2])).toEqual([false, false])
    expect(getCompletedClueSegments(line('##x....'), [2, 2])).toEqual([true, false])
  })

  it('空线索不新增局部提示，仍由原有整线完成态负责', () => {
    expect(getCompletedClueSegments(line('xxxxx'), [0])).toEqual([false])
  })
})

describe('checkWinByClues', () => {
  const clues = { rows: [[1], [1]], cols: [[1], [1]] }

  it('填充匹配即胜利，标记与未知等价', () => {
    const board: Board = [line('#x'), line('.#')]
    expect(checkWinByClues(board, clues)).toBe(true)
  })

  it('等价解也判胜（判定基于线索而非 solution）', () => {
    // 该线索组的另一个满足解：反对角
    const board: Board = [line('.#'), line('#.')]
    expect(checkWinByClues(board, clues)).toBe(true)
  })

  it('不匹配不判胜', () => {
    const board: Board = [line('##'), line('.#')]
    expect(checkWinByClues(board, clues)).toBe(false)
  })
})
