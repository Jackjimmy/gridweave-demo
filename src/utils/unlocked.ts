import type { Puzzle, PuzzleProgress } from '../types'

/** 通关过就算解锁：重玩期间（completed 已被清掉）也仍然算 */
export function isUnlocked(progress?: PuzzleProgress): boolean {
  return progress?.completed === true || progress?.everCompleted === true
}

/**
 * 解锁库的陈列顺序：最近玩完的排最前。
 *
 * 没解锁的关卡根本不进这个列表——它们在解锁库里不占位置、不留白框。
 * 一格格空着的马赛克把「还差 500 多张」摆在首页正中间，那是压力不是收藏。
 *
 * 老存档没有 completedAt（那时通关只记 completed），一律排在有时间戳的那些后面，
 * 内部保持传入的展示顺序——对老玩家来说，那批画本来就是"很久以前"解开的。
 */
export function unlockedByRecency(
  puzzles: Puzzle[],
  progressMap: Record<string, PuzzleProgress>,
): Puzzle[] {
  return puzzles
    .filter((puzzle) => isUnlocked(progressMap[puzzle.id]))
    .map((puzzle, index) => ({ puzzle, index }))
    .toSorted((a, b) => {
      const at = progressMap[a.puzzle.id]?.completedAt
      const bt = progressMap[b.puzzle.id]?.completedAt
      if (at !== undefined && bt !== undefined) return bt - at
      if (at !== undefined) return -1
      if (bt !== undefined) return 1
      return a.index - b.index
    })
    .map((entry) => entry.puzzle)
}

/**
 * 陈列口径的计数：曾通关就算数。
 *
 * 首页收藏架抬头、册页抬头、收藏页抬头三处都写「已解锁 n / m」，数的必须是同一批
 * ——架上真正摆着的那几幅画。用 completed 去数会出现「重玩一关，画一幅没少，
 * 数字却退一格」：首页写 n−1、点进收藏页写 n，同一句话两个数。
 *
 * 收进一个函数而不是三处各写一遍 filter，是因为这三处将来只会更多，不会更少。
 * 注意与「当前进度」那一路分开：四宫格上的 n/m 与镶金数的是当前通关，重玩时
 * 本来就该退回去（见 LevelSelect 的 AlbumTile），那不是同一个问题。
 */
export function countUnlocked(
  puzzles: Puzzle[],
  progressMap: Record<string, PuzzleProgress>,
): number {
  let count = 0
  for (const puzzle of puzzles) {
    if (isUnlocked(progressMap[puzzle.id])) count += 1
  }
  return count
}
