import type { Puzzle, PuzzleProgress } from '../types'
import { isUnlocked } from './unlocked'

export function needsFirstLesson(progress: Record<string, PuzzleProgress>, seen: boolean): boolean {
  return !seen && !Object.values(progress).some(isUnlocked)
}

export function hasPlayedSize(size: number, puzzles: Puzzle[], progress: Record<string, PuzzleProgress>): boolean {
  return puzzles.some((puzzle) => puzzle.size === size && (
    isUnlocked(progress[puzzle.id]) || Boolean(progress[puzzle.id]?.board)
  ))
}

// 说明偏好与关卡存档分开；写失败不影响游戏，也不假称关卡已经保存。
const unsavedPreferences = new Set<string>()
export function journeySeen(key: string): boolean {
  if (unsavedPreferences.has(key)) return true
  try { return localStorage.getItem(`nonogram:journey:${key}`) === '1' } catch { return false }
}
export function rememberJourney(key: string): void {
  try {
    localStorage.setItem(`nonogram:journey:${key}`, '1')
    unsavedPreferences.delete(key)
  } catch { unsavedPreferences.add(key) }
}
