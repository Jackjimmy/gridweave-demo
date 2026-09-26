import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Plugin } from 'vite'

/*
 * 网页试玩版（`vite build --mode demo`）的内容裁剪。
 *
 * 试玩版不是另一份源码，是同一份源码的另一个构建目标：界面、手感、设置、教学
 * 与正式版逐行相同，只有**内容**被裁到四本册子各六关。裁剪全部发生在打包这一层，
 * 运行时代码一处都不知道自己是试玩版的内容——`collections.json`、`emblems.json`、
 * 关卡名目录、solver 轮数表、旧 ID 迁移表在这里被改写成裁过的样子，`vite/nonogram-library.ts`
 * 按同一份清单只把这二十四关打进包，其余 576 关连同它们的名字、场景与画一个字节
 * 都不进 dist。
 *
 * 清单在 `src/data/demo.json`：每本册子点名保留哪几关、封面用哪一张。册内顺序、
 * 卷与章的结构照抄正式目录——试玩的人翻开一本看到的章节，就是正式版里同一本
 * 的那几章，只是每章少几关。清单本身与正式库的一致性由 `src/data/demo.test.ts`
 * 守着（点名的关必须在正式库、在它声称的那一册里，封面必须是册内的一关）。
 */

export interface DemoAlbum {
  id: string
  emblem: string
  levels: string[]
}

export interface DemoManifest {
  albums: DemoAlbum[]
  /** 全部保留的关卡 id，按册序展开 */
  levelIds: Set<string>
}

interface CollectionChapter {
  id: string
  zh: string | null
  en: string | null
  levels: string[]
}

interface CollectionSection {
  id: string
  size: number
  zh: string
  en: string
  groups: CollectionChapter[]
}

interface CollectionAlbum {
  id: string
  zh: string
  en: string
  group: string
  levels: string[]
  sections: CollectionSection[]
}

interface CollectionsFile {
  albums: CollectionAlbum[]
}

interface LibraryNamesFile {
  groups: Record<string, string>
  albums: Record<string, string>
  sections: Record<string, string>
  chapters: Record<string, string>
}

export function readDemoManifest(root: string): DemoManifest {
  const raw = JSON.parse(readFileSync(join(root, 'src/data/demo.json'), 'utf-8')) as {
    albums: DemoAlbum[]
  }
  return {
    albums: raw.albums,
    levelIds: new Set(raw.albums.flatMap((album) => album.levels)),
  }
}

/**
 * 目录裁到清单：只留点名的册，册内只留点名的关，空掉的章与卷整段去掉。
 *
 * 册序与章序都照正式目录，不按清单里的书写顺序重排——清单只说「留哪些」，
 * 「怎么排」是目录定稿的事，两处各排一遍迟早给出两个答案。
 */
export function cropCollections(collections: CollectionsFile, manifest: DemoManifest): CollectionsFile {
  const keep = new Map(manifest.albums.map((album) => [album.id, new Set(album.levels)]))
  const albums: CollectionAlbum[] = []
  for (const album of collections.albums) {
    const levels = keep.get(album.id)
    if (!levels) continue
    const sections = album.sections
      .map((section) => ({
        ...section,
        groups: section.groups
          .map((chapter) => ({ ...chapter, levels: chapter.levels.filter((id) => levels.has(id)) }))
          .filter((chapter) => chapter.levels.length > 0),
      }))
      .filter((section) => section.groups.length > 0)
    albums.push({
      ...album,
      levels: album.levels.filter((id) => levels.has(id)),
      sections,
    })
  }
  return { albums }
}

export function cropEmblems(manifest: DemoManifest): Record<string, string> {
  return Object.fromEntries(manifest.albums.map((album) => [album.id, album.emblem]))
}

/** 按关卡 id 键的表（关卡名目录、solver 轮数表）只留清单里的关 */
export function cropByPuzzleId<T>(table: Record<string, T>, manifest: DemoManifest): Record<string, T> {
  return Object.fromEntries(Object.entries(table).filter(([id]) => manifest.levelIds.has(id)))
}

export interface LegacyIdsFile {
  ids: Record<string, string>
}

/**
 * 2026-09-26 改 ID 的存档迁移表（src/data/legacy-puzzle-ids.json）：只留**新 ID** 在清单里的那几条。
 * 键是旧 ID、值是新 ID，所以按值筛；老访客的试玩进度照样能搬，其余关卡的新旧 ID 不进 dist。
 */
export function cropLegacyIds<T extends LegacyIdsFile>(table: T, manifest: DemoManifest): T {
  return { ...table, ids: Object.fromEntries(Object.entries(table.ids).filter(([, to]) => manifest.levelIds.has(to))) }
}

/**
 * 画册名目录只留裁过的目录里还在的册、卷、章。
 *
 * 键的形状与 src/i18n/content.ts 的 sectionKey / chapterKey 一致：`册/卷`、`册/卷/章`。
 * 主题名照单全留：四本册子分属两个主题，多几条主题名不占什么，少一条却会
 * 让某个语言回落英文。
 */
export function cropLibraryNames(names: LibraryNamesFile, cropped: CollectionsFile): LibraryNamesFile {
  const albums = new Set<string>()
  const sections = new Set<string>()
  const chapters = new Set<string>()
  for (const album of cropped.albums) {
    albums.add(album.id)
    for (const section of album.sections) {
      sections.add(`${album.id}/${section.id}`)
      for (const chapter of section.groups) chapters.add(`${album.id}/${section.id}/${chapter.id}`)
    }
  }
  const pick = (table: Record<string, string>, keys: Set<string>) =>
    Object.fromEntries(Object.entries(table).filter(([key]) => keys.has(key)))
  return {
    groups: names.groups,
    albums: pick(names.albums, albums),
    sections: pick(names.sections, sections),
    chapters: pick(names.chapters, chapters),
  }
}

/**
 * 试玩版的内容改写插件。只在 `--mode demo` 下装进插件表（见 vite.config.ts）；
 * 关卡本身的裁剪在 nonogramLibrary 那一侧读同一份清单。
 *
 * enforce: 'pre' 让这一步跑在 Vite 自己的 json 插件之前，拿到的还是原文。
 */
export function demoContent(): Plugin {
  let root = process.cwd()
  let manifest: DemoManifest | null = null
  let cropped: CollectionsFile | null = null
  const read = () => (manifest ??= readDemoManifest(root))

  return {
    name: 'nonogram:demo-content',
    enforce: 'pre',
    configResolved(config) {
      root = config.root
    },
    // 清单或目录一动就忘掉读过的那份；整页重载由 nonogram-library 那边发
    handleHotUpdate({ file }) {
      if (file.endsWith('/src/data/demo.json') || file.endsWith('/src/data/collections.json')) {
        manifest = null
        cropped = null
      }
    },
    transform(code, id) {
      if (!id.endsWith('.json') || !id.includes('/src/data/')) return null
      const emit = (value: unknown) => ({ code: JSON.stringify(value), map: null })

      if (id.endsWith('/src/data/collections.json')) {
        cropped = cropCollections(JSON.parse(code) as CollectionsFile, read())
        return emit(cropped)
      }
      if (id.endsWith('/src/data/emblems.json')) return emit(cropEmblems(read()))
      if (id.endsWith('/src/data/level-tiers.json')) {
        return emit(cropByPuzzleId(JSON.parse(code) as Record<string, number>, read()))
      }
      if (id.endsWith('/src/data/legacy-puzzle-ids.json')) {
        return emit(cropLegacyIds(JSON.parse(code) as LegacyIdsFile, read()))
      }
      if (id.includes('/src/data/i18n/puzzle-names/')) {
        return emit(cropByPuzzleId(JSON.parse(code) as Record<string, string>, read()))
      }
      if (id.includes('/src/data/i18n/library/')) {
        // 目录可能还没被 import 过（语言包是按需 import() 的）：现读一份来裁
        cropped ??= cropCollections(
          JSON.parse(readFileSync(join(root, 'src/data/collections.json'), 'utf-8')) as CollectionsFile,
          read(),
        )
        return emit(cropLibraryNames(JSON.parse(code) as LibraryNamesFile, cropped))
      }
      return null
    },
  }
}
