import { memo } from 'react'
import type { CSSProperties } from 'react'
import type { CellState } from '../../types'
import { useT } from '../../i18n'
import type { TextKey } from '../../i18n'
import styles from './Board.module.css'

interface Props {
  /** aria-activedescendant 要指得到这一格（见 GameBoard 的 gridId） */
  id: string
  state: CellState
  row: number
  col: number
  highlighted: boolean
  /** 揭晓终态下该主体格的马赛克颜色；无 art 的关卡为 null，回退 --color-fill */
  revealColor: string | null
  /** 揭晓终态下该背景格的场景色；无场景的关卡为 null，回退白底 */
  sceneColor: string | null
  /**
   * 是否由这里排版 × 字形。对局盘面交给 BoardCanvas 画之后就不必了：
   * 字形被上面那张不透明的 canvas 完全盖住，而每次落子仍要重新塑形一遍。
   */
  showMark?: boolean
}

const STATE_KEY: Record<CellState, TextKey> = {
  empty: 'game.cellState.empty',
  filled: 'game.cellState.filled',
  marked: 'game.cellState.marked',
}

export const Cell = memo(function Cell({
  id,
  state,
  row,
  col,
  highlighted,
  revealColor,
  sceneColor,
  showMark = true,
}: Props) {
  const t = useT()
  const classes = [styles.cell, styles[state]]
  if (highlighted) classes.push(styles.highlighted)
  // 揭晓的动画由 RevealCanvas 负责；这里只下发终态颜色，供 canvas 卸载后的静态显示
  const style: CSSProperties & Record<string, string | number> = {}
  if (revealColor) style['--reveal-color'] = revealColor
  if (sceneColor) style['--scene-color'] = sceneColor
  return (
    <div
      className={classes.join(' ')}
      id={id}
      data-row={row}
      data-col={col}
      role="gridcell"
      aria-label={t('game.cell', { row: row + 1, col: col + 1, state: t(STATE_KEY[state]) })}
      style={style}
    >
      {showMark && state === 'marked' ? '×' : ''}
    </div>
  )
})
