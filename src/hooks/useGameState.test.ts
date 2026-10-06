import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { Puzzle } from '../types'
import { deriveClues } from '../utils/clues'
import { useGameState } from './useGameState'
import type { GameRules } from './useGameState'

const solution = [
  [1, 1],
  [0, 1],
]

const puzzle: Puzzle = {
  id: 'easy-01-test',
  name: { zh: '测试', en: 'Test' },
  size: 2,
  difficulty: 'easy',
  solution,
  tags: ['symbol'],
  author: 'original',
  createdAt: '2026-07-06',
  clues: deriveClues(solution),
}

const puzzleWithEmptyLines: Puzzle = {
  ...puzzle,
  id: 'easy-02-empty-lines',
  solution: [
    [0, 0, 0],
    [0, 1, 1],
    [0, 1, 0],
  ],
  size: 3,
  clues: deriveClues([
    [0, 0, 0],
    [0, 1, 1],
    [0, 1, 0],
  ]),
}

/**
 * 造一条 10 格宽的待测行：首行按 topRow 填，第 6 行取它的补集。
 * 补集这一行是必要的——否则 topRow 里为 0 的那些列会整列全空，
 * 开局就被预填成锁死的叉，测的就不是「拖动会不会吃掉叉」了。
 */
function rowPuzzle(topRow: number[]): Puzzle {
  const solution = Array.from({ length: 10 }, (_, r) =>
    r === 0 ? topRow : r === 5 ? topRow.map((v) => 1 - v) : new Array<number>(10).fill(0),
  )
  return {
    ...puzzle,
    id: `medium-999-row-${topRow.join('')}`,
    size: 10,
    solution,
    clues: deriveClues(solution),
  }
}

/** 一笔拖过整行，返回首行的最终状态 */
function dragTopRow(result: { current: ReturnType<typeof useGameState> }, from: number, to: number) {
  act(() => {
    result.current.beginStroke(0, from, 'fill')
    for (let c = from + 1; c <= to; c++) result.current.continueStroke(0, c)
    result.current.endStroke()
  })
  return result.current.board[0]
}

describe('useGameState', () => {
  it('单击三态：填充 → 清除；标记 → 清除', () => {
    const { result } = renderHook(() => useGameState(puzzle))
    act(() => {
      result.current.beginStroke(0, 0, 'fill')
      result.current.endStroke()
    })
    expect(result.current.board[0][0]).toBe('filled')
    act(() => {
      result.current.beginStroke(0, 0, 'fill')
      result.current.endStroke()
    })
    expect(result.current.board[0][0]).toBe('empty')
    act(() => {
      result.current.beginStroke(0, 0, 'mark')
      result.current.endStroke()
    })
    expect(result.current.board[0][0]).toBe('marked')
  })

  it('方块盖得住叉：填充模式点在标记格上直接涂成方块', () => {
    const { result } = renderHook(() => useGameState(puzzle))
    act(() => {
      result.current.beginStroke(1, 0, 'mark')
      result.current.endStroke()
    })
    act(() => {
      result.current.beginStroke(1, 0, 'fill')
      result.current.endStroke()
    })
    expect(result.current.board[1][0]).toBe('filled')
  })

  it('叉盖不住方块：标记模式点在填充格上不动它', () => {
    const { result } = renderHook(() => useGameState(puzzle))
    act(() => {
      result.current.beginStroke(1, 1, 'fill')
      result.current.endStroke()
    })
    act(() => {
      result.current.beginStroke(1, 1, 'mark')
      result.current.endStroke()
    })
    expect(result.current.board[1][1]).toBe('filled')
  })

  it('一笔填充只涂空格，沿途的叉与方块都绕开', () => {
    const { result } = renderHook(() => useGameState(puzzle))
    act(() => {
      result.current.beginStroke(1, 0, 'mark')
      result.current.endStroke()
    })
    // 拖动：从 (0,0) 起 fill，经过已标记的 (1,0) 与空格 (1,1)
    act(() => {
      result.current.beginStroke(0, 0, 'fill')
      result.current.continueStroke(1, 0)
      result.current.continueStroke(1, 1)
      result.current.endStroke()
    })
    expect(result.current.board[0][0]).toBe('filled')
    expect(result.current.board[1][0]).toBe('marked')
    expect(result.current.board[1][1]).toBe('filled')
  })

  it('线索 5 拖到底：填满后自动补的叉不被同一笔顺手吃掉', () => {
    const line = rowPuzzle([1, 1, 1, 1, 1, 0, 0, 0, 0, 0])
    const { result } = renderHook(() => useGameState(line))

    // 从第 1 格一路拖到第 10 格：前 5 格填满即满足线索，后 5 格自动补叉
    const row = dragTopRow(result, 0, 9)

    expect(row).toEqual([
      'filled', 'filled', 'filled', 'filled', 'filled',
      'marked', 'marked', 'marked', 'marked', 'marked',
    ])
  })

  it('线索 2 3 中间那段留白：从左拖到底只补两端，不碰中间的叉', () => {
    const line = rowPuzzle([1, 1, 0, 0, 0, 0, 0, 1, 1, 1])
    const { result } = renderHook(() => useGameState(line))

    // 先把中间五格标成叉（玩家自己推出来的留白）
    act(() => {
      result.current.beginStroke(0, 2, 'mark')
      for (let c = 3; c <= 6; c++) result.current.continueStroke(0, c)
      result.current.endStroke()
    })

    const row = dragTopRow(result, 0, 9)

    expect(row).toEqual([
      'filled', 'filled',
      'marked', 'marked', 'marked', 'marked', 'marked',
      'filled', 'filled', 'filled',
    ])
  })

  it('简易下从叉上起笔只改那一格，不跟着手指往下涂', () => {
    const line = rowPuzzle([1, 1, 0, 0, 0, 0, 0, 1, 1, 1])
    const { result } = renderHook(() => useGameState(line))
    act(() => {
      result.current.beginStroke(0, 2, 'mark')
      result.current.endStroke()
    })

    const row = dragTopRow(result, 2, 6)

    expect(row[2]).toBe('filled')
    expect(row.slice(3, 7)).toEqual(['empty', 'empty', 'empty', 'empty'])
    // 但它仍是完整的一笔，撤销收得回来
    expect(result.current.canUndo).toBe(true)
    act(() => result.current.undo())
    expect(result.current.board[0][2]).toBe('marked')
  })

  it('简易下从方块起笔可以连着擦，沿途的叉不动', () => {
    const line = rowPuzzle([1, 1, 0, 1, 1, 0, 0, 0, 0, 0])
    const { result } = renderHook(() => useGameState(line))
    // 先在第 3 格落一个叉，再从空格起笔涂过整段——涂的那笔会绕开它
    act(() => {
      result.current.beginStroke(0, 2, 'mark')
      result.current.endStroke()
    })
    dragTopRow(result, 0, 4)
    expect(result.current.board[0].slice(0, 5)).toEqual([
      'filled', 'filled', 'marked', 'filled', 'filled',
    ])

    // 从已填的第 1 格起笔一路拖到第 5 格：方块连着擦掉，中间那个叉不动
    const row = dragTopRow(result, 0, 4)

    expect(row.slice(0, 5)).toEqual(['empty', 'empty', 'marked', 'empty', 'empty'])
  })

  it('简易下从叉起笔可以连着擦叉，沿途的方块不动', () => {
    const line = rowPuzzle([0, 0, 1, 0, 0, 1, 1, 1, 1, 1])
    const { result } = renderHook(() => useGameState(line))
    // 先在第 3 格落一个方块，再从空格起笔画过整段——画叉那笔会绕开它
    act(() => {
      result.current.beginStroke(0, 2, 'fill')
      result.current.endStroke()
    })
    act(() => {
      result.current.beginStroke(0, 0, 'mark')
      for (let c = 1; c <= 4; c++) result.current.continueStroke(0, c)
      result.current.endStroke()
    })
    expect(result.current.board[0].slice(0, 5)).toEqual([
      'marked', 'marked', 'filled', 'marked', 'marked',
    ])

    // 从叉上起笔再拖一遍：叉连着擦掉，中间那个方块不动
    act(() => {
      result.current.beginStroke(0, 0, 'mark')
      for (let c = 1; c <= 4; c++) result.current.continueStroke(0, c)
      result.current.endStroke()
    })
    expect(result.current.board[0].slice(0, 5)).toEqual([
      'empty', 'empty', 'filled', 'empty', 'empty',
    ])

    // 连着擦掉的四个叉算一笔，撤销一次全回来
    act(() => result.current.undo())
    expect(result.current.board[0].slice(0, 5)).toEqual([
      'marked', 'marked', 'filled', 'marked', 'marked',
    ])
  })

  it('严谨下擦除仍可连着擦，且不碰沿途的叉', () => {
    const strict = { strokeRule: 'strict' as const, autoMark: true }
    const { result } = renderHook(() => useGameState(puzzleWithEmptyLines, undefined, strict))
    act(() => {
      // (2,1) 满足第 3 行线索 [1]，该行剩余的 (2,2) 被自动标记
      result.current.beginStroke(2, 1, 'fill')
      result.current.endStroke()
    })
    expect(result.current.board[2]).toEqual(['marked', 'filled', 'marked'])

    act(() => {
      result.current.beginStroke(2, 1, 'fill')
      result.current.continueStroke(2, 2)
      result.current.endStroke()
    })
    expect(result.current.board[2]).toEqual(['marked', 'empty', 'marked'])
  })

  it('solve 直接摆出解答并判胜，撤销栈清空', () => {
    const { result } = renderHook(() => useGameState(puzzle))
    act(() => {
      result.current.beginStroke(0, 0, 'fill')
      result.current.endStroke()
    })
    expect(result.current.canUndo).toBe(true)

    act(() => result.current.solve())

    expect(result.current.status).toBe('won')
    expect(result.current.board).toEqual([
      ['filled', 'filled'],
      ['marked', 'filled'],
    ])
    // 跳过来的这一步不该能退回去
    expect(result.current.canUndo).toBe(false)
  })

  it('线索匹配即判胜，胜利后不再接受操作', () => {
    const { result } = renderHook(() => useGameState(puzzle))
    act(() => {
      result.current.beginStroke(0, 0, 'fill')
      result.current.continueStroke(0, 1)
      result.current.endStroke()
    })
    expect(result.current.status).toBe('playing')
    act(() => {
      result.current.beginStroke(1, 1, 'fill')
      result.current.endStroke()
    })
    expect(result.current.status).toBe('won')
    act(() => {
      result.current.beginStroke(1, 0, 'fill')
      result.current.endStroke()
    })
    expect(result.current.board[1][0]).toBe('marked')
  })

  it('填满一行或一列后自动把剩余空格标记为 ×', () => {
    const { result } = renderHook(() => useGameState(puzzle))
    act(() => {
      // (0,0) 已满足第 1 列线索 [1]，应自动标记该列剩余的 (1,0)。
      result.current.beginStroke(0, 0, 'fill')
      result.current.endStroke()
    })
    expect(result.current.board[1][0]).toBe('marked')

    act(() => {
      // (1,1) 满足第 2 行线索 [1]；该行剩余格已标记，保持不变。
      result.current.beginStroke(1, 1, 'fill')
      result.current.endStroke()
    })
    expect(result.current.board[1]).toEqual(['marked', 'filled'])
  })

  it('从存档恢复棋盘；存档损坏时从空盘开始', () => {
    const { result } = renderHook(() => useGameState(puzzle, '#x.#'))
    expect(result.current.board[0][0]).toBe('filled')
    expect(result.current.board[0][1]).toBe('marked')
    const { result: broken } = renderHook(() => useGameState(puzzle, '###'))
    expect(broken.current.board[0][0]).toBe('empty')
  })

  it('开局预填全空行列的叉，并把它们视为未操作状态', () => {
    const { result } = renderHook(() => useGameState(puzzleWithEmptyLines))
    expect(result.current.board).toEqual([
      ['marked', 'marked', 'marked'],
      ['marked', 'empty', 'empty'],
      ['marked', 'empty', 'empty'],
    ])
    expect(result.current.isPristine).toBe(true)
  })

  it('恢复旧存档时强制修正预设格，并保留其他进度', () => {
    const { result } = renderHook(() => useGameState(puzzleWithEmptyLines, '####.....'))
    expect(result.current.board).toEqual([
      ['marked', 'marked', 'marked'],
      ['marked', 'empty', 'empty'],
      ['marked', 'empty', 'empty'],
    ])

    const { result: progressed } = renderHook(() => useGameState(puzzleWithEmptyLines, '....#....'))
    expect(progressed.current.board[1][1]).toBe('filled')
    expect(progressed.current.isPristine).toBe(false)
  })

  it('预设叉不可单击或在拖动中清除', () => {
    const { result } = renderHook(() => useGameState(puzzleWithEmptyLines))
    act(() => {
      result.current.beginStroke(0, 0, 'mark')
      result.current.endStroke()
      result.current.beginStroke(2, 2, 'mark')
      result.current.continueStroke(0, 2)
      result.current.endStroke()
    })
    expect(result.current.board[0][0]).toBe('marked')
    expect(result.current.board[0][2]).toBe('marked')
    expect(result.current.board[2][2]).toBe('marked')
  })

  it('含空行列的关卡可正常获胜', () => {
    const { result } = renderHook(() => useGameState(puzzleWithEmptyLines))
    act(() => {
      result.current.beginStroke(1, 1, 'fill')
      result.current.continueStroke(1, 2)
      result.current.endStroke()
      result.current.beginStroke(2, 1, 'fill')
      result.current.endStroke()
    })
    expect(result.current.status).toBe('won')
  })

  it('撤销单格：一次点击退回落笔前', () => {
    const { result } = renderHook(() => useGameState(puzzleWithEmptyLines))
    expect(result.current.canUndo).toBe(false)
    act(() => {
      result.current.beginStroke(1, 1, 'fill')
      result.current.endStroke()
    })
    expect(result.current.canUndo).toBe(true)

    act(() => result.current.undo())

    expect(result.current.board[1][1]).toBe('empty')
    expect(result.current.canUndo).toBe(false)
  })

  it('撤销一笔拖动：整条一起收回，不是一格一格退', () => {
    const { result } = renderHook(() => useGameState(puzzleWithEmptyLines))
    act(() => {
      result.current.beginStroke(1, 1, 'fill')
      result.current.continueStroke(1, 2)
      result.current.endStroke()
    })
    expect(result.current.board[1]).toEqual(['marked', 'filled', 'filled'])

    act(() => result.current.undo())

    expect(result.current.board[1]).toEqual(['marked', 'empty', 'empty'])
    expect(result.current.canUndo).toBe(false)
  })

  it('撤销连带收回自动补上的叉', () => {
    const { result } = renderHook(() => useGameState(puzzle))
    act(() => {
      // (0,0) 满足第 1 列线索 [1]，该列剩余的 (1,0) 被自动标记
      result.current.beginStroke(0, 0, 'fill')
      result.current.endStroke()
    })
    expect(result.current.board[1][0]).toBe('marked')

    act(() => result.current.undo())

    expect(result.current.board[0][0]).toBe('empty')
    expect(result.current.board[1][0]).toBe('empty')
  })

  it('空手一按不占撤销栈（预设叉点不动）', () => {
    const { result } = renderHook(() => useGameState(puzzleWithEmptyLines))
    act(() => {
      result.current.beginStroke(0, 0, 'mark')
      result.current.endStroke()
    })
    expect(result.current.canUndo).toBe(false)
  })

  it('可连续撤销多笔；重新开始后撤销栈清空', () => {
    const { result } = renderHook(() => useGameState(puzzleWithEmptyLines))
    act(() => {
      result.current.beginStroke(1, 1, 'fill')
      result.current.endStroke()
      result.current.beginStroke(2, 2, 'mark')
      result.current.endStroke()
    })
    act(() => result.current.undo())
    expect(result.current.board[2][2]).toBe('empty')
    expect(result.current.board[1][1]).toBe('filled')

    act(() => {
      result.current.beginStroke(2, 1, 'mark')
      result.current.endStroke()
    })
    act(() => result.current.reset())

    expect(result.current.canUndo).toBe(false)
  })

  it('重新开始会清空玩家填写与标记，并保留关卡预设叉', () => {
    const { result } = renderHook(() => useGameState(puzzleWithEmptyLines))
    act(() => {
      result.current.beginStroke(1, 1, 'fill')
      result.current.endStroke()
      result.current.beginStroke(2, 2, 'mark')
      result.current.endStroke()
    })
    expect(result.current.isPristine).toBe(false)

    act(() => result.current.reset())

    expect(result.current.board).toEqual([
      ['marked', 'marked', 'marked'],
      ['marked', 'empty', 'empty'],
      ['marked', 'empty', 'empty'],
    ])
    expect(result.current.status).toBe('playing')
    expect(result.current.isPristine).toBe(true)
  })

  describe('规则来自设置', () => {
    it('严谨模式下方块与叉互不干扰，也不会顺手涂掉沿途的叉', () => {
      const strict = { strokeRule: 'strict' as const, autoMark: true }
      const { result } = renderHook(() => useGameState(puzzle, undefined, strict))
      act(() => {
        result.current.beginStroke(1, 0, 'mark')
        result.current.endStroke()
      })
      // 点在叉上不成笔画
      act(() => {
        result.current.beginStroke(1, 0, 'fill')
        result.current.endStroke()
      })
      expect(result.current.board[1][0]).toBe('marked')

      // 拖过的叉同样不动
      act(() => {
        result.current.beginStroke(0, 0, 'fill')
        result.current.continueStroke(1, 0)
        result.current.continueStroke(1, 1)
        result.current.endStroke()
      })
      expect(result.current.board[1][0]).toBe('marked')
      expect(result.current.board[1][1]).toBe('filled')
    })

    it('关掉自动补叉后，补完整行整列不再替玩家标记', () => {
      const noAuto = { strokeRule: 'easy' as const, autoMark: false }
      const { result } = renderHook(() => useGameState(puzzle, undefined, noAuto))
      act(() => {
        // (0,0) 满足第 1 列线索 [1]，开着时会自动标记 (1,0)
        result.current.beginStroke(0, 0, 'fill')
        result.current.endStroke()
      })
      expect(result.current.board[1][0]).toBe('empty')
      expect(result.current.status).toBe('playing')
    })

    it('关掉自动补叉不影响胜利判定', () => {
      const noAuto = { strokeRule: 'easy' as const, autoMark: false }
      const { result } = renderHook(() => useGameState(puzzle, undefined, noAuto))
      act(() => {
        result.current.beginStroke(0, 0, 'fill')
        result.current.continueStroke(0, 1)
        result.current.endStroke()
        result.current.beginStroke(1, 1, 'fill')
        result.current.endStroke()
      })
      expect(result.current.status).toBe('won')
    })

    it('中途换规则不重置盘面与撤销栈', () => {
      let rules: GameRules = { strokeRule: 'easy', autoMark: true }
      const { result, rerender } = renderHook(() => useGameState(puzzle, undefined, rules))
      act(() => {
        result.current.beginStroke(0, 0, 'fill')
        result.current.endStroke()
      })
      expect(result.current.board[0][0]).toBe('filled')

      rules = { strokeRule: 'strict', autoMark: false }
      rerender()

      expect(result.current.board[0][0]).toBe('filled')
      expect(result.current.canUndo).toBe(true)
    })
  })
})


describe('store listing screenshot board', () => {
  it('fills the answer without winning, ignores strokes, and resets normally', () => {
    const { result } = renderHook(() => useGameState(puzzle))
    act(() => { result.current.screenshot() })
    expect(result.current.board).toEqual([['filled', 'filled'], ['marked', 'filled']])
    expect(result.current.status).toBe('playing')
    expect(result.current.boardChangeSource).toBe('screenshot')
    expect(result.current.previewStroke(0, 0, 'fill')).toBeNull()
    act(() => { result.current.beginStroke(0, 0, 'fill'); result.current.undo() })
    expect(result.current.board[0][0]).toBe('filled')
    act(() => { result.current.reset() })
    expect(result.current.boardChangeSource).toBe('reset')
    expect(result.current.status).toBe('playing')
  })
})
