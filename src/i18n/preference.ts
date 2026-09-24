import { isLocale, type Locale } from './locales'

/**
 * 玩家选的语言。
 *
 * 存一条 localStorage，值是某个 locale 或 'system'（跟随系统，也是缺省）。
 * 设置面板里那一节「语言」写它，开机定语言时读它（见 i18n/boot 的 initI18n）。
 *
 * 不进 utils/settings 那份对象：那一份的每一项都是「改了就交给 React 树」，
 * 而语言在挂树之前就得定下来（第一帧的每一个字都要是对的），读它的又有一堆
 * 非 React 的模块。它自己一条键，与主题、音效那些互不牵连。
 *
 * 从前这条键只有 DEV 包认（叫 locale-override，调版式用的）；现在是正式功能，
 * 各渠道一视同仁。键名换过，老的调试覆盖不会被误当成玩家的选择。
 */
const KEY = 'nonogram:locale'

export type LocalePreference = Locale | 'system'

export function loadLocalePreference(): LocalePreference {
  try {
    const raw = localStorage.getItem(KEY)
    return isLocale(raw) ? raw : 'system'
  } catch {
    return 'system'
  }
}

export function saveLocalePreference(value: LocalePreference): void {
  try {
    if (value === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, value)
  } catch {
    // 隐私模式等写不进去：下次开机退回跟随系统，不影响任何一局
  }
}
