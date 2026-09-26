import { ALBUM_EMBLEM_ID, ALBUM_GROUP_META, ALBUM_META } from '../data/albums'
import type { Puzzle, PuzzleProgress } from '../types'
import { chapterOfPuzzle, type ChapterRef } from './chapters'
import { isInProgress, type LevelPage, splitIntoPages } from './levelSections'
import { isUnlocked } from './unlocked'

/** 一本画册：书架上的一格，也是翻开后的一本书 */
export interface Album {
  id: string
  zh: string
  en: string
  group: string
  /** 封面画 */
  emblem: Puzzle
  /** 册内全部关卡，由易到难 */
  puzzles: Puzzle[]
  /** 翻页用：一页一屏，页内 4×4 */
  pages: LevelPage[]
  /** 定稿中的卷—章结构；对局与结算也从这里取章名，不另建一份映射。 */
  sections: (typeof ALBUM_META)[number]['sections']
}

/** 一个主题：同 group 的四本画册排在一起，主题顺序即 collections.json 的册序 */
export interface AlbumShelf {
  group: string
  /** 英文副名 */
  en: string
  /** 定位：精选合集白送，其余三题属于完整版 */
  tier: 'free' | 'full'
  albums: Album[]
}

/** 主题的英文副名；没登记的主题不显示英文，界面上少一行而已，不该崩 */
export function albumGroupEn(group: string): string {
  return ALBUM_GROUP_META[group]?.en ?? ''
}

/**
 * 把关卡库摊到画册目录上。
 *
 * 目录里点名而库里没有的关直接跳过（改库不改目录时不至于白屏）；反过来，
 * 库里有而目录没收的关会被 albums.test.ts 拦下——那说明分类漏了一关，
 * 它在书架上就没有任何入口。
 */
export function buildAlbums(puzzles: Puzzle[]): Album[] {
  const byId = new Map(puzzles.map((puzzle) => [puzzle.id, puzzle]))
  const albums: Album[] = []
  for (const meta of ALBUM_META) {
    const levels = meta.levels.map((id) => byId.get(id)).filter((p): p is Puzzle => p !== undefined)
    if (levels.length === 0) continue
    albums.push({
      id: meta.id,
      zh: meta.zh,
      en: meta.en,
      group: meta.group,
      emblem: byId.get(ALBUM_EMBLEM_ID[meta.id] ?? '') ?? levels[0],
      puzzles: levels,
      pages: splitIntoPages(meta.id, levels, meta.sections),
      sections: meta.sections,
    })
  }
  return albums
}

/**
 * 按分区把画册收成书架的一层层，供首页分段。
 *
 * 主题这一级只有名字、英文副名与定位，没有自己的画：卡片上摆的是下面四本册子
 * 各自的封面。没登记过的主题也照样成层——少一行英文而已，不该让首页缺一块。
 */
export function shelvesOf(albums: Album[]): AlbumShelf[] {
  const shelves: AlbumShelf[] = []
  for (const album of albums) {
    const last = shelves.at(-1)
    if (last?.group === album.group) last.albums.push(album)
    else {
      const meta = ALBUM_GROUP_META[album.group]
      shelves.push({
        group: album.group,
        en: meta?.en ?? '',
        tier: meta?.tier ?? 'full',
        albums: [album],
      })
    }
  }
  return shelves
}

/** 画册展开成一条线的关卡顺序：书架从上到下、册内从易到难 */
export function albumOrder(albums: Album[]): Puzzle[] {
  return albums.flatMap((album) => album.puzzles)
}

export function albumOfPuzzle(albums: Album[], puzzleId: string): Album | undefined {
  return albums.find((album) => album.puzzles.some((p) => p.id === puzzleId))
}

export interface AlbumChapterContext {
  /** 「册 / 卷 / 章」三段稳定身份；章名一律由它解析，这里不留现成的名字 */
  ref: ChapterRef
  puzzles: Puzzle[]
}

/**
 * 从一关反查所属卷与章。
 *
 * 身份走全库那份索引（utils/chapters），不在这里再扫一遍目录：索引在构建时
 * 校验过「一关只归一章」，两处各扫一遍迟早给出两个答案。这里只补一件索引给不了
 * 的事——把章内关卡 id 换成这本画册已经加载好的 Puzzle 对象（结算回顾要画它们）。
 */
export function albumChapterOfPuzzle(
  album: Album,
  puzzleId: string,
): AlbumChapterContext | undefined {
  const entry = chapterOfPuzzle(puzzleId)
  if (!entry || entry.ref.albumId !== album.id) return undefined
  const byId = new Map(album.puzzles.map((puzzle) => [puzzle.id, puzzle]))
  return {
    ref: entry.ref,
    puzzles: entry.levels
      .map((id) => byId.get(id))
      .filter((puzzle): puzzle is Puzzle => puzzle !== undefined),
  }
}

/**
 * 翻开一本画册时，「开始 / 继续」那一下落在哪一关。
 *
 * 三条，从上往下第一条命中就算：
 *
 *   1. 这一本里**打到一半**的那一关（有多局取编号最小的）。手上有半局还被送去
 *      开新的一局，那不叫替人做选择，那叫把他刚才干的事扔了。
 *   2. prefer 点名的那一关（没通关时才算数）。这是给新手教学开的唯一口子：
 *      教学绑死在 festive-tales-01-heart 那张盘上（讲的是那张盘的解法），而它是首册
 *      第 3 关——没看过教学的人从第 1 关开局就再也遇不上它。
 *   3. 编号最小的那一关未通关的。册内顺序就是编号顺序（由易到难）。
 *
 * 全本通关时返回 undefined：那时它无关可开，重玩得自己在上面挑一张。
 */
export function albumStartTarget(
  album: Album,
  progressMap: Record<string, PuzzleProgress>,
  prefer?: string,
): Puzzle | undefined {
  const undone = album.puzzles.filter((puzzle) => !progressMap[puzzle.id]?.completed)
  if (undone.length === 0) return undefined
  const live = undone.find((puzzle) => isInProgress(progressMap[puzzle.id]))
  const preferred = prefer ? undone.find((puzzle) => puzzle.id === prefer) : undefined
  return live ?? preferred ?? undone[0]
}

/**
 * 「下一关」跟着这一册向后走，跳过曾经通关的关卡，不回绕、不跨册。
 *
 * 跨册的下一关是另一个主题：刚画完一朵花，紧接着弹出一台挖掘机，
 * 连着打下去的那点惯性就断在这儿了。册末退回主题画册页，本身也是一个收束。
 *
 * 这里用 isUnlocked 而不是只看 completed：曾通关的关卡在重玩到一半时
 * completed 会暂时变回 false，但 everCompleted 仍为 true，它不该再被当成新关。
 */
export function nextInAlbum(
  albums: Album[],
  puzzleId: string,
  progressMap: Record<string, PuzzleProgress>,
): string | undefined {
  const album = albumOfPuzzle(albums, puzzleId)
  if (!album) return undefined
  const index = album.puzzles.findIndex((p) => p.id === puzzleId)
  if (index < 0) return undefined
  return album.puzzles
    .slice(index + 1)
    .find((puzzle) => !isUnlocked(progressMap[puzzle.id]))?.id
}

/** 一册的解锁进度 */
export function albumProgress(
  album: Album,
  progressMap: Record<string, PuzzleProgress>,
): { done: number; total: number } {
  return {
    done: album.puzzles.filter((p) => progressMap[p.id]?.completed).length,
    total: album.puzzles.length,
  }
}

/** The first unlock that fills an album, regardless of play order or replay state. */
export function completesAlbumOnFirstClear(
  album: Album,
  puzzleId: string,
  progressMap: Record<string, PuzzleProgress>,
): boolean {
  return album.puzzles.some((puzzle) => puzzle.id === puzzleId) &&
    !isUnlocked(progressMap[puzzleId]) &&
    album.puzzles.every((puzzle) => puzzle.id === puzzleId || isUnlocked(progressMap[puzzle.id]))
}
