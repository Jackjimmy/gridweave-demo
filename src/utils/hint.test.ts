import { describe, expect, it } from 'vitest'
import type { Board, CellState } from '../types'
import { loadAllAlbums, puzzleLibrary } from '../data'
import { checkWinByClues, deriveClues, getColumn } from './clues'
import { analyseLine, analysePlacements, findHint, findMistake, hintFocusCell } from './hint'
import { createPuzzleBoard } from './presetMarks'
import { solveLine } from './solver'

/*
 * 关卡库按册分块加载（见 src/data/index.ts）：没翻开的册子只有占位，没有画。
 * 这个文件的用例要拿真关卡当样本，所以在顶层先把整库拉齐——顶层 await 排在
 * 下面每一条 describe 之前，取样本时手上就已经是全库了。
 */
await loadAllAlbums()
const puzzles = puzzleLibrary()

const line = (s: string): CellState[] =>
  [...s].map((ch) => (ch === '#' ? 'filled' : ch === 'x' ? 'marked' : 'empty'))

const board = (rows: string[]): Board => rows.map(line)

const cellsOf = (s: string, clue: number[]) =>
  analyseLine(line(s), clue)?.cells.map((c) => `${c.at}${c.state === 'filled' ? '#' : 'x'}`)

describe('analyseLine：讲的必须是真的', () => {
  it('两头被叉夹住时是「只有一处放得下」，不是重叠', () => {
    // 旧实现按空线算最左最右，得出 0→2 两种摆法——两个都压在叉上，纯属瞎讲
    const result = analyseLine(line('x...x'), [3])
    expect(result?.technique).toBe('run-anchored')
    expect(result?.overlap).toBeUndefined()
    expect(result?.cells).toEqual([
      { at: 1, state: 'filled' },
      { at: 2, state: 'filled' },
      { at: 3, state: 'filled' },
    ])
  })

  it('重叠演示的两种摆法都得真摆得下：左端有叉时最左摆法跟着右移', () => {
    const open = analyseLine(line('..........'), [7])
    expect(open?.overlap).toMatchObject({ leftStart: 0, rightStart: 3 })

    const blocked = analyseLine(line('x.........'), [7])
    expect(blocked?.overlap).toMatchObject({ leftStart: 1, rightStart: 3 })
    expect(blocked?.cells).toHaveLength(5)
  })

  it('一段的位置被叉钉死时，讲「填完这一段」而不是「先打个叉」', () => {
    // 图1 的最后一行：6 只能摆在 2..7，左端那格顺带也能排除，但那不是玩家要的
    expect(cellsOf('.x#####..x', [6])).toEqual(['7#'])
    expect(analyseLine(line('.x#####..x'), [6])?.technique).toBe('run-anchored')
  })

  it('只高亮这一手真正推出来的格子，不把整条线的结论一起倒出来', () => {
    // [7] 的重叠只保证中间 4 格，别的什么都没说
    expect(cellsOf('..........', [7])).toEqual(['3#', '4#', '5#', '6#'])
  })

  it('线索正好占满整线时不叫重叠', () => {
    expect(analyseLine(line('.....'), [5])?.technique).toBe('full-line')
    expect(analyseLine(line('.....'), [2, 2])?.technique).toBe('full-line')
  })

  it('线索找齐后其余格子都是空的', () => {
    const result = analyseLine(line('##...'), [2])
    expect(result?.technique).toBe('clue-satisfied')
    expect(result?.cells).toEqual([
      { at: 2, state: 'marked' },
      { at: 3, state: 'marked' },
      { at: 4, state: 'marked' },
    ])
  })

  it('推不出新格子或盘面矛盾时返回 null', () => {
    expect(analyseLine(line('#####'), [5])).toBeNull()
    expect(analyseLine(line('#x#x#'), [5])).toBeNull()
  })
})

describe('analysePlacements 与 solver 同源', () => {
  /** 穷举 6 格线上的全部盘面与线索，逐格比对「能定下来的格子」 */
  it('推出的格子与 solveLine 逐格一致', () => {
    const n = 6
    const states: CellState[] = ['empty', 'filled', 'marked']
    const clues: number[][] = []
    const gen = (prefix: number[], remaining: number) => {
      if (prefix.length > 0) clues.push([...prefix])
      for (let v = 1; v <= remaining; v++) gen([...prefix, v], remaining - v - 1)
    }
    gen([], n)

    let checked = 0
    for (let mask = 0; mask < 3 ** n; mask++) {
      const current: CellState[] = []
      let m = mask
      for (let i = 0; i < n; i++) {
        current.push(states[m % 3])
        m = Math.floor(m / 3)
      }
      for (const clue of clues) {
        const reference = solveLine(current, clue)
        const placements = analysePlacements(current, clue)
        if (!reference) {
          expect(placements).toBeNull()
          continue
        }
        expect(placements).not.toBeNull()
        for (let i = 0; i < n; i++) {
          const mine =
            placements!.canFill[i] && !placements!.canBlank[i]
              ? 'filled'
              : placements!.canBlank[i] && !placements!.canFill[i]
                ? 'marked'
                : 'empty'
          expect(mine).toBe(reference[i])
        }
        checked++
      }
    }
    expect(checked).toBeGreaterThan(1000)
  })

  it('幽灵条的两种摆法永远落在真摆得下的位置', () => {
    const n = 7
    const states: CellState[] = ['empty', 'filled', 'marked']
    const clues: number[][] = []
    const gen = (prefix: number[], remaining: number) => {
      if (prefix.length > 0) clues.push([...prefix])
      for (let v = 1; v <= remaining; v++) gen([...prefix, v], remaining - v - 1)
    }
    gen([], n)

    let demos = 0
    for (let mask = 0; mask < 3 ** n; mask++) {
      const current: CellState[] = []
      let m = mask
      for (let i = 0; i < n; i++) {
        current.push(states[m % 3])
        m = Math.floor(m / 3)
      }
      for (const clue of clues) {
        const demo = analyseLine(current, clue)?.overlap
        if (!demo) continue
        demos++
        for (const start of [demo.leftStart, demo.rightStart]) {
          for (let c = start; c < start + demo.run; c++) {
            // 摆法压在叉上，就是当着玩家的面撒谎
            expect(current[c]).not.toBe('marked')
          }
        }
        expect(demo.leftStart).toBeLessThan(demo.rightStart)
        expect(demo.from).toBeLessThanOrEqual(demo.to)
      }
    }
    expect(demos).toBeGreaterThan(100)
  })
})

describe('findHint：按人挑，不按 solver 的遍历顺序挑', () => {
  it('接近占满的重叠（[4] 填 5 格）排在真要想的重叠（[7] 填 10 格）前面', () => {
    const empty = (n: number) => new Array<CellState>(n).fill('empty')
    const near = analyseLine(empty(5), [4])!
    const far = analyseLine(empty(10), [7])!
    expect(near.technique).toBe('overlap')
    expect(far.technique).toBe('overlap')
    expect(near.score).toBeLessThan(far.score)
    // 「只有一处放得下」仍然排在两者前面
    const anchored = analyseLine(['marked', 'empty', 'empty', 'empty', 'marked'], [3])!
    expect(anchored.technique).toBe('run-anchored')
    expect(anchored.score).toBeLessThan(near.score)
  })

  it('多个数字正好占满的线（[2,2] 填 5 格）也排在重叠前面', () => {
    const empty = (n: number) => new Array<CellState>(n).fill('empty')
    const full = analyseLine(empty(5), [2, 2])!
    expect(full.technique).toBe('full-line')
    expect(full.score).toBeLessThan(analyseLine(empty(5), [4])!.score)
  })

  it('单个数字占满整线时文案直接报那个数', () => {
    const solution = Array.from({ length: 5 }, (_, r) => new Array<number>(5).fill(r === 0 ? 1 : 0))
    const hint = findHint(
      Array.from({ length: 5 }, () => new Array<CellState>(5).fill('empty')),
      deriveClues(solution),
      solution,
    )
    expect(hint).toMatchObject({ orientation: 'row', index: 0, technique: 'full-line' })
    expect(hint?.message).toBe('数字 5 正好填满这一行，全部涂上')
  })

  it('重叠提示锁定交叠区正中那一格', () => {
    // 第 0 行 [7]，最后一行 [2,1] 补在另外三列上：盘面照正式对局那样先打好空行的叉
    // （createPuzzleBoard），每一列都是 [1] 且剩两格可选，推不出任何一格；
    // [2,1] 那行也没有重叠——能给的只有第 0 行那条重叠
    const solution = Array.from({ length: 10 }, (_, r) =>
      Array.from({ length: 10 }, (_, c) => {
        if (r === 0) return c >= 2 && c <= 8 ? 1 : 0
        if (r === 9) return c <= 1 || c === 9 ? 1 : 0
        return 0
      }),
    )
    const hint = findHint(
      createPuzzleBoard({ size: 10, solution }),
      deriveClues(solution),
      solution,
    )
    expect(hint).toMatchObject({ orientation: 'row', index: 0, technique: 'overlap' })
    expect(hint && hintFocusCell(hint)).toEqual({ row: 0, col: 4 })
  })
})

describe('findHint：纠错优先', () => {
  const HEART = [
    [0, 1, 0, 1, 0],
    [1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1],
    [0, 1, 1, 1, 0],
    [0, 0, 1, 0, 0],
  ]
  const HEART_CLUES = deriveClues(HEART)

  it('盘面涂错时先纠错，不再从错误前提往下推', () => {
    const wrong = board(['#....', '.....', '.....', '.....', '.....'])
    const hint = findHint(wrong, HEART_CLUES, HEART)
    expect(hint).toMatchObject({ technique: 'mistake', orientation: 'row', index: 0, focus: 0 })
  })

  it('打叉打在该填的格子上同样算错', () => {
    expect(findMistake(board(['.x...', '.....', '.....', '.....', '.....']), HEART)).toEqual({
      row: 0,
      col: 1,
    })
  })

  it('已经解完的盘面没有提示可给', () => {
    const solved = HEART.map((row) => row.map((v) => (v === 1 ? 'filled' : 'marked'))) as Board
    expect(findHint(solved, HEART_CLUES, HEART)).toBeNull()
  })
})

/**
 * 全库逐条核对。提示说错一格，比不给提示严重得多——它会让玩家怀疑自己前面
 * 明明想对了的那几步，而且他不会知道是提示错了。
 *
 * 每一条提示都要过四关：说的和答案一致；此刻真的推得出来（不是提前抄答案）；
 * 幽灵条的两种摆法都摆得下；说「只有一处放得下」时那一段的起点范围真的只剩一个值。
 * 148 关跑完约 0.3s。
 */
describe('全库每一条提示都经得起核对', () => {
  it(`${puzzles.length} 关，跟着提示一路走到通关`, () => {
    let steps = 0
    for (const puzzle of puzzles) {
      let current = createPuzzleBoard(puzzle)
      let guard = 0
      while (!checkWinByClues(current, puzzle.clues)) {
        const hint = findHint(current, puzzle.clues, puzzle.solution)
        expect(hint, `${puzzle.id} 第 ${guard} 步没有提示可给`).not.toBeNull()
        const h = hint!
        expect(h.technique).not.toBe('mistake')

        const line = h.orientation === 'row' ? current[h.index] : getColumn(current, h.index)
        const clue =
          h.orientation === 'row' ? puzzle.clues.rows[h.index] : puzzle.clues.cols[h.index]
        const placements = analysePlacements(line, clue)!

        for (const cell of h.cells) {
          const row = h.orientation === 'row' ? h.index : cell.at
          const col = h.orientation === 'row' ? cell.at : h.index
          expect(cell.state, `${puzzle.id} 把 (${row},${col}) 说反了`).toBe(
            puzzle.solution[row][col] === 1 ? 'filled' : 'marked',
          )
          const forced =
            cell.state === 'filled'
              ? placements.canFill[cell.at] && !placements.canBlank[cell.at]
              : placements.canBlank[cell.at] && !placements.canFill[cell.at]
          expect(forced, `${puzzle.id} 的 (${row},${col}) 此刻还推不出来`).toBe(true)
        }

        if (h.overlap) {
          expect(h.overlap.leftStart).toBeLessThan(h.overlap.rightStart)
          for (const at of [h.overlap.leftStart, h.overlap.rightStart]) {
            for (let c = at; c < at + h.overlap.run; c++) {
              expect(line[c], `${puzzle.id} 的幽灵条压在叉上`).not.toBe('marked')
            }
          }
        }
        if (h.technique === 'run-anchored') {
          const fixed = placements.minStart.filter((v, i) => v === placements.maxStart[i])
          expect(fixed.length, `${puzzle.id} 没有定死的段却说定死了`).toBeGreaterThan(0)
        }

        const next = current.map((row) => [...row])
        for (const cell of h.cells) {
          if (h.orientation === 'row') next[h.index][cell.at] = cell.state
          else next[cell.at][h.index] = cell.state
        }
        current = next
        guard++
        steps++
        expect(guard).toBeLessThan(puzzle.size * puzzle.size + 10)
      }
    }
    // 提示真的在推进，而不是靠某种退化路径把关卡"走完"
    expect(steps).toBeGreaterThan(puzzles.length * 10)
    /*
     * 显式给足超时：这一条要把全库走一遍，空载约 1.3 秒，但机器上同时有别的活
     * （另一个会话在跑构建、或 CI 上几个任务并排）时会被拖到十秒开外，撞上 vitest
     * 默认的 5 秒。它慢是本分，为此偶尔红一次不是。
     */
  }, 60_000)
})
