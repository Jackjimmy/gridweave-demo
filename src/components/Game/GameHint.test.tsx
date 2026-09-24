import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Puzzle } from '../../types'
import { deriveClues } from '../../utils/clues'
import { Game } from './Game'

vi.mock('../../utils/haptics', () => ({
  haptics: {
    prepare: vi.fn(),
    selection: vi.fn(),
    fill: vi.fn(),
    mark: vi.fn(),
    erase: vi.fn(),
    strokeStep: vi.fn(),
    firm: vi.fn(),
    undo: vi.fn(),
    clear: vi.fn(),
    finale: vi.fn(),
  },
}))
vi.mock('../../utils/sound', () => ({
  sound: { prepare: vi.fn(), fill: vi.fn(), mark: vi.fn(), clear: vi.fn(), win: vi.fn() },
  holdSoundOutput: () => () => {},
}))

/**
 * 5×5，第 1 行整行、第 3 行中间 3 格。
 * 第 1 行的线索 [5] 正好占满，提示第一条必然指它；
 * 第 3 行的 [3] 在 5 格线上是标准的重叠法，用来验重叠那套演示。
 */
const solution = [
  [0, 0, 0, 0, 0],
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0],
  [0, 1, 1, 1, 0],
  [0, 0, 0, 0, 0],
]

const puzzle: Puzzle = {
  id: 'medium-997-hint-test',
  name: { zh: '提示测试', en: 'Hint Test' },
  size: 5,
  difficulty: 'medium',
  solution,
  clues: deriveClues(solution),
  tags: ['symbol'],
  author: 'original',
  createdAt: '2026-08-22',
}

/**
 * 10×10，第 1 行是干净的 [7]：左右都有余量，重叠法成立，幽灵条该出场。
 * 第 6 行给三根柱子，只为了让首尾几列不至于整列为空被预先打叉——
 * 那样 [7] 会被夹死，变成「只有一处放得下」，就试不到重叠了。
 */
const wideSolution = Array.from({ length: 10 }, (_, r) =>
  Array.from({ length: 10 }, (_, c) => {
    if (r === 0) return c >= 1 && c <= 7 ? 1 : 0
    if (r === 5) return c === 0 || c >= 8 ? 1 : 0
    return 0
  }),
)

const widePuzzle: Puzzle = {
  ...puzzle,
  id: 'medium-996-hint-overlap',
  size: 10,
  solution: wideSolution,
  clues: deriveClues(wideSolution),
}

function renderGame(which: Puzzle = puzzle) {
  render(<Game puzzle={which} onPersist={vi.fn()} onCompleted={vi.fn()} onExit={vi.fn()} />)
}

const hintButton = () => screen.getByRole('button', { name: '提示' })

function tap(row: number, col: number) {
  const cell = screen.getByLabelText(new RegExp(`^第 ${row + 1} 行第 ${col + 1} 列`))
  fireEvent.pointerDown(cell, { button: 0, pointerType: 'mouse', pointerId: 1 })
  fireEvent.pointerUp(cell, { pointerType: 'mouse', pointerId: 1 })
}

describe('Game 提示', () => {
  it('按一下指出一条线，并说清为什么是它', () => {
    renderGame()

    fireEvent.click(hintButton())

    expect(screen.getByText(/数字 5 正好填满这一行/)).toBeTruthy()
  })

  it('第一次只点一条线，不做行列叠加', () => {
    renderGame()

    fireEvent.click(hintButton())

    // 提示指的是第 2 行（下标 1），此时不该出现锁定交点的那个框
    expect(document.querySelectorAll('[class*="hintBand"]')).toHaveLength(1)
    expect(document.querySelector('[class*="hintFocus"]')).toBeNull()
  })

  it('点出这句话说的是哪几格，涂与叉画法不同', () => {
    renderGame()

    fireEvent.click(hintButton())

    // 第 2 行 [5] 正好占满，说的就是这 5 格，且都是要涂的
    const cells = [...document.querySelectorAll('[class*="hintCell"]')]
    expect(cells).toHaveLength(5)
    expect(cells.every((el) => el.getAttribute('data-state') === 'filled')).toBe(true)
  })

  it('原地再按一次才叠上另一条轴，并锁死交点那一格', () => {
    renderGame()

    fireEvent.click(hintButton())
    fireEvent.click(hintButton())

    expect(document.querySelectorAll('[class*="hintBand"]')).toHaveLength(2)
    expect(document.querySelector('[class*="hintFocus"]')).not.toBeNull()
    expect(screen.getByText(/就是框住的这一格，可以涂上/)).toBeTruthy()
  })

  it('玩家一落子，提示当即作废', () => {
    renderGame()

    fireEvent.click(hintButton())
    expect(document.querySelector('[class*="hintBand"]')).not.toBeNull()

    tap(1, 0)

    expect(document.querySelector('[class*="hintBand"]')).toBeNull()
    expect(screen.queryByText(/数字 5 正好填满这一行/)).toBeNull()
  })

  it('涂错了先说涂错，不从错误前提往下推', () => {
    renderGame()

    // (3,0) 在答案里是空的；第 1 行整行为空，会被预先打 × 涂不上，不能拿来试
    tap(3, 0)
    fireEvent.click(hintButton())

    expect(screen.getByText(/和线索对不上/)).toBeTruthy()
  })

  it('重叠法带上那段幽灵条演示', () => {
    renderGame(widePuzzle)

    fireEvent.click(hintButton())

    expect(screen.getByText(/数字 7 不管放哪/)).toBeTruthy()
    expect(document.querySelector('[class*="hintGhost"]')).not.toBeNull()
  })

  it('两头被夹死时不放幽灵条，直接说位置只有一处', () => {
    renderGame()

    // 涂完整行 [5]，两侧的 [1] 列随之满足、自动补叉，第 4 行的 3 就被夹死了
    for (let col = 0; col < 5; col++) tap(1, col)
    fireEvent.click(hintButton())

    expect(screen.getByText(/数字 3 只有一处放得下/)).toBeTruthy()
    expect(document.querySelector('[class*="hintGhost"]')).toBeNull()
  })
})
