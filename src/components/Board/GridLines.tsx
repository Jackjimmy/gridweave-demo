import type { CSSProperties } from 'react'
import styles from './Board.module.css'

export interface GridStrokeWidths {
  normal: number
  major: number
}

interface Props {
  size: number
}

const GRID_STROKE_WIDTHS: Record<number, GridStrokeWidths> = {
  // 5×5 没有内部五格分隔边界，major 与 normal 保持一致且不会实际绘制。
  5: { normal: 1, major: 1 },
  10: { normal: 0.75, major: 1.5 },
  15: { normal: 0.6, major: 1.2 },
}

const FALLBACK_STROKE_WIDTHS: GridStrokeWidths = { normal: 1, major: 2 }

function getGridStrokeWidths(size: number): GridStrokeWidths {
  return GRID_STROKE_WIDTHS[size] ?? FALLBACK_STROKE_WIDTHS
}

/**
 * 棋盘线独立于单元格内容统一绘制。不同棋盘密度使用固定 fractional CSS
 * 线宽；non-scaling-stroke 避免随分数 cell-size 缩放，geometricPrecision
 * 保留非整数 DPR 下的亚像素覆盖。
 */
export function GridLines({ size }: Props) {
  const boundaries = Array.from({ length: Math.max(0, size - 1) }, (_, index) => index + 1)
  const strokeWidths = getGridStrokeWidths(size)
  const style = {
    '--grid-line-normal-width': `${strokeWidths.normal}px`,
    '--grid-line-major-width': `${strokeWidths.major}px`,
  } as CSSProperties

  return (
    <svg
      className={styles.gridLines}
      style={style}
      data-grid-lines=""
      viewBox={`0 0 ${size} ${size}`}
      preserveAspectRatio="none"
      shapeRendering="geometricPrecision"
      aria-hidden="true"
      focusable="false"
      pointerEvents="none"
    >
      {boundaries.flatMap((index) => {
        const weight = index % 5 === 0 ? 'strong' : 'normal'
        const className = weight === 'strong' ? styles.gridLineStrong : styles.gridLine
        return [
          <line
            key={`vertical-${index}`}
            className={className}
            data-axis="vertical"
            data-index={index}
            data-weight={weight}
            x1={index}
            x2={index}
            y1={0}
            y2={size}
            vectorEffect="non-scaling-stroke"
          />,
          <line
            key={`horizontal-${index}`}
            className={className}
            data-axis="horizontal"
            data-index={index}
            data-weight={weight}
            x1={0}
            x2={size}
            y1={index}
            y2={index}
            vectorEffect="non-scaling-stroke"
          />,
        ]
      })}
    </svg>
  )
}
