/**
 * 首发支持的九个 locale。
 *
 * 这份清单是**唯一**的真源：消息包、关卡名目录、开发者语言覆盖菜单、完整性
 * 校验全都从它派生，添一个语言只要在这里加一项，缺哪一份 TypeScript 当场报错。
 *
 * 顺序即开发者菜单里的顺序：英文打头（它同时是兜底语言），其余按书写系统
 * 归堆——中日韩一摞，拉丁语系一摞。
 */
export const LOCALES = [
  'en',
  'zh-Hans',
  'zh-Hant',
  'ja',
  'ko',
  'de',
  'fr',
  'es',
  'pt-BR',
] as const

export type Locale = (typeof LOCALES)[number]

/** 中英源内置于内容 JSON，其余语言使用独立 catalog。 */
export type CatalogLocale = Exclude<Locale, 'en' | 'zh-Hans'>
export const CATALOG_LOCALES = LOCALES.filter(
  (locale): locale is CatalogLocale => locale !== 'en' && locale !== 'zh-Hans',
)

/** 编辑时的翻译基础；运行时缺包仍统一回退英文。两种源必须描述同一对象。 */
export const TRANSLATION_SOURCE: Record<Locale, 'en' | 'zh-Hans'> = {
  en: 'en',
  'zh-Hans': 'zh-Hans',
  'zh-Hant': 'zh-Hans',
  ja: 'zh-Hans',
  ko: 'zh-Hans',
  de: 'en',
  fr: 'en',
  es: 'en',
  'pt-BR': 'en',
}

/**
 * 兜底语言。
 *
 * 认不出的系统语言一律落到英文，而不是落到中文——这个包首发就是面向全球的，
 * 「认不出」最可能是某个我们还没做的语言，那时英文是全世界最容易将就的一档。
 */
export const DEFAULT_LOCALE: Locale = 'en'

const LOCALE_SET = new Set<string>(LOCALES)

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && LOCALE_SET.has(value)
}

/**
 * 每个 locale 对应的 BCP-47 标签：写进 `<html lang>`，也交给 Intl 做日期与数字。
 *
 * 与 Locale 本身分开是因为两者的职责不同：Locale 是我们自己的键（要短、要能当
 * 文件名、要稳定），标签是给浏览器与 Intl 看的。眼下两者全部一致，但这一层留着，将来加 pt-PT 之类才不必回头改所有用到标签的地方。
 */
export const LOCALE_TAG: Record<Locale, string> = {
  en: 'en',
  'zh-Hans': 'zh-Hans',
  'zh-Hant': 'zh-Hant',
  ja: 'ja',
  ko: 'ko',
  de: 'de',
  fr: 'fr',
  es: 'es',
  'pt-BR': 'pt-BR',
}

/** 开发者菜单里那一行显示的名字：一律用该语言自己的说法 */
export const LOCALE_ENDONYM: Record<Locale, string> = {
  en: 'English',
  'zh-Hans': '简体中文',
  'zh-Hant': '繁體中文',
  ja: '日本語',
  ko: '한국어',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
  'pt-BR': 'Português (BR)',
}

/**
 * 关卡名的呈现规则。
 *
 * 中日韩四个 locale 保留「英文主名称在上、本地语言小字在下」——那是这个游戏
 * 从第一版起就在做的事（通关顺手认一个英文单词），改成纯本地化等于把一项
 * 产品特性删掉。英文自身当然只有一行。
 *
 * 德法西葡不给英文副名：对这些读者来说英文既不是母语也不是「顺便学一学」的
 * 目标，多摆一行只是噪音。
 */
const HEADWORD_LOCALES = new Set<Locale>(['en', 'zh-Hans', 'zh-Hant', 'ja', 'ko'])

/** 这个 locale 的关卡名是不是以英文打头（true 时英文在上、本地名在下） */
export function usesEnglishHeadword(locale: Locale): boolean {
  return HEADWORD_LOCALES.has(locale)
}

/**
 * 一个系统语言标签 → 我们支持的 locale。认不出返回 undefined。
 *
 * 三条，从窄到宽：
 *   1. 中文按书写系统分流。`zh-TW/HK/MO` 与任何带 `Hant` 的都是繁体，其余归简体
 *      （`zh`、`zh-CN`、`zh-SG`、`zh-Hans-*`）。只看 `zh` 前缀就当简体是错的——
 *      台港澳的系统语言正是 `zh-TW` / `zh-HK`，那批人拿到简体就是拿错了。
 *   2. 葡语首发统一到 pt-BR：`pt`、`pt-PT`、`pt-AO` 一律给巴西葡语。
 *      两种葡语的差别真实存在，但首发只做一份，给一份读得懂的胜过不给。
 *   3. 其余按主语言子标签（`de-AT` → de，`en-GB` → en）。
 */
export function normalizeLocale(tag: string): Locale | undefined {
  const raw = tag.trim()
  if (raw === '') return undefined
  const lower = raw.toLowerCase()
  const parts = lower.split(/[-_]/)
  const base = parts[0]

  if (base === 'zh') {
    const rest = parts.slice(1)
    if (rest.includes('hans')) return 'zh-Hans'
    if (rest.includes('hant') || rest.includes('tw') || rest.includes('hk') || rest.includes('mo')) {
      return 'zh-Hant'
    }
    return 'zh-Hans'
  }
  if (base === 'pt') return 'pt-BR'
  if (base === 'en') return 'en'
  if (base === 'ja') return 'ja'
  if (base === 'ko') return 'ko'
  if (base === 'de') return 'de'
  if (base === 'fr') return 'fr'
  if (base === 'es') return 'es'
  return undefined
}

/**
 * 地址里带的语言（`?lang=ja`）。官网的「网页试玩」按钮会带上访客正在读的语言，
 * 从简中官网点进来的人就该看到简中，而不是跟着浏览器变成别的语言。
 * 认不出或没带时返回 undefined。
 */
function urlLocaleTag(): string | undefined {
  // 这份文件也给 Node 脚本用（没有 DOM 类型），所以经 globalThis 取 location
  const search = (globalThis as { location?: { search?: string } }).location?.search
  if (!search) return undefined
  try {
    return new URLSearchParams(search).get('lang') ?? undefined
  } catch {
    return undefined
  }
}

/**
 * 系统语言 → 生效 locale。一个都认不出时用英文。
 *
 * 按 `navigator.languages` 从前往后找第一个认得的：系统里排第二的语言也是
 * 用户自己排的，比直接掉到英文更贴近他要的。不传 `tags` 时，地址里的 `?lang=`
 * 排在系统语言前面；它只顶替「跟随系统」这一档，玩家在设置里选过的语言仍然优先
 * （见 i18n/index 的 resolveLocale）。
 */
export function detectLocale(tags?: readonly string[]): Locale {
  const fromUrl = tags ? undefined : urlLocaleTag()
  const list =
    tags ??
    [
      ...(fromUrl ? [fromUrl] : []),
      ...(typeof navigator === 'undefined'
        ? []
        : ((navigator.languages as readonly string[] | undefined) ??
          (navigator.language ? [navigator.language] : []))),
    ]
  for (const tag of list) {
    const locale = normalizeLocale(tag)
    if (locale) return locale
  }
  return DEFAULT_LOCALE
}
