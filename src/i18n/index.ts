import { useSyncExternalStore } from 'react'
import {
  DEFAULT_LOCALE,
  LOCALE_TAG,
  detectLocale,
  isLocale,
  type Locale,
} from './locales'
import { messagesFor } from './messages'
import type { ListKey, TextKey } from './messages'
import { loadLocalePreference, type LocalePreference } from './preference'

export * from './locales'
export type { ListKey, MessageKey, Messages, TextKey } from './messages'

/*
 * 当前语言是一份**模块级**的值，不是 Context。
 *
 * 两个理由。一是它一次会话里几乎不变（开机定一次，开发者覆盖切换时整页重载），
 * 为一个不变的值在树顶挂一个 Provider，只会让每个组件测试都得先套一层壳；
 * 音效与触感也是模块级单例，同一个道理（见 utils/sound、utils/haptics）。
 * 二是 hint.ts、daily.ts、auth/api.ts 这些非 React 的模块同样要出文案，
 * Context 递不到它们那儿。
 *
 * 需要「换了就重画」的地方走 useLocale / useT，它们订阅下面这个订阅表。
 */
let current: Locale = DEFAULT_LOCALE
const listeners = new Set<() => void>()

export function getLocale(): Locale {
  return current
}

/**
 * `<html lang>` 写成当前语言的 BCP-47 标签。
 *
 * 不只是给读屏看的。断词与连字符（德语长词）、CJK 的字形选择（同一个码位在
 * 中日文里字形不同）、以及样式表里几处按语言分流的规矩（见 Game.module.css
 * 里全角叹号那一条）全读它。
 */
function applyDocumentLang(locale: Locale): void {
  if (typeof document !== 'undefined') document.documentElement.lang = LOCALE_TAG[locale]
}

/** 换语言。语言没变也要写一次 lang——开机命中默认语言时这是唯一的写入时机 */
export function setLocale(locale: Locale): void {
  applyDocumentLang(locale)
  if (current === locale) return
  current = locale
  for (const listener of listeners) listener()
}

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** 组件里读当前语言；换语言时重渲染 */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribeLocale, getLocale, getLocale)
}

/** 当前 locale 的 Intl / lang 标签 */
export function localeTag(locale: Locale = current): string {
  return LOCALE_TAG[locale]
}

export type TParams = Record<string, string | number>

const PLACEHOLDER = /\{(\w+)\}/g

function interpolate(template: string, params?: TParams): string {
  if (!params) return template
  return template.replace(PLACEHOLDER, (whole, name: string) => {
    const value = params[name]
    return value === undefined ? whole : String(value)
  })
}

/**
 * 一条界面文案。
 *
 * 键的完整性由 TypeScript 保证（八份翻译包都声明成 `Messages`，少一条就编译不过），
 * 所以这里的英文兜底**理论上够不着**。留着它是为了别让一次数据层面的意外
 * （将来若改成运行时下发文案）把整屏炸成白板：宁可英文，不要崩。
 */
export function translate(locale: Locale, key: TextKey, params?: TParams): string {
  const value = (messagesFor(locale)[key] ?? messagesFor(DEFAULT_LOCALE)[key]) as string
  return interpolate(value, params)
}

export function translateList(locale: Locale, key: ListKey): readonly string[] {
  return (messagesFor(locale)[key] ?? messagesFor(DEFAULT_LOCALE)[key]) as readonly string[]
}

/** 当前语言的一条文案。非 React 的模块直接用它 */
export function t(key: TextKey, params?: TParams): string {
  return translate(current, key, params)
}

/** 当前语言的一组文案（星期名、教学分行文案） */
export function tList(key: ListKey): readonly string[] {
  return translateList(current, key)
}

export interface Translator {
  (key: TextKey, params?: TParams): string
  list: (key: ListKey) => readonly string[]
  locale: Locale
}

function makeTranslator(locale: Locale): Translator {
  const fn = ((key: TextKey, params?: TParams) => translate(locale, key, params)) as Translator
  fn.list = (key: ListKey) => translateList(locale, key)
  fn.locale = locale
  return fn
}

const translators = new Map<Locale, Translator>()

/**
 * 组件里的翻译函数。身份跟着语言走：同一个语言下始终是同一个函数，
 * 挂在 useMemo / useCallback 的依赖里不会每渲染一次就失效一次。
 */
export function useT(): Translator {
  const locale = useLocale()
  let translator = translators.get(locale)
  if (!translator) {
    translator = makeTranslator(locale)
    translators.set(locale, translator)
  }
  return translator
}

/**
 * 这台机器该用哪个语言。
 *
 * 玩家在设置里选过就用他选的；没选（或选的是跟随系统）就按系统语言认。
 * `preference` 不给时读存下来的那一条（见 i18n/preference）。
 */
export function resolveLocale(tags?: readonly string[], preference?: LocalePreference): Locale {
  const wanted = preference ?? loadLocalePreference()
  if (isLocale(wanted)) return wanted
  return detectLocale(tags)
}
