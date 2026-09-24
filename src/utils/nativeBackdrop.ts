import { Capacitor, registerPlugin } from '@capacitor/core'
import type { ThemePreference } from './settings'

/**
 * 把主题偏好报给原生记着，下次冷启动网页画出第一帧之前那层底色照它垫。
 *
 * 冷启动有一段「启动图已淡出、网页还没画出来」的窗口，露出来的是 WKWebView 自己的
 * 底色；原生默认按系统外观取（浅色系统就是纯白），可主题是应用自己的设置项，
 * 系统浅色、应用深色的人每次冷启动都先吃一屏白。报的是偏好而不是解析后的颜色：
 * 「跟随系统」下应用关着时系统可能切了深浅，原生在冷启动那一刻按当时的外观现解析
 * 才对。实现见 ios/App/App/ThemeBackdropPlugin.swift。
 */
interface NativeBackdropPlugin {
  remember(options: { theme: ThemePreference }): Promise<void>
}

const NativeBackdrop = registerPlugin<NativeBackdropPlugin>('NonogramBackdrop')

export function rememberNativeBackdrop(theme: ThemePreference): void {
  // 只有 iOS 装了这条桥；网页端与安卓上 isPluginAvailable 为假，什么都不发
  if (!Capacitor.isPluginAvailable('NonogramBackdrop')) return
  // 记不上也只是下次冷启动那一下的底色，不影响任何功能
  void NativeBackdrop.remember({ theme }).catch(() => undefined)
}
