import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { applyTheme, loadSettings, saveSettings } from '../utils/settings'
import { rememberNativeBackdrop } from '../utils/nativeBackdrop'
import { setVibrationEnabled, setVibrationStyle } from '../utils/haptics'
import { setSoundEnabled, setSoundLevel } from '../utils/sound'
import { SettingsContext } from './settingsContext'
import type { SettingsContextValue } from './settingsContext'

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(loadSettings)

  const set = useCallback<SettingsContextValue['set']>((key, value) => {
    setSettings((prev) => (prev[key] === value ? prev : { ...prev, [key]: value }))
  }, [])

  /*
   * 落盘挪出 state updater。saveSettings 会同步 JSON.stringify 再写 localStorage，
   * 放在更新函数里就卡在这次提交的关键路径上——连点强度档时那几帧的顿挫就是它。
   * 放到 effect 里，按钮的选中态和触感先落地，写盘排在这一帧之后。
   *
   * 首次渲染跳过：那正是 loadSettings 刚读出来的值，原样写回去只是白白多一次写。
   */
  const loadedRef = useRef(false)
  useEffect(() => {
    if (!loadedRef.current) {
      loadedRef.current = true
      return
    }
    saveSettings(settings)
  }, [settings])

  // 音效与触感是模块级单例（不在 React 树里），设置变了要推给它们
  useEffect(() => setSoundEnabled(settings.sound), [settings.sound])
  useEffect(() => setSoundLevel(settings.soundLevel), [settings.soundLevel])
  useEffect(() => setVibrationEnabled(settings.vibration), [settings.vibration])
  useEffect(() => setVibrationStyle(settings.vibrationStyle), [settings.vibrationStyle])

  /*
   * 主题写在 <html> 的 data-theme 上。选「跟随系统」时还要盯着系统那一侧变化——
   * 用户在通知栏切深色时应用要跟着变，而不是等下次冷启动。
   */
  useEffect(() => {
    applyTheme(settings.theme)
    // 原生冷启动那层底色按它垫（见 nativeBackdrop）
    rememberNativeBackdrop(settings.theme)
    if (settings.theme !== 'system') return
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const sync = () => applyTheme('system')
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [settings.theme])

  const value = useMemo(() => ({ settings, set }), [settings, set])
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}
