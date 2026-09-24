import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { NativeGameHaptics } from './nativeGameHaptics'
import type { CellHapticKind, NativeHapticEffect } from './nativeGameHaptics'
import { DEFAULT_SETTINGS } from './settings'
import type { VibrationStyle } from './settings'

/**
 * Nonogram 的触感语言。
 *
 * 业务层只描述被接受的动作：首格 fill / mark / erase，同一笔画里的后续格
 * strokeStep（带上工具），行列扣合 firm，显式控件 undo / clear / selection，
 * 以及通关落幕 finale。iOS 与 Android 各自把这些语义翻成系统反馈；这里不排队，
 * 也不等待 bridge promise，确保视觉状态和触感请求发生在同一个输入事件里。
 *
 * 分层原则：
 *   一次动作一次触感，绝不叠加——填色恰好补完整行时只响「扣合」，不再响「落子」。
 *   两种口味（优雅 / 鲜明）不是音量的两档，是两副面孔：安卓上一个走
 *   VibrationEffect 预定义、一个走 performHapticFeedback，实测是两个不同波形。
 *   「扣合」和「落子」靠记数拉开（一记 / 两记 / 四记），不靠调大音量——
 *   两种口味共用同一个扣合与落幕。
 *   通关落幕用渐强收束，与画面同时落地。
 */

/** 浏览器不是正式触感平台，只用短脉冲做开发环境兜底。 */
const WEB_PULSE: Record<Exclude<NativeHapticEffect, 'finale'>, number> = {
  fill: 16,
  'fill-step': 12,
  mark: 12,
  'mark-step': 8,
  erase: 10,
  'erase-step': 7,
  firm: 34,
  selection: 7,
  undo: 10,
  clear: 26,
}

/** 落幕在浏览器上只能用时长图案近似渐强，间隔不缩放。 */
const WEB_FINALE = [16, 70, 26, 80, 44]

/*
 * 浏览器只有 navigator.vibrate，没有音色可言，只能拿时长近似两种口味。
 * 这是开发环境兜底，不是产品手感——真机上两者走的是完全不同的实现。
 */
const WEB_SCALE: Record<VibrationStyle, number> = { elegant: 0.72, vivid: 1 }

/** iOS/Web 保留既有的极短 step 合并窗口；本任务不改变 iOS 的节奏。 */
const STEP_COALESCE_MS = 14

let style: VibrationStyle = DEFAULT_SETTINGS.vibrationStyle
let enabled = DEFAULT_SETTINGS.vibration
let lastStepEffect: NativeHapticEffect | null = null
let lastStepAt = Number.NEGATIVE_INFINITY
/**
 * Android 的一个 pointermove 任务可能同步补出多格。第一格立即提交，当前任务内其余
 * step 合并；microtask checkpoint 后立刻恢复，下一次真实 pointermove 不会被时间窗吞掉。
 */
let androidStepPendingInCurrentTask = false

/** 由设置写入；未设置时保持产品默认口味。 */
export function setVibrationStyle(next: VibrationStyle): void {
  style = next
}

/** 总开关关闭后，所有语义（包括 finale）都保持安静。 */
export function setVibrationEnabled(next: boolean): void {
  enabled = next
  // 开关翻转时清掉合并守卫，别让刚打开的第一记被当前任务里较早的 step 吞掉。
  lastStepEffect = null
  lastStepAt = Number.NEGATIVE_INFINITY
  androidStepPendingInCurrentTask = false
}

function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

function isIOS(): boolean {
  try {
    return Capacitor.getPlatform() === 'ios'
  } catch {
    return false
  }
}

function isAndroid(): boolean {
  try {
    return Capacitor.getPlatform() === 'android'
  } catch {
    return false
  }
}

function fallbackImpact(effect: NativeHapticEffect): ImpactStyle {
  if (effect === 'firm' || effect === 'clear') return ImpactStyle.Heavy
  if (style === 'elegant') return ImpactStyle.Light
  if (effect === 'fill' || effect === 'fill-step') return ImpactStyle.Medium
  return ImpactStyle.Light
}

/** 原生插件注册失败时仍使用 Capacitor 的原生语义 API，不生成自定义 waveform。 */
function fallbackNative(effect: NativeHapticEffect): void {
  try {
    if (effect === 'finale') {
      void Haptics.notification({ type: NotificationType.Success }).catch(() => {})
      return
    }
    if (effect === 'selection') {
      void Haptics.selectionChanged().catch(() => {})
      return
    }
    void Haptics.impact({ style: fallbackImpact(effect) }).catch(() => {})
  } catch {
    // 两层插件都不可用时静默降级，输入不能因此失败。
  }
}

function native(effect: NativeHapticEffect): void {
  try {
    void NativeGameHaptics.trigger({ effect, style }).catch(() => {
      // Capacitor Haptics 在 Android 上会退回固定 waveform；Android 插件缺失时宁可静默。
      if (isIOS()) fallbackNative(effect)
    })
  } catch {
    if (isIOS()) fallbackNative(effect)
  }
}

function web(effect: NativeHapticEffect): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
  const scale = WEB_SCALE[style]
  if (effect === 'finale') {
    navigator.vibrate(
      WEB_FINALE.map((value, index) =>
        index % 2 === 0 ? Math.max(3, Math.round(value * scale)) : value,
      ),
    )
    return
  }
  navigator.vibrate(Math.max(3, Math.round(WEB_PULSE[effect] * scale)))
}

function perform(effect: NativeHapticEffect): void {
  if (!enabled) return
  if (isNative()) native(effect)
  else web(effect)
}

export const haptics = {
  /** stroke 落笔前只预热首格真正要用的 generator；Android/Web 是 no-op。 */
  prepare(effect: CellHapticKind = 'fill'): void {
    if (!enabled || !isNative()) return
    try {
      void NativeGameHaptics.prepare({ effect, style }).catch(() => {})
    } catch {
      // 本地插件缺失不影响输入。
    }
  },

  selection(): void {
    perform('selection')
  },

  fill(): void {
    perform('fill')
  },

  mark(): void {
    perform('mark')
  },

  erase(): void {
    perform('erase')
  },

  /** 一笔画里第一格之后的真实新格；同一 pointermove 补出的多格只过桥一次。 */
  strokeStep(kind: CellHapticKind = 'fill'): void {
    if (!enabled) return
    const effect = `${kind}-step` as NativeHapticEffect
    if (isAndroid()) {
      if (androidStepPendingInCurrentTask) return
      androidStepPendingInCurrentTask = true
      queueMicrotask(() => {
        androidStepPendingInCurrentTask = false
      })
      perform(effect)
      return
    }
    const now = Date.now()
    if (effect === lastStepEffect && now - lastStepAt < STEP_COALESCE_MS) return
    lastStepEffect = effect
    lastStepAt = now
    perform(effect)
  },

  firm(): void {
    perform('firm')
  },

  undo(): void {
    perform('undo')
  },

  clear(): void {
    perform('clear')
  },

  /** 通关落幕的渐强收束；三拍的排程在原生端，这里只过一次桥。 */
  finale(): void {
    perform('finale')
  },

  /** 教学翻页是离散选项切换，与普通控件共用 selection。 */
  step(): void {
    this.selection()
  },
}
