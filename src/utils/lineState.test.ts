import { describe, expect, it, vi } from 'vitest'
import type { Board, Clues } from '../types'
import { deriveLineState } from './lineState'
import * as clueUtils from './clues'

function board(rows: string[]): Board {
  return rows.map((row) =>
    [...row].map((ch) => (ch === '#' ? 'filled' : ch === 'x' ? 'marked' : 'empty')),
  )
}

const clues: Clues = {
  rows: [[2], [1], [0]],
  cols: [[2], [1], [0]],
}

/** 全量重算的参照实现，用来钉住增量路径给出完全一致的结果 */
function full(b: Board) {
  return deriveLineState(b, clues)
}

describe('deriveLineState', () => {
  it('无缓存时全量计算，计数与行列判定都正确', () => {
    const state = full(board(['##_', '#__', '___']))

    expect(state.filledCount).toBe(3)
    expect(state.satisfiedRows).toEqual([true, true, true])
    expect(state.satisfiedCols).toEqual([true, true, true])
  })

  it('增量结果与全量结果逐字段一致', () => {
    const before = board(['#__', '#__', '___'])
    const after = board(['##_', '#__', '___'])
    const cache = { board: before, clues, state: full(before) }

    const incremental = deriveLineState(after, clues, cache)

    expect(incremental).toEqual(full(after))
  })

  it('擦除同样走增量，计数往回减', () => {
    const before = board(['##_', '#__', '___'])
    const after = board(['#__', '#__', '___'])
    const cache = { board: before, clues, state: full(before) }

    const incremental = deriveLineState(after, clues, cache)

    expect(incremental.filledCount).toBe(2)
    expect(incremental).toEqual(full(after))
  })

  /**
   * 这是这个模块存在的理由：getCompletedClueSegments 要枚举整条线的所有合法排布，
   * 是对局里最贵的纯函数。一次落子只该重算它所在的那一行与那一列。
   */
  it('一次落子只重算受影响的一行一列，而不是全部 2×size 条线', () => {
    const before = board(['#__', '#__', '___'])
    const after = board(['##_', '#__', '___'])
    const cache = { board: before, clues, state: full(before) }
    const spy = vi.spyOn(clueUtils, 'getCompletedClueSegments')

    deriveLineState(after, clues, cache)

    expect(spy).toHaveBeenCalledTimes(2)
    spy.mockRestore()
  })

  it('盘面对象没变时直接复用上一次的结果', () => {
    const b = board(['##_', '#__', '___'])
    const state = full(b)
    const spy = vi.spyOn(clueUtils, 'getCompletedClueSegments')

    expect(deriveLineState(b, clues, { board: b, clues, state })).toBe(state)
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('线索换了就退回全量，不拿旧结果凑数', () => {
    const b = board(['##_', '#__', '___'])
    const otherClues: Clues = { rows: [[1], [1], [0]], cols: [[2], [1], [0]] }
    const cache = { board: b, clues, state: full(b) }

    const state = deriveLineState(b, otherClues, cache)

    expect(state).toEqual(deriveLineState(b, otherClues))
    expect(state.satisfiedRows[0]).toBe(false)
  })

  /** 补完一行会触发自动补叉，一次改动整行整列——增量路径必须照样对得上 */
  it('一次改动多行多列时结果仍与全量一致', () => {
    const before = board(['___', '___', '___'])
    const after = board(['##_', '#__', 'xxx'])
    const cache = { board: before, clues, state: full(before) }

    expect(deriveLineState(after, clues, cache)).toEqual(full(after))
  })
})
