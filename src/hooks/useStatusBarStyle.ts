import { useEffect, useSyncExternalStore } from 'react'
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core'
import { resolveTheme, subscribeSystemTheme } from '../utils/settings'
import { useSettings } from './settingsContext'
import type { ThemePreference } from '../utils/settings'

/**
 * 系统栏样式跟随应用主题，而不是跟随系统外观。
 *
 * 注意 @capacitor/core SystemBars 的枚举语义（见 core-plugins.d.ts 与
 * Android 端 SystemBars.java）：Dark = 深色背景上的浅色图标，
 * Light = 浅色背景上的深色图标，Default = 跟随系统外观。
 *
 * 不用 Default：主题是应用自己的设置项，玩家可以在系统是深色时把应用调成亮色。
 * 那种组合下交给 Default 就会在白底上画白图标。
 */
function appDefaultStyle(theme: 'light' | 'dark'): SystemBarsStyle {
  return theme === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light
}

/**
 * 当前真正生效的主题，且「跟随系统」时会随系统变化重新求值。
 *
 * 光调 resolveTheme 不够：那只是读一次 matchMedia。玩家在应用开着的时候
 * 从通知栏切深色，SettingsProvider 会把 <html data-theme> 改掉（那是 CSS 的事，
 * 不经过 React），但 settings 本身没变，React 不会重渲染，
 * 于是界面已经整片翻成深色、系统栏还停在浅色那套——深底上画深图标，
 * 状态栏的时间和电量就此消失。默认主题正是「跟随系统」，人人都撞得到。
 */
function useResolvedTheme(pref: ThemePreference): 'light' | 'dark' {
  const systemTheme = useSyncExternalStore(
    subscribeSystemTheme,
    () => resolveTheme('system'),
    () => 'light' as const,
  )
  return pref === 'system' ? systemTheme : pref
}

/**
 * 页面级系统栏样式：mount 时应用目标样式，unmount 时恢复 App 默认样式。
 *
 * 约束：SystemBars 没有可靠的“读取当前样式”API，无法恢复“进入前值”，
 * 因此 unmount 统一回退到当前主题对应的 App 默认样式。
 * 仅在原生平台生效；Web/测试环境下为空操作。
 */
export function useStatusBarStyle(style?: SystemBarsStyle) {
  const { settings } = useSettings()
  const fallback = appDefaultStyle(useResolvedTheme(settings.theme))
  const target = style ?? fallback
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    void SystemBars.setStyle({ style: target })
    return () => {
      void SystemBars.setStyle({ style: fallback })
    }
  }, [target, fallback])
}
