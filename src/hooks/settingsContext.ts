import { createContext, useContext } from 'react'
import { DEFAULT_SETTINGS } from '../utils/settings'
import type { Settings } from '../utils/settings'

export interface SettingsContextValue {
  settings: Settings
  /** 改一项即落盘；设置面板里每次点击都是一次完整的保存 */
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void
}

/*
 * 无 Provider 时回落到产品默认值而不是抛错。
 *
 * 组件测试大量单独渲染 Game / ActionBar 这类节点，为了一个体验偏好逼它们
 * 全部套一层 Provider，只会让「这个组件依赖什么」变得更难看清。默认值本来
 * 就是这些组件在设置模块落地之前的行为，回落到它等于回到从前。
 */
const FALLBACK: SettingsContextValue = { settings: DEFAULT_SETTINGS, set: () => {} }

export const SettingsContext = createContext<SettingsContextValue | null>(null)

export function useSettings(): SettingsContextValue {
  return useContext(SettingsContext) ?? FALLBACK
}
