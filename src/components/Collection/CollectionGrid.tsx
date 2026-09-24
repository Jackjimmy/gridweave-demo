import { useLayoutEffect, useRef } from 'react'
import type { Puzzle } from '../../types'
import { useT } from '../../i18n'
import { puzzleLabel } from '../../i18n/content'
import { COLLECTION_GAP } from '../../utils/shelfLayout'
import { Thumbnail } from '../Thumbnail/Thumbnail'
import styles from './CollectionGrid.module.css'

interface Props {
  /** 已解锁的关卡，按陈列顺序；没解锁的不传进来 */
  puzzles: Puzzle[]
  /**
   * 每行几格。不传时由外层 CSS 给出 --collection-columns——首页收藏架的列数
   * 要随屏高在媒体查询里换档，写成行内样式就再也压不过去了。
   */
  columns?: number
  className?: string
  /**
   * 这一片还没到跟前：只按行占住该占的高度，格子一个都不摆。
   *
   * 给收藏页那种一次几百格的长页面按段延后用（见 CollectionPage 的 Section）：
   * 满库老玩家那一页 600 格，光是把这 600 个按钮建出来就是一次长任务，而其中
   * 十之八九当时根本不在屏幕上。要 columns 才算得出行数，所以只在传了列数时
   * 认这个开关；不传就是照常摆满，短列表不必为此绕路。
   */
  dormant?: boolean
  /** 传入后每一幅画都可点，进它自己的陈列页 */
  onSelect?: (puzzle: Puzzle) => void
}

/**
 * 解锁库的画墙：解开一关，这里多出一幅画。
 *
 * **没解开的关卡在这里不存在**——不留空位、不画底纹、不铺那层灰。
 * 从前是一整块 10×N 的马赛克，解开的填色、没解开的留空，于是新玩家打开首页
 * 第一眼看到的是五百多个空格子；那不是收藏，是催债。现在这一片从零开始长，
 * 长多长就多大，边界就是玩家自己走到的地方。
 *
 * 拼成一片马赛克，格与格之间只隔一条 1px 的缝：首页那个四行的窗口是展示橱窗，
 * 解锁库是全览，两处同一套画法——同一批画，不该因为摆在哪儿就换个长相。
 */
export function CollectionGrid({ puzzles, columns, className, dormant, onSelect }: Props) {
  const t = useT()
  const gridClass = className ? `${styles.grid} ${className}` : styles.grid
  const gridRef = useRef<HTMLSpanElement>(null)
  /*
   * 格宽取整数 CSS 像素，写进 --collection-cell（CSS 里没有它时退回 1fr）。
   *
   * 画是挂进页面的 canvas（见 Thumbnail），替换元素的绘制矩形按整设备像素取整：
   * 格宽是 1fr 分出来的小数时，画的边与格的边差不到一个像素，格与格之间那道缝
   * 便时宽时窄（DPR 3 上时 2 时 3 时 4 个物理像素）。
   *
   * 取整到 **CSS 像素**而不是设备像素：WebKit 的排版单位是 1/64 CSS px，
   * 1/3 CSS px（DPR 3 上的一个物理像素）写不进去——实测 36.6667px 落成 36.65625px，
   * 边照样不在像素边界上。整数 CSS 像素在任何整数 DPR 上都是整数个物理像素，
   * 格的每条边正好落在像素边界，缝一律等宽，也没有东西可漏。
   *
   * 剩下不到一格的零头（最多 N−1 px）留在两侧：左边垫 floor(零头/2) 的整数内边距，
   * 两侧至多差 1px，透的是页面底色，看不出来。
   *
   * 量在 ResizeObserver 里：回调排在排版之后、绘制之前，首帧就是取整过的；
   * 列数随外层 CSS 走（媒体查询会换档），从算好的模板里数，不另记一份。
   */
  useLayoutEffect(() => {
    const grid = gridRef.current
    if (!grid || typeof ResizeObserver === 'undefined') return
    const snap = () => {
      const count = getComputedStyle(grid).gridTemplateColumns.split(' ').length
      const width = Math.floor(grid.getBoundingClientRect().width)
      if (!(width > 0) || count === 0) return
      const cell = Math.floor((width - (count - 1) * COLLECTION_GAP) / count)
      if (cell <= 0) return
      const leftover = width - cell * count - (count - 1) * COLLECTION_GAP
      grid.style.setProperty('--collection-cell', `${cell}px`)
      grid.style.setProperty('--collection-inset', `${Math.floor(leftover / 2)}px`)
    }
    snap()
    const observer = new ResizeObserver(snap)
    observer.observe(grid)
    return () => observer.disconnect()
  }, [])

  // 缝的宽度只有 shelfLayout.ts 一个来源：首页收藏架要拿同一个数去算行高与能露几行
  const gridStyle = {
    '--collection-gap': `${COLLECTION_GAP}px`,
    ...(columns !== undefined && { '--collection-columns': columns }),
  } as React.CSSProperties

  if (dormant && columns !== undefined) {
    return (
      <span className={gridClass} style={gridStyle} ref={gridRef} aria-hidden="true">
        {Array.from({ length: Math.ceil(puzzles.length / columns) }, (_, row) => (
          <span key={row} className={styles.rowSpacer} />
        ))}
      </span>
    )
  }

  return (
    <span className={gridClass} style={gridStyle} ref={gridRef}>
      {puzzles.map((puzzle) =>
        onSelect ? (
          <button
            key={puzzle.id}
            className={styles.cell}
            type="button"
            data-collection-cell=""
            data-puzzle-id={puzzle.id}
            data-interactive="true"
            title={puzzleLabel(puzzle)}
            aria-label={t('collection.view', { name: puzzleLabel(puzzle) })}
            onClick={() => onSelect(puzzle)}
          >
            <Thumbnail puzzle={puzzle} className={styles.art} />
          </button>
        ) : (
          /* 首页那块整体是一个按钮，里面只能放短语内容，所以用 span 不用 li */
          <span
            key={puzzle.id}
            className={styles.cell}
            data-collection-cell=""
            data-puzzle-id={puzzle.id}
            title={puzzleLabel(puzzle)}
          >
            <Thumbnail puzzle={puzzle} className={styles.art} />
          </span>
        ),
      )}
    </span>
  )
}
