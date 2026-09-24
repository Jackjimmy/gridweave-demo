import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Board, Puzzle, PuzzleProgress } from '../../types'
import { encodeBoard } from '../../utils/storage'
import { Game } from './Game'

const puzzle: Puzzle = {
  id: 'medium-999-restart-test',
  name: { zh: '重开测试', en: 'Restart Test' },
  size: 5,
  difficulty: 'medium',
  solution: [
    [1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1],
  ],
  clues: {
    rows: [[5], [5], [5], [5], [5]],
    cols: [[5], [5], [5], [5], [5]],
  },
  tags: ['symbol'],
  author: 'original',
  createdAt: '2026-07-17',
}

describe('Game restart', () => {
  function renderWithBoard(progress?: PuzzleProgress) {
    const onPersist = vi.fn()
    const onCompleted = vi.fn()
    const { unmount } = render(
      <Game
        puzzle={puzzle}
        initialProgress={progress}
        onPersist={onPersist}
        onCompleted={onCompleted}
        onExit={vi.fn()}
      />,
    )
    return { onPersist, onCompleted, unmount }
  }

  /** 盘上落了一子一叉、已经走了 12 秒的一局 */
  function startedProgress(): PuzzleProgress {
    const board: Board = Array.from({ length: 5 }, () =>
      Array.from({ length: 5 }, () => 'empty'),
    )
    board[0][0] = 'filled'
    board[0][1] = 'marked'
    return { version: 1, board: encodeBoard(board), elapsedSeconds: 12, completed: false }
  }

  it('盘上有东西时先问一句，取消则一格不动', () => {
    const { onPersist } = renderWithBoard(startedProgress())
    onPersist.mockClear()

    fireEvent.click(screen.getByRole('button', { name: '重新开始关卡' }))

    expect(screen.getByRole('dialog', { name: '重新开始这一局？' })).toBeTruthy()
    // 面板上写清此刻要放弃的是多少东西
    expect(screen.getByText(/已填 1 格/)).toBeTruthy()
    expect(screen.getByLabelText('第 1 行第 1 列，已填充')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '继续这一局' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByLabelText('第 1 行第 1 列，已填充')).toBeTruthy()
    expect(onPersist).not.toHaveBeenCalled()
  })

  it('确认之后才清空棋盘、归零计时并立即覆盖未完成存档', () => {
    const { onPersist, onCompleted } = renderWithBoard(startedProgress())

    fireEvent.click(screen.getByRole('button', { name: '重新开始关卡' }))
    fireEvent.click(screen.getByRole('button', { name: '重新开始' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByLabelText('第 1 行第 1 列，未知')).toBeTruthy()
    expect(screen.getByLabelText('第 1 行第 2 列，未知')).toBeTruthy()
    expect(onPersist).toHaveBeenLastCalledWith(
      puzzle.id,
      expect.objectContaining({
        version: 1,
        board: '',
        elapsedSeconds: 0,
        completed: false,
        everCompleted: false,
      }),
    )
    expect(onCompleted).not.toHaveBeenCalled()
  })

  /*
   * 重玩不是"重新解锁"：这一关是什么时候解开的、第一次是什么时候，本局一笔不改。
   *
   * 从前重玩落盘时把这两个时刻一起丢掉，首页收藏架按 completedAt 倒序取前四行，
   * 没有时间戳的一律算"更早"，那幅画因此当场从架上消失（藏品详情里那行
   * "首次完成"也一起没了）。
   */
  it('重玩一关时不动通关时刻：落中途盘、以及重开都照抄', () => {
    const cleared: PuzzleProgress = {
      version: 1,
      board: '',
      elapsedSeconds: 0,
      completed: true,
      everCompleted: true,
      bestTimeSeconds: 42,
      completedAt: 1_700_000_000_000,
      firstClearedAt: 1_600_000_000_000,
    }
    const { onPersist, unmount } = renderWithBoard(cleared)

    const cell = screen.getByLabelText(/^第 1 行第 1 列/)
    fireEvent.pointerDown(cell, { button: 0, pointerType: 'mouse', pointerId: 1 })
    fireEvent.pointerUp(cell, { pointerType: 'mouse', pointerId: 1 })
    // 离开关卡那一下立即落盘，不必等防抖
    unmount()

    expect(onPersist).toHaveBeenLastCalledWith(
      puzzle.id,
      expect.objectContaining({
        completed: false,
        everCompleted: true,
        completedAt: cleared.completedAt,
        firstClearedAt: cleared.firstClearedAt,
      }),
    )
  })

  it('重开一局也照抄通关时刻，不把已通关的关卡降级', () => {
    const cleared: PuzzleProgress = {
      version: 1,
      board: '',
      elapsedSeconds: 0,
      completed: true,
      everCompleted: true,
      completedAt: 1_700_000_000_000,
      firstClearedAt: 1_600_000_000_000,
    }
    const { onPersist } = renderWithBoard(cleared)

    fireEvent.click(screen.getByRole('button', { name: '重新开始关卡' }))

    expect(onPersist).toHaveBeenLastCalledWith(
      puzzle.id,
      expect.objectContaining({
        completed: true,
        everCompleted: true,
        completedAt: cleared.completedAt,
        firstClearedAt: cleared.firstClearedAt,
      }),
    )
  })

  /* 空盘上按下去没有任何东西会失去，那就别拿一张面板去确认一件不会发生的损失 */
  it('空盘不问，直接重开', () => {
    const { onPersist } = renderWithBoard()

    fireEvent.click(screen.getByRole('button', { name: '重新开始关卡' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onPersist).toHaveBeenLastCalledWith(
      puzzle.id,
      expect.objectContaining({ board: '', elapsedSeconds: 0, completed: false }),
    )
  })
})
