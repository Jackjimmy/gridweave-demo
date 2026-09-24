import { useCallback, useState } from 'react'
import type { PuzzleProgress } from '../types'
import { loadAllProgress, saveProgress } from '../utils/storage'

/**
 * 全部关卡进度的内存镜像 + 落盘门面。
 * App 顶层持有一份，选关页读完成态，游戏页写进度。
 */
export function usePuzzleProgress(puzzleIds: string[]) {
  const [progressMap, setProgressMap] = useState<Record<string, PuzzleProgress>>(() =>
    loadAllProgress(puzzleIds),
  )

  const save = useCallback((puzzleId: string, progress: PuzzleProgress) => {
    saveProgress(puzzleId, progress)
    setProgressMap((map) => ({ ...map, [puzzleId]: progress }))
  }, [])

  const markCompleted = useCallback(
    (puzzleId: string, timeSeconds: number) => {
      setProgressMap((map) => {
        const previous = map[puzzleId]
        const best = previous?.bestTimeSeconds
        const now = Date.now()
        const progress: PuzzleProgress = {
          version: 1,
          board: '',
          elapsedSeconds: 0,
          completed: true,
          everCompleted: true,
          bestTimeSeconds: best === undefined ? timeSeconds : Math.min(best, timeSeconds),
          // 重玩通关也刷新：解锁库要的是"最近玩完的"，不是"第一次解开的"
          completedAt: now,
          // 这一项相反，只写一次：写过就不动，没写过的老存档也不在这里补——
          // 那时的"第一次"已经无从查起，补上去的只会是一个假日期
          firstClearedAt: previous?.firstClearedAt ?? (previous?.everCompleted ? undefined : now),
        }
        saveProgress(puzzleId, progress)
        return { ...map, [puzzleId]: progress }
      })
    },
    [],
  )

  return { progressMap, save, markCompleted }
}
