import { describe, expect, it } from 'vitest'
import { cellsAlongAxis, clampPointToBoard, resolveLockedCell } from './usePointerInput'

describe('resolveLockedCell', () => {
  it('首次移动按主方向锁定为同一行', () => {
    const result = resolveLockedCell({ row: 2, col: 2 }, { row: 3, col: 6 }, null)
    expect(result).toEqual({ cell: { row: 2, col: 6 }, axis: 'row' })
  })

  it('纵向锁定后忽略后续横向偏移', () => {
    const result = resolveLockedCell({ row: 2, col: 2 }, { row: 7, col: 5 }, 'col')
    expect(result).toEqual({ cell: { row: 7, col: 2 }, axis: 'col' })
  })

  it('快速横向移动时补齐被 pointermove 跳过的格子', () => {
    expect(cellsAlongAxis({ row: 1, col: 1 }, { row: 1, col: 4 }, 'row')).toEqual([
      { row: 1, col: 2 },
      { row: 1, col: 3 },
      { row: 1, col: 4 },
    ])
  })
})

describe('clampPointToBoard', () => {
  const rect = { left: 100, right: 400, top: 200, bottom: 500 }

  it('划最后一行时手指落到棋盘下方，纵坐标夹回末行内部、横坐标不动', () => {
    expect(clampPointToBoard(rect, 260, 560)).toEqual({ x: 260, y: 497 })
  })

  it('划过右边界时夹回末列', () => {
    expect(clampPointToBoard(rect, 480, 300)).toEqual({ x: 397, y: 300 })
  })

  it('棋盘内的坐标原样返回', () => {
    expect(clampPointToBoard(rect, 260, 300)).toEqual({ x: 260, y: 300 })
  })
})
