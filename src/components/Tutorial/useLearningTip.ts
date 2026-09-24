import { useEffect, useState } from 'react'
import type { Board, Puzzle } from '../../types'
import { journeySeen, rememberJourney } from '../../utils/journey'

/** 只给入门阶段一次工具提醒；不改盘、不自动使用提示、不打断落笔。 */
export function useLearningTip(puzzle: Puzzle, board: Board, enabled: boolean, canUndo: boolean, hintUsed: boolean) {
  const [tip, setTip] = useState<'undo' | 'hint' | null>(null)
  useEffect(() => {
    const mistaken = enabled && canUndo && board.some((line, r) =>
      line.some((cell, c) => (cell === 'filled' && puzzle.solution[r][c] === 0) ||
        (cell === 'marked' && puzzle.solution[r][c] === 1)))
    // 一笔拖过多格时保留刚出现的撤销说明，直到错误被纠正。
    setTip((current) => mistaken && current === 'undo' ? current : null)
    if (!enabled) return
    if (mistaken && !journeySeen('tool-undo')) {
      rememberJourney('tool-undo')
      setTip('undo')
      return
    }
    if (hintUsed || journeySeen('tool-hint')) return
    const timer = window.setTimeout(() => {
      if (document.visibilityState === 'hidden') return
      rememberJourney('tool-hint')
      setTip('hint')
    }, 20000)
    return () => window.clearTimeout(timer)
  }, [puzzle, board, enabled, canUndo, hintUsed])
  return tip
}
