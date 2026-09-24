import { registerPlugin } from '@capacitor/core'
import type { VibrationStyle } from './settings'

/**
 * 游戏自己的原生触感桥。
 *
 * Capacitor Haptics 把同一组 Light / Medium / Heavy 同时解释成 UIKit impact
 * 和 Android 固定波形，两个平台的手感并不等价。这里传递产品语义，让原生端各自
 * 选择系统最合适的实现；iOS 注册失败时才由 haptics.ts 使用标准 Haptics 语义降级，
 * Android 则保持安静，避免重新落回固定波形。
 */

/** 棋盘上的三种工具。首格用它本名，同一笔画里的后续格用 `${kind}-step`。 */
export type CellHapticKind = 'fill' | 'mark' | 'erase'

export type NativeHapticEffect =
  | CellHapticKind
  | 'fill-step'
  | 'mark-step'
  | 'erase-step'
  | 'firm'
  | 'selection'
  | 'undo'
  | 'clear'
  | 'finale'

interface NativeGameHapticsPlugin {
  prepare(options: { effect: CellHapticKind; style: VibrationStyle }): Promise<void>
  trigger(options: { effect: NativeHapticEffect; style: VibrationStyle }): Promise<void>
}

export const NativeGameHaptics = registerPlugin<NativeGameHapticsPlugin>('GameHaptics')
