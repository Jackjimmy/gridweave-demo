import type { Puzzle, PuzzleProgress } from '../../types'
import { formatSeconds } from '../../hooks/useTimer'
import { localeTag, t, useT } from '../../i18n'
import { puzzleDisplayName } from '../../i18n/content'
import { ArtImage } from '../ArtImage/ArtImage'
import { BackIcon } from '../BackIcon'
import { useFitOneLine } from '../../hooks/useFitOneLine'
import styles from './PuzzleDetailPage.module.css'

/**
 * 页名收字号的下界。15px 是 320px 屏上还读得清的大小；到界仍放不下才省略——
 * 那说明这一页的名字该起得更短，不该由界面一直缩。
 */
const MIN_TITLE_PX = 15

interface Props {
  puzzle: Puzzle
  /** 这幅画收在哪一本；页面整片底色也由它决定（data-album-id → --album-rgb） */
  albumId: string
  albumName: string
  /**
   * 这幅画所在那一章的名字，按当前语言取（chapterLabel）。
   * 库外的关（每日挑战）没有章，这一行整行不出现。
   */
  chapterName?: string
  /** 是这一本的第几幅（从 1 数，与册内关号同一个数） */
  index: number
  progress?: PuzzleProgress
  onReplay: () => void
  onExit: () => void
}

/**
 * 首次完成的日期。
 *
 * 日历日一律按 Asia/Shanghai 取，与每日挑战同一套日期观（见 utils/daily 的
 * shanghaiToday）——同一次通关不该因为人在哪个时区而显示成两个日子。
 * en-CA 出来的恰好是 YYYY-MM-DD，拆开就是这一天的年月日。
 *
 * 怎么排交给消息包：中日韩自己拼（中文那套「2026 年 9 月 6 日」的空格是这个
 * App 的排版习惯，Intl 给的是「2026年9月6日」，不一样），拉丁语系直接用 Intl
 * 排好的整串——那边的语序、月份缩写与逗号位置各家不同，不该由我们去猜。
 */
const SHANGHAI_YMD = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' })

function clearedDateLabel(epochMs: number): string {
  const date = new Date(epochMs)
  const [year, month, day] = SHANGHAI_YMD.format(date).split('-')
  return t('detail.dateFormat', {
    year,
    month: Number(month),
    day: Number(day),
    full: new Intl.DateTimeFormat(localeTag(), {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(date),
  })
}

/**
 * 一幅藏品的陈列页。
 *
 * 这一层从前不存在——收藏墙上点一幅画，唯一的动作是「重玩？」。于是一幅画在整个
 * App 里被完整看到的时间，只有通关那三秒和结算卡上那一小张，此后永远是 40px 的
 * 马赛克。**回报是画，就必须有一处只为了看画的地方。**
 *
 * 做成一整页而不是升起的浮层，是因为浮层永远在说「你还在刚才那一屏上，这只是一次
 * 打断」。这幅画是玩家自己解出来的东西，它值得一整屏，也值得像进关卡那样正经地
 * 走进去、用左缘手势正经地退出来（层级注册在 App 的 popPageStep 里）。
 *
 * 整页底色取这一本画册的封面色（`data-album-id`，色值见 global.css）：从书架上那一格
 * 到这一幅画，颜色是连着的——一眼知道这幅画是从哪本书里翻出来的，不必去读那行小字。
 */
export function PuzzleDetailPage({
  puzzle,
  albumId,
  albumName,
  chapterName,
  index,
  progress,
  onReplay,
  onExit,
}: Props) {
  const t = useT()
  const titleRef = useFitOneLine<HTMLHeadingElement>(MIN_TITLE_PX)
  const firstCleared = progress?.firstClearedAt
  const best = progress?.bestTimeSeconds
  /*
   * 名字两行：中日韩是英文大字压本地小字，英文与德法西葡只有一行
   * （规则与结算卡、册页那两处同源，见 i18n/content 的 puzzleDisplayName）。
   */
  const name = puzzleDisplayName(puzzle, t.locale)

  return (
    <div className={styles.page} data-album-id={albumId}>
      <header className={styles.header}>
        <button className={styles.back} type="button" onClick={onExit} aria-label={t('detail.back')}>
          <BackIcon />
        </button>
        <h1 className={styles.title} ref={titleRef}>{t('detail.title')}</h1>
      </header>

      <div className={styles.stage}>
        <h2 className={styles.name}>
          <span className={styles.namePrimary} lang={t.locale === 'en' ? 'en' : undefined}>
            {name.primary}
          </span>
          {name.secondary !== undefined && (
            <span className={styles.nameSecondary}>{name.secondary}</span>
          )}
        </h2>

        {/* 画裱在一张卡纸上：底色是这一本的，画不该直接贴在色块上 */}
        <div className={styles.mat}>
          <ArtImage puzzle={puzzle} className={styles.art} />
        </div>

        <dl className={styles.meta}>
          <div className={styles.row}>
            <dt>{t('detail.from')}</dt>
            <dd>{albumName}</dd>
          </div>
          {chapterName !== undefined && (
            <div className={styles.row}>
              <dt>{t('detail.chapter')}</dt>
              <dd>{chapterName}</dd>
            </div>
          )}
          <div className={styles.row}>
            <dt>{t('detail.index')}</dt>
            <dd>{t('detail.indexValue', { index })}</dd>
          </div>
          {/* 老存档没记过第一次通关的时刻，那就整行不出现，不拿最近一次冒充（见 types 的 firstClearedAt） */}
          {firstCleared !== undefined && (
            <div className={styles.row}>
              <dt>{t('detail.firstCleared')}</dt>
              <dd>{clearedDateLabel(firstCleared)}</dd>
            </div>
          )}
          {best !== undefined && (
            <div className={styles.row}>
              <dt>{t('detail.bestTime')}</dt>
              <dd>{formatSeconds(best)}</dd>
            </div>
          )}
        </dl>
      </div>

      <button className={styles.replay} type="button" onClick={onReplay}>
        {t('detail.replay')}
      </button>
    </div>
  )
}
