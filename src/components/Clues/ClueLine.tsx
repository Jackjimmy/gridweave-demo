import { memo } from 'react'
import type { Clue } from '../../types'
import { getClueLayout } from './clueLayout'
import styles from './Clues.module.css'

interface Props {
  clue: Clue
  orientation: 'row' | 'col'
  availableAxisPx: number
  satisfied: boolean
  completedSegments: boolean[]
  highlighted: boolean
  /** 提示指的就是这一条：药丸整体点亮，与十字高亮区分开 */
  hinted?: boolean
}

/** 一行或一列的线索数字组；整线或单段完成态都只落在对应数字上 */
export const ClueLine = memo(function ClueLine({
  clue,
  orientation,
  availableAxisPx,
  satisfied,
  completedSegments,
  highlighted,
  hinted = false,
}: Props) {
  const layout = getClueLayout(clue, orientation, availableAxisPx)
  const classes = [styles.clue, orientation === 'row' ? styles.rowClue : styles.colClue]
  if (highlighted) classes.push(styles.highlighted)
  if (hinted) classes.push(styles.hinted)
  return (
    <div
      className={classes.join(' ')}
      data-density={layout.density}
      data-orientation={orientation}
      data-segments={layout.segmentCount}
      data-digits={layout.digitCount}
      data-satisfied={satisfied ? 'true' : 'false'}
      style={layout.style}
    >
      {clue.map((n, i) => {
        const segmentSatisfied = satisfied || completedSegments[i]
        const segmentClasses = [
          n >= 10 ? styles.multiDigit : '',
          segmentSatisfied ? styles.segmentSatisfied : '',
        ].filter(Boolean)
        return (
          <span
            key={i}
            className={segmentClasses.length > 0 ? segmentClasses.join(' ') : undefined}
            data-completed={segmentSatisfied ? 'true' : 'false'}
          >
            {n}
          </span>
        )
      })}
    </div>
  )
})
