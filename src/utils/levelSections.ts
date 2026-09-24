import type { AlbumSection } from '../data/albums'
import type { Puzzle, PuzzleProgress } from '../types'
import type { ChapterRef } from './chapters'
import { isUnlocked } from './unlocked'

/** 四列卡片的一行，加上约半行高的章标题，组成页内的视觉容量。 */
const PAGE_COLUMNS = 4
const CHAPTER_HEADING_UNITS = 0.65
const TARGET_PAGE_UNITS = 5
/** 总览模式沿用改版前的容量：四列 × 四行，并把余数均匀摊到各页。 */
const TARGET_OVERVIEW_PAGE_SIZE = 16

export interface LevelChapter {
  /** 页内的 key 与 DOM 标记：`卷 id:章 id`，册内唯一 */
  id: string
  /**
   * 「册 / 卷 / 章」三段稳定身份。名字一律由它现解析（i18n/content 的
   * chapterLabel），这里不留任何一份中英原名——留了就会被某处直接显示出去。
   */
  ref: ChapterRef
  firstNumber: number
  lastNumber: number
  puzzles: Puzzle[]
}

export interface LevelPage {
  /** 0 基页序 */
  index: number
  /** 册内 1 基关号区间，闭区间 */
  firstNumber: number
  lastNumber: number
  puzzles: Puzzle[]
  /** 章是页内不可拆分的内容组，并保持定稿中的先后顺序。 */
  chapters: LevelChapter[]
}

/**
 * 把关卡数均分成若干页：先按目标容量定页数，再把余数摊到前几页，
 * 避免最后只剩一两关。总览模式用它还原原先不分章节的紧凑分页。
 */
function overviewPageSizes(total: number): number[] {
  if (total <= 0) return []
  const count = Math.max(1, Math.ceil(total / TARGET_OVERVIEW_PAGE_SIZE))
  const base = Math.floor(total / count)
  const remainder = total % count
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0))
}

function chapterUnits(chapter: LevelChapter): number {
  return Math.ceil(chapter.puzzles.length / PAGE_COLUMNS) + CHAPTER_HEADING_UNITS
}

/**
 * 把整册的章平衡到若干页里。
 *
 * 章不拆、顺序不改；页数按“卡片行 + 章标题”估算，而不是只数关卡。动态规划在
 * 所有连续切法中选择最匀的一种，避免贪心算法把两关的小章单独遗落在末页。
 */
function paginateChapters(chapters: LevelChapter[]): LevelChapter[][] {
  if (chapters.length === 0) return []
  const units = chapters.map(chapterUnits)
  const total = units.reduce((sum, value) => sum + value, 0)
  const pageCount = Math.min(chapters.length, Math.max(1, Math.ceil(total / TARGET_PAGE_UNITS)))
  const ideal = total / pageCount
  const prefix = [0]
  for (const value of units) prefix.push(prefix.at(-1)! + value)

  const scores = Array.from({ length: pageCount + 1 }, () =>
    Array(chapters.length + 1).fill(Number.POSITIVE_INFINITY),
  )
  const cuts = Array.from({ length: pageCount + 1 }, () => Array(chapters.length + 1).fill(-1))
  scores[0][0] = 0

  for (let pages = 1; pages <= pageCount; pages += 1) {
    for (let end = pages; end <= chapters.length; end += 1) {
      for (let start = pages - 1; start < end; start += 1) {
        const used = prefix[end] - prefix[start]
        const overflow = Math.max(0, used - TARGET_PAGE_UNITS)
        const score = scores[pages - 1][start] + (used - ideal) ** 2 + overflow ** 2 * 8
        if (score < scores[pages][end]) {
          scores[pages][end] = score
          cuts[pages][end] = start
        }
      }
    }
  }

  const result: LevelChapter[][] = []
  let end = chapters.length
  for (let pages = pageCount; pages > 0; pages -= 1) {
    const start = cuts[pages][end]
    result.unshift(chapters.slice(start, end))
    end = start
  }
  return result
}

/**
 * 按定稿章序分页：章必完整，但尺寸卷不再形成分页边界。这样 5×5、10×10、
 * 15×15 可以同页，卷首或卷尾的一两关不会被留成孤页。
 */
export function splitIntoPages(
  albumId: string,
  puzzles: Puzzle[],
  sections: AlbumSection[],
): LevelPage[] {
  const byId = new Map(puzzles.map((puzzle) => [puzzle.id, puzzle]))
  const numberById = new Map(puzzles.map((puzzle, index) => [puzzle.id, index + 1]))
  const chapters: LevelChapter[] = sections.flatMap((section) =>
    section.groups.flatMap((group) => {
      const groupPuzzles = group.levels
        .map((id) => byId.get(id))
        .filter((puzzle): puzzle is Puzzle => puzzle !== undefined)
      if (groupPuzzles.length === 0) return []
      return [
        {
          id: `${section.id}:${group.id}`,
          ref: { albumId, sectionId: section.id, chapterId: group.id },
          firstNumber: numberById.get(groupPuzzles[0].id)!,
          lastNumber: numberById.get(groupPuzzles.at(-1)!.id)!,
          puzzles: groupPuzzles,
        },
      ]
    }),
  )

  return paginateChapters(chapters).map((pageChapters, index) => ({
    index,
    firstNumber: pageChapters[0].firstNumber,
    lastNumber: pageChapters.at(-1)!.lastNumber,
    puzzles: pageChapters.flatMap((chapter) => chapter.puzzles),
    chapters: pageChapters,
  }))
}

/** 改版前的画册分页：不显示章标题，整册按关卡顺序连续平铺。 */
export function splitOverviewPages(puzzles: Puzzle[]): LevelPage[] {
  const pages: LevelPage[] = []
  let cursor = 0
  for (const [index, size] of overviewPageSizes(puzzles.length).entries()) {
    const pagePuzzles = puzzles.slice(cursor, cursor + size)
    pages.push({
      index,
      firstNumber: cursor + 1,
      lastNumber: cursor + size,
      puzzles: pagePuzzles,
      chapters: [],
    })
    cursor += size
  }
  return pages
}

/** 存档串全为 '.'（进入过但没动格子）不算进行中 */
export function isInProgress(progress?: PuzzleProgress): boolean {
  return progress !== undefined && !progress.completed && /[#x]/.test(progress.board)
}

/** 「继续游戏」的落点：手上那一局打到一半的关，没有就返回 undefined。 */
export function resumeTarget(
  puzzles: Puzzle[],
  progressMap: Record<string, PuzzleProgress>,
): Puzzle | undefined {
  return puzzles.find((p) => isInProgress(progressMap[p.id]))
}

/**
 * 新打开一册时默认停在的页：先接真正打到一半的局，否则去第一关从未通关的页。
 * 全册都曾通关时回第 1 页，从头浏览比把人丢在末页更像重新翻开一本画册。
 */
export function initialPageIndex(
  pages: LevelPage[],
  progressMap: Record<string, PuzzleProgress>,
): number {
  const inProgress = pages.findIndex((page) =>
    page.puzzles.some((puzzle) => isInProgress(progressMap[puzzle.id])),
  )
  if (inProgress >= 0) return inProgress
  const neverCleared = pages.findIndex((page) =>
    page.puzzles.some((puzzle) => !isUnlocked(progressMap[puzzle.id])),
  )
  return neverCleared >= 0 ? neverCleared : 0
}
