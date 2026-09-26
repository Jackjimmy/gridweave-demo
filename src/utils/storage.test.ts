import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Board } from '../types'
import {
  createEmptyBoard,
  decodeBoard,
  encodeBoard,
  hasFailedSaves,
  loadProgress,
  retryFailedSaves,
  saveProgress,
  subscribeSaveFailure,
} from './storage'

describe('encodeBoard / decodeBoard', () => {
  it('往返一致', () => {
    const board: Board = [
      ['filled', 'empty'],
      ['marked', 'filled'],
    ]
    const encoded = encodeBoard(board)
    expect(encoded).toBe('#.x#')
    expect(decodeBoard(encoded, 2)).toEqual(board)
  })

  it('长度不符或含非法字符时返回 null', () => {
    expect(decodeBoard('#.x', 2)).toBeNull()
    expect(decodeBoard('#.x?', 2)).toBeNull()
  })

  it('createEmptyBoard 全为 empty', () => {
    expect(encodeBoard(createEmptyBoard(3))).toBe('.'.repeat(9))
  })
})

describe('progress 存取', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('保存后可读回', () => {
    saveProgress('festive-tales-01-heart', {
      version: 1,
      board: '#.x#',
      elapsedSeconds: 42,
      completed: false,
    })
    expect(localStorage.getItem('nonogram:progress:festive-tales-01-heart')).not.toBeNull()
    expect(loadProgress('festive-tales-01-heart')?.elapsedSeconds).toBe(42)
  })

  it('损坏的存档返回 null', () => {
    localStorage.setItem('nonogram:progress:bad', '{not json')
    expect(loadProgress('bad')).toBeNull()
    localStorage.setItem('nonogram:progress:bad2', JSON.stringify({ version: 99 }))
    expect(loadProgress('bad2')).toBeNull()
  })

  /*
   * version 认的是**这一版 schema**，不是「有个数字」。
   *
   * 将来真要改结构，得在这里写明这一版怎么迁移过来；在那之前，不认识的版本
   * 一律拒收——把未来的存档当成本版的读，读出来的每一个字段都只是碰巧对得上。
   */
  it('version 只认 1：更高的版本、字符串和缺省一律拒收', () => {
    const base = { board: '.', elapsedSeconds: 0, completed: false }
    for (const [name, version] of [
      ['future', 2],
      ['string', '1'],
      ['float', 1.5],
      ['missing', undefined],
    ] as const) {
      localStorage.setItem(`nonogram:progress:${name}`, JSON.stringify({ ...base, version }))
      expect(loadProgress(name)).toBeNull()
    }
  })

  it('必填项类型不对就整条作废', () => {
    const base = { version: 1, board: '.', elapsedSeconds: 0, completed: false }
    localStorage.setItem('nonogram:progress:neg', JSON.stringify({ ...base, elapsedSeconds: -30 }))
    expect(loadProgress('neg')).toBeNull()
    localStorage.setItem('nonogram:progress:nan', JSON.stringify({ ...base, elapsedSeconds: 'x' }))
    expect(loadProgress('nan')).toBeNull()
    localStorage.setItem('nonogram:progress:done', JSON.stringify({ ...base, completed: 1 }))
    expect(loadProgress('done')).toBeNull()
  })

  it('可选项坏掉只丢它自己，通关记录本身留着', () => {
    localStorage.setItem(
      'nonogram:progress:loose',
      JSON.stringify({
        version: 1,
        board: '',
        elapsedSeconds: 12,
        completed: true,
        everCompleted: 'yes',
        bestTimeSeconds: 'oops',
        completedAt: -1,
        firstClearedAt: 1700000000000,
      }),
    )
    expect(loadProgress('loose')).toEqual({
      version: 1,
      board: '',
      elapsedSeconds: 12,
      completed: true,
      firstClearedAt: 1700000000000,
    })
  })

  it('localStorage 抛错时不炸，但如实返回 false', () => {
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(
      saveProgress('festive-tales-01-heart', {
        version: 1,
        board: '',
        elapsedSeconds: 0,
        completed: false,
      }),
    ).toBe(false)
    expect(warn).toHaveBeenCalled()
    spy.mockRestore()
    warn.mockRestore()
    retryFailedSaves()
  })
})

/** 写不进去这件事得有人知道：一句 console.warn 打发不了玩家花掉的时间 */
describe('写失败登记与重试', () => {
  const progress = { version: 1, board: '#...', elapsedSeconds: 7, completed: false } as const

  beforeEach(() => {
    localStorage.clear()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    retryFailedSaves()
    vi.restoreAllMocks()
  })

  it('失败记下来、通知订阅者，重试成功后清账', () => {
    const seen = vi.fn()
    const unsubscribe = subscribeSaveFailure(seen)
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })

    expect(saveProgress('festive-tales-01-heart', progress)).toBe(false)
    expect(hasFailedSaves()).toBe(true)
    expect(seen).toHaveBeenCalledTimes(1)

    // 还是写不进去：重试如实说没成，也不重复吵一遍
    spy.mockClear()
    expect(retryFailedSaves()).toBe(false)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(seen).toHaveBeenCalledTimes(1)

    spy.mockRestore()
    expect(retryFailedSaves()).toBe(true)
    expect(hasFailedSaves()).toBe(false)
    expect(loadProgress('festive-tales-01-heart')?.elapsedSeconds).toBe(7)
    expect(seen).toHaveBeenCalledTimes(2)
    unsubscribe()
  })

  it('中途写成功了就把旧账清掉，重试不会拿旧盘面盖掉新进度', () => {
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    saveProgress('festive-tales-01-heart', progress)
    spy.mockRestore()

    // 存储恢复了，玩家又落了一笔——这一笔正常写了进去，攒下的那条就此作废
    expect(saveProgress('festive-tales-01-heart', { ...progress, board: '###.', elapsedSeconds: 20 })).toBe(
      true,
    )
    expect(hasFailedSaves()).toBe(false)

    expect(retryFailedSaves()).toBe(true)
    expect(loadProgress('festive-tales-01-heart')).toEqual(
      expect.objectContaining({ board: '###.', elapsedSeconds: 20 }),
    )
  })

  it('同一关只留最新那一份，重试写下去的是当前盘面', () => {
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    saveProgress('festive-tales-01-heart', progress)
    saveProgress('festive-tales-01-heart', { ...progress, board: '##..', elapsedSeconds: 9 })
    spy.mockRestore()

    expect(retryFailedSaves()).toBe(true)
    expect(loadProgress('festive-tales-01-heart')).toEqual(
      expect.objectContaining({ board: '##..', elapsedSeconds: 9 }),
    )
  })
})
