import { ALBUM_META, type AlbumMeta } from '../data/albums'

/**
 * 一章在整个内容库里的完整身份。
 *
 * 章 id 只在卷内唯一、卷 id 只在册内唯一（16 本都有 prologue），所以定位一章
 * 必须三段齐全。i18n 的章名解析器要的正是这三段（见 i18n/content 的 chapterKey），
 * 从前分页结构只带得出章 id，于是画册抬头、册底行动、对局顶栏和结算卡
 * 只能显示数据里的中文原名——这个类型就是为了让那种情况写不出来。
 */
export interface ChapterRef {
  albumId: string
  sectionId: string
  chapterId: string
}

/**
 * 一章在运行时的全部内容：稳定身份 + 章内关卡 id（定稿顺序）。
 *
 * 刻意**不带**目录里那两栏中英原名。名字一律由 ref 现解析（i18n/content 的
 * chapterLabel）；这里但凡留一份现成的名字，早晚有一处会图省事直接显示它。
 */
export interface ChapterEntry {
  ref: ChapterRef
  levels: string[]
}

/** 三段键的字符串形式，只用于报错与调试；显示名一律走 i18n/content */
export function chapterRefKey(ref: ChapterRef): string {
  return `${ref.albumId}/${ref.sectionId}/${ref.chapterId}`
}

export function sameChapter(a: ChapterRef | undefined, b: ChapterRef | undefined): boolean {
  return a !== undefined && b !== undefined && chapterRefKey(a) === chapterRefKey(b)
}

/**
 * 关卡 → 所属册/卷/章 的索引。
 *
 * 正式库的规矩是一关只归一章（一关在书架上只有一个入口，见 albums.test）。
 * 这里把它变成**构建期的硬断言**：目录里同一关出现在两章里就当场抛，
 * 而不是让某一处界面安静地显示出另一章的名字。
 */
export function buildChapterIndex(metas: readonly AlbumMeta[]): Map<string, ChapterEntry> {
  const byPuzzle = new Map<string, ChapterEntry>()
  const duplicates: string[] = []
  for (const album of metas) {
    for (const section of album.sections) {
      for (const chapter of section.groups) {
        const entry: ChapterEntry = {
          ref: { albumId: album.id, sectionId: section.id, chapterId: chapter.id },
          levels: chapter.levels,
        }
        for (const id of chapter.levels) {
          const seen = byPuzzle.get(id)
          if (seen) {
            duplicates.push(`${id}: ${chapterRefKey(seen.ref)} 与 ${chapterRefKey(entry.ref)}`)
            continue
          }
          byPuzzle.set(id, entry)
        }
      }
    }
  }
  if (duplicates.length > 0) {
    throw new Error(`collections.json 里有关卡同时归属多章：\n${duplicates.join('\n')}`)
  }
  return byPuzzle
}

const CHAPTER_BY_PUZZLE = buildChapterIndex(ALBUM_META)

/**
 * 这一关归哪一章。
 *
 * 只认关卡 id，不认导航状态：从存档恢复、刷新、直接落在对局页的时候，
 * 手上有的就只有这一个 id，章名必须照样查得出来。库外关卡（每日挑战）
 * 不在任何一册里，返回 undefined。
 */
export function chapterOfPuzzle(puzzleId: string): ChapterEntry | undefined {
  return CHAPTER_BY_PUZZLE.get(puzzleId)
}

export function chapterRefOfPuzzle(puzzleId: string): ChapterRef | undefined {
  return CHAPTER_BY_PUZZLE.get(puzzleId)?.ref
}

/** 完整性校验用：索引里登记过的全部关卡 id */
export function indexedPuzzleIds(): string[] {
  return [...CHAPTER_BY_PUZZLE.keys()]
}
