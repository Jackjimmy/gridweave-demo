import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Puzzle } from '../../types'
import { demoRoom } from '../../config/demo'
import { Game } from './Game'

/*
 * 网页试玩版的对局：线索槽与基准字号按视口的宽裕度（demoRoom）连续放大到桌面尺度。
 * `isDemoBuild` 是构建期常量，这里换成 true；视口用 innerWidth / innerHeight 桩。
 */
vi.mock('../../config/demo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../config/demo')>()),
  isDemoBuild: true,
}))

function stubViewport(width: number, height: number) {
  vi.stubGlobal('innerWidth', width)
  vi.stubGlobal('innerHeight', height)
}

const puzzle: Puzzle = {
  id: 'hard-999-demo-roomy',
  name: { zh: '一点', en: 'Dot' },
  size: 15,
  difficulty: 'hard',
  solution: Array.from({ length: 15 }, (_, r) => Array.from({ length: 15 }, (_, c) => (r === 0 && c === 0 ? 1 : 0))),
  clues: {
    rows: Array.from({ length: 15 }, (_, r) => (r === 0 ? [1] : [0])),
    cols: Array.from({ length: 15 }, (_, c) => (c === 0 ? [1] : [0])),
  },
  tags: ['symbol'],
  author: 'original',
  createdAt: '2026-09-21',
}

function pageVars() {
  const page = document.querySelector('[style*="--clue-gutter-row"]') as HTMLElement
  return {
    row: page.style.getPropertyValue('--clue-gutter-row'),
    col: page.style.getPropertyValue('--clue-gutter-col'),
    room: page.style.getPropertyValue('--demo-room'),
    scale: page.style.getPropertyValue('--clue-scale'),
  }
}

describe('demoRoom', () => {
  it('按视口短边连续取值：480 以下是手机（0），840 起是桌面全屏（1），中间线性', () => {
    expect(demoRoom(375, 812)).toBe(0)
    expect(demoRoom(844, 390)).toBe(0)
    expect(demoRoom(1280, 660)).toBe(0.5)
    expect(demoRoom(1280, 720)).toBe(0.66)
    expect(demoRoom(768, 1024)).toBe(0.8)
    expect(demoRoom(1440, 900)).toBe(1)
  })
})

describe('Game（试玩版，视口宽裕度）', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('桌面全屏上两轴线索槽按 1.6 倍给（15×15：28 / 40 → 44 / 64），宽裕度写进页面变量', () => {
    stubViewport(1440, 900)
    render(<Game puzzle={puzzle} onPersist={vi.fn()} onCompleted={vi.fn()} onExit={vi.fn()} />)
    expect(pageVars()).toEqual({ row: '44px', col: '64px', room: '1', scale: '1.6' })
  })

  it('手机（竖着或横过来）仍是手机那套槽宽', () => {
    stubViewport(844, 390)
    render(<Game puzzle={puzzle} onPersist={vi.fn()} onCompleted={vi.fn()} onExit={vi.fn()} />)
    expect(pageVars()).toEqual({ row: '28px', col: '40px', room: '0', scale: '1' })
  })

  it('中间尺寸落在两者之间，不是二选一', () => {
    stubViewport(1280, 660)
    render(<Game puzzle={puzzle} onPersist={vi.fn()} onCompleted={vi.fn()} onExit={vi.fn()} />)
    const vars = pageVars()
    expect(vars.room).toBe('0.5')
    expect(vars.scale).toBe('1.3')
    expect(parseInt(vars.row)).toBeGreaterThan(28)
    expect(parseInt(vars.row)).toBeLessThan(44)
  })
})
