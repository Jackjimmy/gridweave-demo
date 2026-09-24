import type { CSSProperties } from 'react'
import type { HintView } from './hintView'
import styles from './Board.module.css'

const at = (n: number) => `calc(var(--cell-size) * ${n})`
const CELL = 'var(--cell-size)'

/**
 * 提示的棋盘高亮层。
 *
 * 整层就是几个绝对定位的方块，而不是去改那一行每个格子的底色：一行 15 个格子
 * 各自跑一遍 background-color，等于每次提示都要重绘 15 块不可合成的面积，
 * 而这一层挂上去就不动了（呼吸效果试过，退了，见 .hintBand）。
 *
 * 不挂 z-index：它是定位元素，天然画在格子之上；而网格线 z-index:1 又在它之上，
 * 高亮因此压不住棋盘的骨架。
 */
export function HintOverlay({
  view,
  ghostOnly = false,
}: {
  view: HintView
  /**
   * 盘面由 BoardCanvas 出像素时，静态的三样（整条高亮、说到的格子、交点框）
   * 都已经画在 canvas 上、压在网格线之下；这里只留会动的幽灵条。
   * 它是半透明的滑块，边沿本来就不需要压着物理像素。
   */
  ghostOnly?: boolean
}) {
  const { row, col, cells, focus, ghost } = view
  return (
    <div className={styles.hintLayer} aria-hidden="true">
      {!ghostOnly && row !== null && (
        <div className={styles.hintBand} style={{ top: at(row), height: CELL }} />
      )}
      {!ghostOnly && col !== null && (
        <div className={styles.hintBand} style={{ left: at(col), width: CELL }} />
      )}
      {cells.map((cell) => {
        if (ghostOnly && cell.state !== 'ghostMark') return null
        return (
          <div
            key={`${cell.row}:${cell.col}`}
            className={styles.hintCell}
            data-state={cell.state}
            style={{ top: at(cell.row), left: at(cell.col), width: CELL, height: CELL }}
          />
        )
      })}
      {ghost && (
        <div
          key={view.token}
          className={styles.hintGhost}
          data-orientation={ghost.orientation}
          style={
            {
              ...(ghost.orientation === 'row'
                ? {
                    top: at(ghost.index),
                    height: CELL,
                    left: at(ghost.leftStart),
                    width: at(ghost.run),
                  }
                : {
                    left: at(ghost.index),
                    width: CELL,
                    top: at(ghost.leftStart),
                    height: at(ghost.run),
                  }),
              '--hint-travel': at(ghost.rightStart - ghost.leftStart),
            } as CSSProperties
          }
        />
      )}
      {!ghostOnly && focus && (
        <div
          className={styles.hintFocus}
          style={{ top: at(focus.row), left: at(focus.col), width: CELL, height: CELL }}
        />
      )}
    </div>
  )
}
