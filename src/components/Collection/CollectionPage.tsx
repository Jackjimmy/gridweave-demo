import { useMemo, useRef } from 'react'
import type { RefObject } from 'react'
import type { Puzzle, PuzzleProgress } from '../../types'
import { BackIcon } from '../BackIcon'
import { useNearViewport } from '../../hooks/useNearViewport'
import type { Album } from '../../utils/albums'
import { isUnlocked } from '../../utils/unlocked'
import { useT } from '../../i18n'
import { isDemoBuild } from '../../config/demo'
import { albumTitle } from '../../i18n/content'
import { CollectionGrid } from './CollectionGrid'
import { useFitOneLine } from '../../hooks/useFitOneLine'
import styles from './CollectionPage.module.css'

/**
 * 页名收字号的下界。15px 是 320px 屏上还读得清的大小；到界仍放不下才省略——
 * 那说明这一页的名字该起得更短，不该由界面一直缩。
 */
const MIN_TITLE_PX = 15

interface Props {
  albums: Album[]
  progressMap: Record<string, PuzzleProgress>
  totalCount: number
  onExit: () => void
  /** 摊开看那一幅：另起一页（PuzzleDetailPage），不是就地弹一层 */
  onOpenDetail: (puzzleId: string) => void
}

/** 每行格数；15×15 的图案缩到这个尺寸仍认得出轮廓。网页试玩一本六关，一本正好一行 */
const COLUMNS = isDemoBuild ? 6 : 10

/**
 * 我的收藏：解开过的画按画册砌成一面马赛克墙。
 *
 * 首页那个四行的窗口只摆最近解开的几张、不分主题；这一页反过来——按册归拢，
 * 一册一段，一眼看得出哪本画满了、哪本才起了个头。
 *
 * 墙上没有空位：没解开的关卡不占格子、不画白框、不铺底纹，一册一关没解就整段
 * 不出现。缺口由书架上每本书的进度条负责表达，这一页只陈列战果。
 *
 * 点一幅画走进它自己的陈列页（见 PuzzleDetailPage）：大图、名字、收在哪一本第几幅、
 * 什么时候第一次解开的、最好那一次多快。重玩从那一页顺带能做。
 */
export function CollectionPage({ albums, progressMap, totalCount, onExit, onOpenDetail }: Props) {
  const t = useT()
  const titleRef = useFitOneLine<HTMLHeadingElement>(MIN_TITLE_PX)
  /**
   * 这一页自己那个滚动容器。
   *
   * 从前借的是根节点。根节点的滚动全文档只有一份，谁在文档流里就归谁——摊开一幅
   * 藏品时这一层变成预热层（position: fixed），那一份跟着归了别人，退页那一下又
   * 被清零，于是从藏品页退回来永远在页顶，人明明看在第七册。位置装在自己这个
   * 节点上就跟着节点走：预热着的那一份也停在对的地方，揭开第一帧就是离开时那一屏。
   */
  const scrollerRef = useRef<HTMLDivElement>(null)

  const sections = useMemo(
    () =>
      albums
        .map((album) => ({
          album,
          unlocked: album.puzzles.filter((puzzle) => isUnlocked(progressMap[puzzle.id])),
        }))
        .filter((section) => section.unlocked.length > 0),
    [albums, progressMap],
  )
  const done = sections.reduce((sum, section) => sum + section.unlocked.length, 0)

  return (
    <div className={styles.scroller} ref={scrollerRef}>
      <div className={styles.page}>
        <header className={styles.header}>
          <button className={styles.back} type="button" onClick={onExit} aria-label={t('common.backHome')}>
            <BackIcon />
          </button>
          <h1 className={styles.title} ref={titleRef}>{t('collection.title')}</h1>
          <span className={styles.tally} aria-label={t('album.unlockedTally', { done, total: totalCount })}>
            <span
              className={styles.tallyFill}
              style={{ width: `${(done / Math.max(1, totalCount)) * 100}%` }}
              aria-hidden="true"
            />
            <span className={styles.tallyText} aria-hidden="true">
              <b>{done}</b> / {totalCount}
            </span>
          </span>
        </header>

        {sections.length === 0 ? (
          <p className={styles.empty}>{t('collection.empty')}</p>
        ) : (
          sections.map(({ album, unlocked }) => (
            <Section
              key={album.id}
              album={album}
              unlocked={unlocked}
              scrollerRef={scrollerRef}
              onOpenDetail={onOpenDetail}
            />
          ))
        )}

      </div>
    </div>
  )
}

/**
 * 一册一段，段自己决定什么时候开工。
 *
 * 满库的老玩家这一页有 600 格。段还在视野之外时只按行占住高度，格子一个都不
 * 建——600 个按钮加 600 张 canvas 建出来本身就是一次以百毫秒计的长任务，而其中
 * 十之八九当时不在屏幕上。滚到跟前才把格子和画挂上。
 *
 * 画本身不在这里取：全库开机就取齐了（见 data/libraryBoot），翻开这一页时每一册
 * 都已在手上（App 的 openCollection 再守一道）。从前这里滚到哪一册取哪一册，
 * 册块落地在页面已经摊开之后，每落一册整棵树重画一遍——那正是左缘返回露出旧页
 * 的来路，所以取册这件事整个从页面里拿掉了。
 */
function Section({
  album,
  unlocked,
  scrollerRef,
  onOpenDetail,
}: {
  album: Album
  unlocked: Puzzle[]
  /** 滚动的是这一页自己那个容器，「快看得见了」得按它算（见 useNearViewport） */
  scrollerRef: RefObject<HTMLElement | null>
  onOpenDetail: (puzzleId: string) => void
}) {
  const [ref, near] = useNearViewport<HTMLElement>(undefined, scrollerRef)

  return (
    <section ref={ref} className={styles.section}>
      <h2 className={styles.sectionTitle}>
        {albumTitle(album.id)}
        <span className={styles.sectionMeta}>
          {unlocked.length} / {album.puzzles.length}
        </span>
      </h2>
      <CollectionGrid
        puzzles={unlocked}
        columns={COLUMNS}
        dormant={!near}
        onSelect={(puzzle) => onOpenDetail(puzzle.id)}
      />
    </section>
  )
}
