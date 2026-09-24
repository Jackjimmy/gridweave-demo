import collections from '../data/collections.json'
import { createLazyLoads } from '../utils/lazyResource'
import type { ChapterRef } from '../utils/chapters'
import { CATALOG_LOCALES, DEFAULT_LOCALE, usesEnglishHeadword, type CatalogLocale, type Locale } from './locales'
import { getLocale } from './index'

/**
 * 内容（关卡名、画册名、卷名、章名）的本地化。
 *
 * 与界面文案分成两个模块，是因为两者的来源和生命周期完全不同：
 *
 *   界面文案手写在 i18n/messages 里，按当前语言加载，编译期保证键完整；
 *   内容名字跟着关卡库走——600 关的名字一份就是二十来 KB，九份全带上等于
 *   开机白读一百多 KB，其中八份永远用不到。所以**只加载当前语言那一份**。
 *
 * 英文与简体中文两份不必额外加载：它们本来就写在关卡 JSON 的 `name.en` /
 * `name.zh` 和 collections.json 的 `en` / `zh` 里，是这套内容的原始双语。
 *
 * 稳定 ID 一律不动：关卡 id、画册 id、卷 id、章 id 在任何语言下都是同一串，
 * 存档、解锁、每日挑战全按它们对齐，换语言碰不到任何一条数据。
 */

/** 只有这几个语言需要外挂目录；en / zh-Hans 直接读内容自带的双语 */

function needsCatalog(locale: Locale): locale is CatalogLocale {
  return (CATALOG_LOCALES as readonly string[]).includes(locale)
}

export interface LibraryNames {
  groups: Record<string, string>
  albums: Record<string, string>
  sections: Record<string, string>
  chapters: Record<string, string>
}

/*
 * 静态写死的 import()，不用 import.meta.glob 拼路径：打包器据此切出干净的
 * 七个（两类共十四个）块，且拼错一个语言名当场是类型错误，不是运行时 404。
 */
const PUZZLE_NAME_LOADERS: Record<CatalogLocale, () => Promise<{ default: Record<string, string> }>> = {
  'zh-Hant': () => import('../data/i18n/puzzle-names/zh-Hant.json'),
  ja: () => import('../data/i18n/puzzle-names/ja.json'),
  ko: () => import('../data/i18n/puzzle-names/ko.json'),
  de: () => import('../data/i18n/puzzle-names/de.json'),
  fr: () => import('../data/i18n/puzzle-names/fr.json'),
  es: () => import('../data/i18n/puzzle-names/es.json'),
  'pt-BR': () => import('../data/i18n/puzzle-names/pt-BR.json'),
}

const LIBRARY_NAME_LOADERS: Record<CatalogLocale, () => Promise<{ default: LibraryNames }>> = {
  'zh-Hant': () => import('../data/i18n/library/zh-Hant.json'),
  ja: () => import('../data/i18n/library/ja.json'),
  ko: () => import('../data/i18n/library/ko.json'),
  de: () => import('../data/i18n/library/de.json'),
  fr: () => import('../data/i18n/library/fr.json'),
  es: () => import('../data/i18n/library/es.json'),
  'pt-BR': () => import('../data/i18n/library/pt-BR.json'),
}

const puzzleNames = new Map<Locale, Record<string, string>>()
const libraryNames = new Map<Locale, LibraryNames>()
/* 与文案包同一条规矩：成功留住、失败丢掉，失败过的语言下一次调用重新拉（见 utils/lazyResource） */
const loads = createLazyLoads<Locale>()

/** 把一份目录直接塞进来。测试用，省得为一句断言去等动态 import */
export function registerContentNames(
  locale: Locale,
  names: { puzzles?: Record<string, string>; library?: LibraryNames },
): void {
  if (names.puzzles) puzzleNames.set(locale, names.puzzles)
  if (names.library) libraryNames.set(locale, names.library)
}

/**
 * 把这个语言的内容目录拉进来。en / zh-Hans 立即完成（无外挂目录）。
 * 同一个语言只拉一次，重复调用拿到的是同一个 Promise；拉不到的那一次不算数，
 * 下一次调用会重新发起（见 utils/lazyResource）。
 */
export function loadContentLocale(locale: Locale): Promise<void> {
  if (!needsCatalog(locale)) return Promise.resolve()
  return loads.load(locale, () =>
    Promise.all([PUZZLE_NAME_LOADERS[locale](), LIBRARY_NAME_LOADERS[locale]()]).then(
      ([puzzles, library]) => {
        puzzleNames.set(locale, puzzles.default)
        libraryNames.set(locale, library.default)
      },
    ),
  )
}

/** 这个语言的内容目录到手了没有；没到时各处回落英文 */
export function isContentLocaleReady(locale: Locale): boolean {
  return !needsCatalog(locale) || puzzleNames.has(locale)
}

// ── 关卡名 ──────────────────────────────────────────────────────────────

/** 关卡名最少要有的形状；正式库与每日挑战都满足 */
export interface NamedPuzzle {
  id: string
  name: { zh: string; en: string }
}

/**
 * 这一关在某个语言下的名字；没有翻译时 undefined。
 *
 * 三处来源，按优先级：
 *   1. 关卡数据自带的这个语言的名字。正式库没有这一路，**每日挑战有**——
 *      日关随线上文件下发，将来发布脚本给 `name` 多带几个语言，客户端不必改。
 *   2. 外挂目录（正式库的七个语言）。
 *   3. 内容原始双语：en → name.en，zh-Hans → name.zh。
 */
export function localizedPuzzleName(puzzle: NamedPuzzle, locale: Locale): string | undefined {
  const own = (puzzle.name as Record<string, unknown>)[locale]
  if (typeof own === 'string' && own !== '') return own
  if (locale === 'en') return puzzle.name.en
  if (locale === 'zh-Hans') return puzzle.name.zh
  return puzzleNames.get(locale)?.[puzzle.id]
}

/**
 * 单行场合的关卡名：title 属性、读屏名、任何只放得下一个名字的地方。
 * 缺翻译时回落英文——名字缺席比语言不对更糟。
 */
export function puzzleLabel(puzzle: NamedPuzzle, locale: Locale = getLocale()): string {
  return localizedPuzzleName(puzzle, locale) ?? puzzle.name.en
}

export interface PuzzleDisplayName {
  /** 主名称：大字那一行 */
  primary: string
  /** 副名称：主名称底下那行小字；没有就不摆这一行 */
  secondary?: string
}

/**
 * 揭晓与陈列处的关卡名，按语言给出「大字 + 小字」。
 *
 * 中日韩：英文在上、本地名在下。这是产品从第一版起就在做的事——通关顺手认一个
 *   英文单词，删掉它等于删掉一项特性。
 * 英文：只有英文一行（副名与主名同字，摆两遍是噪音）。
 * 德法西葡：只有本地名一行。对这批读者英文既不是母语也不是学习目标。
 *
 * 本地名缺席时（每日挑战眼下只带 zh / en）副名整行不出现，主名回落英文——
 * 宁可少一行，不拿另一种语言的字冒充。
 */
export function puzzleDisplayName(
  puzzle: NamedPuzzle,
  locale: Locale = getLocale(),
): PuzzleDisplayName {
  const localized = localizedPuzzleName(puzzle, locale)
  if (locale === DEFAULT_LOCALE) return { primary: puzzle.name.en }
  if (usesEnglishHeadword(locale)) {
    return { primary: puzzle.name.en, secondary: localized }
  }
  return { primary: localized ?? puzzle.name.en }
}

// ── 画册目录（画册 / 卷 / 章 / 主题） ───────────────────────────────────

interface RawChapter {
  id: string
  zh: string | null
  en: string | null
}
interface RawSection {
  id: string
  zh: string
  en: string
  groups: RawChapter[]
}
interface RawAlbum {
  id: string
  zh: string
  en: string
  group: string
  sections: RawSection[]
}

const RAW_ALBUMS = collections.albums as unknown as RawAlbum[]

/** 卷键：卷 id 只在册内唯一（16 本都有 prologue），所以要带上册 id */
export function sectionKey(albumId: string, sectionId: string): string {
  return `${albumId}/${sectionId}`
}

/** 章键：章 id 只在卷内唯一 */
export function chapterKey(albumId: string, sectionId: string, chapterId: string): string {
  return `${albumId}/${sectionId}/${chapterId}`
}

const baseAlbums = new Map<string, { zh: string; en: string }>()
const baseSections = new Map<string, { zh: string; en: string }>()
const baseChapters = new Map<string, { zh: string; en: string }>()
/** 主题名本身就是键（collections.json 里 group 存的就是那串中文），这里只记英文副名 */
const baseGroups = new Map<string, string>()

for (const album of RAW_ALBUMS) {
  baseAlbums.set(album.id, { zh: album.zh, en: album.en })
  for (const section of album.sections) {
    baseSections.set(sectionKey(album.id, section.id), { zh: section.zh, en: section.en })
    for (const chapter of section.groups) {
      if (chapter.zh === null || chapter.en === null) continue
      baseChapters.set(chapterKey(album.id, section.id, chapter.id), {
        zh: chapter.zh,
        en: chapter.en,
      })
    }
  }
}

/**
 * 四个主题的英文名。
 *
 * 它原本写在 data/albums.ts 的 ALBUM_GROUPS 里（中文名 + 英文副名 + 免费/完整）。
 * 现在英文名归这里，那张表只留「中文名是键、这一摞要不要钱」。
 */
const GROUP_EN: Record<string, string> = {
  精选合集: 'Featured Picks',
  日常生活: 'Everyday Life',
  自然世界: 'Nature & Wildlife',
  探索发现: 'Explore & Discover',
}
for (const [zh, en] of Object.entries(GROUP_EN)) baseGroups.set(zh, en)

function pickName(
  base: { zh: string; en: string } | undefined,
  fromCatalog: string | undefined,
  locale: Locale,
  fallback: string,
): string {
  if (!base) return fromCatalog ?? fallback
  if (locale === 'en') return base.en
  if (locale === 'zh-Hans') return base.zh
  return fromCatalog ?? base.en
}

/** 一本画册的名字。画册名**只出现当前语言**，不带英文副名（副名规则只管关卡名） */
export function albumTitle(albumId: string, locale: Locale = getLocale()): string {
  return pickName(baseAlbums.get(albumId), libraryNames.get(locale)?.albums[albumId], locale, albumId)
}

/** 一卷（5×5 序章 / 10×10 正篇 / 15×15 终章）的名字 */
export function sectionTitle(
  albumId: string,
  sectionId: string,
  locale: Locale = getLocale(),
): string {
  const key = sectionKey(albumId, sectionId)
  return pickName(baseSections.get(key), libraryNames.get(locale)?.sections[key], locale, sectionId)
}

/** 一章的名字。一卷只有一章时数据里是 null，那种章没有名字，这里返回 undefined */
export function chapterTitle(
  albumId: string,
  sectionId: string,
  chapterId: string,
  locale: Locale = getLocale(),
): string | undefined {
  const key = chapterKey(albumId, sectionId, chapterId)
  const base = baseChapters.get(key)
  if (!base) return undefined
  return pickName(base, libraryNames.get(locale)?.chapters[key], locale, chapterId)
}

/**
 * 一章在界面上的名字，按「册 / 卷 / 章」三段稳定键解析。
 *
 * 单章卷在数据里没有独立章名（zh/en 都是 null），那种章沿用卷名——界面上
 * 那一组仍要有可见标题。任何语言下都不会漏回中文：pickName 缺译名时给的是
 * 这一段的英文原名。
 */
export function chapterLabel(ref: ChapterRef, locale: Locale = getLocale()): string {
  return (
    chapterTitle(ref.albumId, ref.sectionId, ref.chapterId, locale) ??
    sectionTitle(ref.albumId, ref.sectionId, locale)
  )
}

/** 一个主题的名字。group 那串中文同时是稳定键（CSS、分组都按它对齐），不要拿它显示 */
export function groupTitle(group: string, locale: Locale = getLocale()): string {
  const en = baseGroups.get(group)
  if (locale === 'zh-Hans') return group
  const localized = libraryNames.get(locale)?.groups[group]
  if (locale === 'en') return en ?? group
  return localized ?? en ?? group
}

/** 完整性校验与开发者工具用：这一册 / 卷 / 章 / 主题的全部稳定键 */
export const CONTENT_KEYS = {
  groups: [...baseGroups.keys()],
  albums: [...baseAlbums.keys()],
  sections: [...baseSections.keys()],
  chapters: [...baseChapters.keys()],
}
