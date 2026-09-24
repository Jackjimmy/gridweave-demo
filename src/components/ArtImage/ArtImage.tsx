import { useMemo } from 'react'
import type { PuzzleData } from '../../types'
import { artColorGrid } from '../../utils/art'
import { resolveSubjectPalette, sceneColorGrid } from '../../utils/scene'
import { getSceneById } from '../../data/scenes'
import { useT } from '../../i18n'
import { puzzleLabel } from '../../i18n/content'
import styles from './ArtImage.module.css'

interface Props {
  puzzle: PuzzleData
  className?: string
}

/**
 * 关卡完成图案的整洁插图渲染（通关结算卡、每日日历）：无缝平铺色块、无内部网格线。
 * 有场景的关卡先铺满背景色块再叠主体，得到与棋盘揭晓终态一致的整张场景图；
 * 无场景的关卡回退白底，无 art 的关卡再回退单色 --color-fill。
 */
export function ArtImage({ puzzle, className }: Props) {
  const t = useT()
  const { solution, size } = puzzle
  // 依赖是整个 puzzle 而不是 puzzle.id：占位换成真关卡的那一刻场景才登记进表，
  // 只认 id 会把「查不到场景」记死在占位那一帧（见 Thumbnail 的长注释）
  const scene = useMemo(() => getSceneById(puzzle.id), [puzzle])
  const colors = useMemo(
    () => artColorGrid(puzzle, resolveSubjectPalette(puzzle, scene)),
    [puzzle, scene],
  )
  const sceneColors = useMemo(() => sceneColorGrid(puzzle, scene), [puzzle, scene])

  return (
    <svg
      className={`${styles.art} ${className ?? ''}`}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={t('a11y.artOf', { name: puzzleLabel(puzzle) })}
    >
      {/* 白底保留为兜底：无场景、或场景个别格缺色时透出来 */}
      <rect width={size} height={size} className={styles.background} />
      {solution.flatMap((row, r) =>
        row.map((v, c) => {
          const fill = v === 1 ? (colors?.[r][c] ?? 'var(--color-fill)') : sceneColors?.[r][c]
          if (!fill) return null
          return <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill={fill} />
        }),
      )}
    </svg>
  )
}
