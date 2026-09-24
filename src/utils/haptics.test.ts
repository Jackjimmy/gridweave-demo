import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { NativeGameHaptics } from './nativeGameHaptics'
import { haptics, setVibrationEnabled, setVibrationStyle } from './haptics'

vi.mock('./nativeGameHaptics', () => ({
  NativeGameHaptics: {
    prepare: vi.fn(() => Promise.resolve()),
    trigger: vi.fn(() => Promise.resolve()),
  },
}))

vi.mock('@capacitor/haptics', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@capacitor/haptics')>()
  return {
    ...actual,
    Haptics: {
      impact: vi.fn(() => Promise.resolve()),
      notification: vi.fn(() => Promise.resolve()),
      selectionChanged: vi.fn(() => Promise.resolve()),
    },
  }
})

const gameHaptics = NativeGameHaptics as unknown as {
  prepare: ReturnType<typeof vi.fn>
  trigger: ReturnType<typeof vi.fn>
}
const capacitorHaptics = Haptics as unknown as {
  impact: ReturnType<typeof vi.fn>
  notification: ReturnType<typeof vi.fn>
  selectionChanged: ReturnType<typeof vi.fn>
}

function resetHaptics() {
  setVibrationEnabled(true)
  setVibrationStyle('vivid')
}

describe('haptics（浏览器兜底路径）', () => {
  let vibrate: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vibrate = vi.fn()
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate })
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false)
    resetHaptics()
  })

  afterEach(() => {
    resetHaptics()
    vi.restoreAllMocks()
  })

  it('每条业务语义立即产生一记，后续格比首格轻', () => {
    haptics.fill()
    haptics.strokeStep('fill')
    haptics.mark()
    haptics.erase()
    haptics.firm()
    haptics.selection()
    haptics.undo()
    haptics.clear()

    expect(vibrate.mock.calls.map(([duration]) => duration)).toEqual([
      16, 12, 12, 10, 34, 7, 10, 26,
    ])
  })

  it('落幕在浏览器上是渐强图案，不是单记', () => {
    haptics.finale()
    const [pattern] = vibrate.mock.calls[0]
    expect(Array.isArray(pattern)).toBe(true)
    const [first, , second, , third] = pattern as number[]
    expect(first).toBeLessThan(second)
    expect(second).toBeLessThan(third)
  })

  /*
   * 浏览器只有 navigator.vibrate，没有音色可言，只能用时长近似两种口味——所以这里
   * 断言的是「两者不同」，不是「谁强谁弱」。真机上两者走的是完全不同的实现，把
   * 浏览器兜底的长短当成产品层级会把假设写回代码里。
   */
  it('两种口味在浏览器兜底路径上给出不同的脉冲', () => {
    const tap = (next: 'elegant' | 'vivid') => {
      vibrate.mockClear()
      setVibrationStyle(next)
      haptics.fill()
      return vibrate.mock.calls[0][0] as number
    }
    expect(tap('elegant')).not.toBe(tap('vivid'))
  })

  it('关闭触感后所有语义都安静，包括 finale', () => {
    setVibrationEnabled(false)
    haptics.fill()
    haptics.strokeStep('fill')
    haptics.firm()
    haptics.finale()
    expect(vibrate).not.toHaveBeenCalled()
  })

  it('浏览器不支持振动时静默降级', () => {
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: undefined })
    expect(() => {
      haptics.fill()
      haptics.finale()
    }).not.toThrow()
  })
})

describe('haptics（原生语义桥）', () => {
  beforeEach(() => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true)
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('ios')
    gameHaptics.prepare.mockClear().mockImplementation(() => Promise.resolve())
    gameHaptics.trigger.mockClear().mockImplementation(() => Promise.resolve())
    capacitorHaptics.impact.mockClear().mockImplementation(() => Promise.resolve())
    capacitorHaptics.notification.mockClear().mockImplementation(() => Promise.resolve())
    capacitorHaptics.selectionChanged.mockClear().mockImplementation(() => Promise.resolve())
    resetHaptics()
  })

  afterEach(() => {
    resetHaptics()
    vi.restoreAllMocks()
  })

  it.each([['elegant' as const], ['vivid' as const]])(
    '把 %s 口味与预期首格语义一起传给 iOS 原生层',
    (next) => {
      setVibrationStyle(next)
      haptics.prepare('erase')
      haptics.erase()

      expect(gameHaptics.prepare).toHaveBeenCalledWith({ effect: 'erase', style: next })
      expect(gameHaptics.trigger).toHaveBeenCalledWith({ effect: 'erase', style: next })
    },
  )

  it('完整传递十一种业务语义，后续格带上当前工具', async () => {
    haptics.fill()
    haptics.mark()
    haptics.erase()
    haptics.strokeStep('fill')
    await Promise.resolve()
    haptics.strokeStep('mark')
    await Promise.resolve()
    haptics.strokeStep('erase')
    haptics.firm()
    haptics.selection()
    haptics.undo()
    haptics.clear()
    haptics.finale()

    expect(gameHaptics.trigger.mock.calls.map(([options]) => options.effect)).toEqual([
      'fill',
      'mark',
      'erase',
      'fill-step',
      'mark-step',
      'erase-step',
      'firm',
      'selection',
      'undo',
      'clear',
      'finale',
    ])
  })

  it('同一输入任务批量补格只提交一次 step，下一真实事件立即恢复', async () => {
    vi.mocked(Capacitor.getPlatform).mockReturnValue('android')
    haptics.strokeStep('fill')
    haptics.strokeStep('fill')
    haptics.strokeStep('fill')
    expect(gameHaptics.trigger.mock.calls.map(([options]) => options.effect)).toEqual(['fill-step'])

    await Promise.resolve()

    haptics.strokeStep('fill')
    haptics.firm()

    expect(gameHaptics.trigger.mock.calls.map(([options]) => options.effect)).toEqual([
      'fill-step',
      'fill-step',
      'firm',
    ])
  })

  it('离散事件连发不会被合并守卫吞掉', () => {
    haptics.firm()
    haptics.firm()
    haptics.fill()
    haptics.fill()
    expect(gameHaptics.trigger).toHaveBeenCalledTimes(4)
  })

  it('本地插件不可用时，finale 与 selection 仍降级到系统语义 API', async () => {
    gameHaptics.trigger
      .mockRejectedValueOnce(new Error('unavailable'))
      .mockRejectedValueOnce(new Error('unavailable'))
      .mockRejectedValueOnce(new Error('unavailable'))

    haptics.finale()
    haptics.selection()
    haptics.fill()

    await vi.waitFor(() => {
      expect(capacitorHaptics.notification).toHaveBeenCalledWith({
        type: NotificationType.Success,
      })
      expect(capacitorHaptics.selectionChanged).toHaveBeenCalledOnce()
      expect(capacitorHaptics.impact).toHaveBeenCalledWith({ style: ImpactStyle.Medium })
    })
  })

  it('Android 本地语义插件缺失时保持安静，不退回固定 waveform', async () => {
    vi.mocked(Capacitor.getPlatform).mockReturnValue('android')
    gameHaptics.trigger.mockRejectedValueOnce(new Error('unavailable'))
    haptics.fill()

    await Promise.resolve()
    expect(capacitorHaptics.impact).not.toHaveBeenCalled()
    expect(capacitorHaptics.notification).not.toHaveBeenCalled()
  })

  it('关闭触感后不预热，也不触发任何原生语义', () => {
    setVibrationEnabled(false)
    haptics.prepare('fill')
    haptics.fill()
    haptics.finale()
    expect(gameHaptics.prepare).not.toHaveBeenCalled()
    expect(gameHaptics.trigger).not.toHaveBeenCalled()
  })
})
