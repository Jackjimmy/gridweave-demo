import { useSyncExternalStore } from 'react'
import { loadContentLocale } from './content'
import { loadMessages } from './messages'
import { getLocale, resolveLocale, setLocale } from './index'
import { DEFAULT_LOCALE, type Locale } from './locales'
import { loadLocalePreference, saveLocalePreference, type LocalePreference } from './preference'

/**
 * 一个语言要的两样东西：这个语言的界面文案，和它的关卡名目录。
 * 两样都到齐才算这个语言可用——只到一样就上，屏幕上会是半中半英的一屏。
 *
 * allSettled 不是 all：一样失败了，另一样该拿的照样拿回来存好，重试时
 * 只补真正缺的那一份（两个加载器各自「成功留住、失败丢掉」）。
 */
async function loadLocaleResources(locale: Locale): Promise<boolean> {
  const settled = await Promise.allSettled([loadMessages(locale), loadContentLocale(locale)])
  return settled.every((one) => one.status === 'fulfilled')
}

/**
 * 开机语言的状态。
 *
 * `locale` 是**想要的**那个语言（玩家选的，或系统语言），不一定是此刻生效的那个：
 * 资源没拉到时界面先跑在内置英文上，这里记着待会儿要回到哪儿。
 */
export interface I18nBootState {
  /** 想要的语言。degraded 时它与 getLocale() 不同 */
  locale: Locale
  /** 资源没拉齐，界面正跑在内置英文上 */
  degraded: boolean
  /** 正在重试 */
  retrying: boolean
}

let state: I18nBootState = { locale: DEFAULT_LOCALE, degraded: false, retrying: false }
const listeners = new Set<() => void>()

function update(next: Partial<I18nBootState>): void {
  state = { ...state, ...next }
  for (const listener of listeners) listener()
}

export function getI18nBootState(): I18nBootState {
  return state
}

export function subscribeI18nBootState(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** 组件里读开机语言状态；降级横幅按它出现与消失 */
export function useI18nBootState(): I18nBootState {
  return useSyncExternalStore(subscribeI18nBootState, getI18nBootState, getI18nBootState)
}

/**
 * 开机定语言。**在第一帧之前**跑完（见 main.tsx）。
 *
 * 先定语言再挂 React，是为了不出现「先英文一帧、再跳成日文」那种闪动。
 * 等的是两样：这个语言的界面文案，和它的关卡名目录（两份都只加载当前语言，
 * 见 i18n/messages 与 i18n/content）。加起来是两次动态 import、二十来 KB，
 * 与库目录同一个数量级；换来的是首页第一屏的每一个字一次就是对的，
 * 也换来 `t()` 在组件里始终是同步的。
 *
 * **这个函数不会拒绝。** 弱网、缓存与部署版本交错、CDN 掉一个块——任何一份拉不到，
 * 从前都是整棵树不挂，屏幕上一片空白，连一个可点的东西都没有。现在改成降级：
 * 落到内置的英文（它静态编在主包里，永远在手上），照常挂树，把「差一份文案」
 * 记在上面那份状态里，界面出一条可重试的提示（见 components/RetryNotice）。
 * 重试成功再整屏换回想要的语言。
 *
 * 为什么整屏一起降级、而不是「文案用日文、关卡名回落英文」：两份只到一份时
 * 屏幕上就是半中半英的一屏，而缺的那一半没有任何提示。宁可整屏英文，
 * 也不拿另一种语言的字混着冒充——与关卡副名那条规矩同一个道理（见 i18n/content）。
 *
 */
export async function initI18n(tags?: readonly string[]): Promise<Locale> {
  const locale = resolveLocale(tags)
  // 文案与关卡名一起等齐再定语言：两者都到了，第一帧才是完整的一屏
  const ready = await loadLocaleResources(locale)
  setLocale(ready ? locale : DEFAULT_LOCALE)
  update({ locale, degraded: !ready, retrying: false })
  return getLocale()
}

/**
 * 再拉一次没拉到的那份语言资源。
 *
 * 成功时 setLocale 换到想要的那个语言——那一下会通知所有 useLocale / useT
 * 的订阅者，整棵树就地换成新语言，不必重载页面。
 *
 * 这一次 setLocale 必定是一次真的变化，所以通知不会被它里面那句「语言没变
 * 就不通知」吃掉：两条进入降级的路都保证了想要的语言与此刻生效的语言不同
 * ——开机那条降到英文而想要的不是英文（英文静态编在主包里，拉不失败），
 * 覆盖那条进门就先把「覆盖等于当前」挡回去了。
 */
export async function retryI18n(): Promise<boolean> {
  if (!state.degraded || state.retrying) return false
  update({ retrying: true })
  const ready = await loadLocaleResources(state.locale)
  if (ready) setLocale(state.locale)
  update({ degraded: !ready, retrying: false })
  return ready
}

/** 设置面板里那一节读它：眼下选的是哪一档（跟随系统，或某个语言） */
export function useLocalePreference(): LocalePreference {
  return useSyncExternalStore(subscribeI18nBootState, loadLocalePreference, loadLocalePreference)
}

/**
 * 玩家在设置里换语言。
 *
 * 先把选择存下来（下次开机就按它起），再把那个语言的两份资源拉齐、整棵树就地
 * 换过去——不重载页面：设置面板开在哪一层就留在哪一层，手上那一局也还在。
 * 从前 DEV 包的调试覆盖是整页重载，那是只有调试包走的路；正式功能得让人
 * 「点一下，眼前这一屏就换了字」。
 *
 * 拉不到就走开机那套降级：想要的语言记在状态里，界面留在此刻生效的语言上
 * （不退回英文——手上这个语言是齐的，没理由拿走），底部出那条可重试的提示，
 * 重试成功再换过去。返回值说的是这一次换成了没有。
 *
 * 语言没变（比如从「跟随系统」切到系统正是的那个语言）也要通知一次：
 * 选中态由 useLocalePreference 订阅这份状态，不通知它就不刷新。
 */
export async function applyLocalePreference(preference: LocalePreference): Promise<boolean> {
  saveLocalePreference(preference)
  const locale = resolveLocale(undefined, preference)
  if (locale === getLocale()) {
    update({ locale, degraded: false, retrying: false })
    return true
  }
  update({ locale, degraded: false, retrying: true })
  const ready = await loadLocaleResources(locale)
  // 等的这段时间里又选了别的：这一次的结果作废，不去覆盖后来那一次
  if (state.locale !== locale) return false
  if (ready) setLocale(locale)
  update({ degraded: !ready, retrying: false })
  return ready
}
