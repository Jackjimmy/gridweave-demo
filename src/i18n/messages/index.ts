import { createLazyLoads } from '../../utils/lazyResource'
import en from './en'
import type { Locale } from '../locales'
import type { Messages } from './en'

/**
 * 消息包只加载**当前那一个**。
 *
 * 一开始九份全随主包走，理由是「一份压完才两三 KB」。量过之后这个理由不成立：
 * 九份加起来给主包多添了 23KB（gzip），而其中八份在任何一次会话里都不会被读到。
 * 这个项目为了同一件事专门写过一个分包插件（关卡库那 726KB，见
 * vite/nonogram-library.ts）——那儿舍得拆，这儿没有理由不拆。
 *
 * 英文那一份是例外，静态留在主包里：它既是兜底（任何一条键取不到时回落英文），
 * 也是类型的来源。多带一份的代价是确定的两三 KB，换来的是「文案永远有东西可显示」。
 *
 * 加载排在挂树之前（见 i18n/boot.ts），所以 `t()` 仍然是同步的：
 * 组件里不必处理「文案还没到」的那一帧。
 */
const loaded = new Map<Locale, Messages>([['en', en]])

type LazyLocale = Exclude<Locale, 'en'>

/*
 * 静态写死的 import()，不用 import.meta.glob 拼路径：打包器据此切出干净的八个块，
 * 且拼错一个语言名当场是类型错误，不是运行时 404。
 */
const LOADERS: Record<LazyLocale, () => Promise<{ default: Messages }>> = {
  'zh-Hans': () => import('./zh-Hans'),
  'zh-Hant': () => import('./zh-Hant'),
  ja: () => import('./ja'),
  ko: () => import('./ko'),
  de: () => import('./de'),
  fr: () => import('./fr'),
  es: () => import('./es'),
  'pt-BR': () => import('./pt-BR'),
}

/* 成功留住、失败丢掉：一次弱网失败不能把这个语言钉死一整次会话（见 utils/lazyResource） */
const loads = createLazyLoads<Locale>()

/** 这个语言的文案；还没到手时给英文（开机会先 await，正常路径下够不着） */
export function messagesFor(locale: Locale): Messages {
  return loaded.get(locale) ?? en
}

export function isMessagesLoaded(locale: Locale): boolean {
  return loaded.has(locale)
}

/** 把一份消息包直接塞进来。测试用，省得为一句断言去等动态 import */
export function registerMessages(locale: Locale, messages: Messages): void {
  loaded.set(locale, messages)
}

/**
 * 把这个语言的文案拉进来。已在手上的立即完成，同一个语言只拉一次。
 *
 * 拉不到时这里如实拒绝，不在这一层吞掉：谁在等这份文案，谁才知道该降级到英文
 * 还是该请人重试一次（见 i18n/boot）。
 */
export function loadMessages(locale: Locale): Promise<void> {
  if (loaded.has(locale)) return Promise.resolve()
  return loads.load(locale, () =>
    LOADERS[locale as LazyLocale]().then((mod) => {
      loaded.set(locale, mod.default)
    }),
  )
}

export type { Messages, MessageKey, TextKey, ListKey } from './en'
