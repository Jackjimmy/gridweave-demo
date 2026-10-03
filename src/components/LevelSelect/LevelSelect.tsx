import { DemoLinks } from '../Tutorial/DemoLinks'
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Puzzle, PuzzleProgress } from '../../types'
import { authAvailable } from '../../config/auth'
import { DEMO_WIDE_QUERY, isDemoBuild } from '../../config/demo'
import { weekdayLabel } from '../../utils/daily'
import { countUnlocked, isUnlocked } from '../../utils/unlocked'
import { hasWrapPoint } from '../../utils/nameWrap'
import { fitAlbumTitles, isCjkLocale } from '../../utils/albumTitleFit'
import { type Album, type AlbumShelf, albumOfPuzzle, shelvesOf } from '../../utils/albums'
import { useT } from '../../i18n'
import { useLayerActive } from '../../hooks/useLayerActive'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { journeySeen, rememberJourney } from '../../utils/journey'
import { loadTutorialSeen } from '../../utils/storage'
import { useFullGame } from '../../billing/entitlement'
import { LockIcon } from '../FullGame/LockIcon'
import { albumTitle, groupTitle } from '../../i18n/content'
import { formatSeconds } from '../../hooks/useTimer'
import {
  COLLECTION_GAP,
  SHELF_CELL_MAX,
  SHELF_MAX_COLUMNS,
  SHELF_MAX_ROWS,
  shelfDisplayCell,
  shelfLayout,
  shelfRowsThatFit,
  shelfTierRows,
} from '../../utils/shelfLayout'
import { AccountModal } from '../AccountModal/AccountModal'
import { AlbumAward } from '../AlbumAward/AlbumAward'
import { ChapterGrid } from '../Album/ChapterGrid'
import { SIZE_LABEL } from '../Album/sizeLabel'
import { useFitPuzzleNames } from '../Album/puzzleNames'
import { TUTORIAL_LEVEL_ID } from '../Tutorial/coachScript'
import { CollectionGrid } from '../Collection/CollectionGrid'
import { SettingsGear } from '../Settings/SettingsGear'
import { SettingsModal } from '../Settings/SettingsModal'
import { Thumbnail } from '../Thumbnail/Thumbnail'
import { AboutCard } from '../Tutorial/AboutCard'
import { HomeTour } from '../Tutorial/HomeTour'
import styles from './LevelSelect.module.css'
import entryStyles from '../GameEntryBar/GameEntryBar.module.css'

/** 每日挑战入口卡片信息；联网前也传入占位状态，保证主页布局从首帧起稳定。 */
export interface DailyCardInfo {
  /** 入口固定显示今天的日期，与"光标"可能停留的其他日期无关 */
  today: string
  publishedCount: number
  progress?: PuzzleProgress
  syncing?: boolean
  available?: boolean
}

/**
 * 手上那一局：只有真打到一半才传，没有半局时首页底部整条不出现。
 *
 * 从前这里传的是「该打的下一关」，底部因此永远挂着一条「开始游戏」。
 * 那条按钮说不清自己要去哪儿——库里 602 关，它落在哪一关只有代码知道，
 * 全部通关后弹出的随机选关面板更是连册都不认。首页不替人挑关，
 * 挑关是画册那一层的事（见 AlbumPage 底部那条）。
 */
export interface ResumeInfo {
  puzzle: Puzzle
  /** 这一局已经花掉的时间，写在卡上 */
  elapsedSeconds: number
}

interface Props {
  albums: Album[]
  /** 重新回到首页时恢复的主题横卡；空值即第一题 */
  initialGroup?: string | null
  /**
   * 试玩版宽屏首页上摊开的那一本：从对局退回来就是刚打的那一关所在的册。
   * 空值时按手上那一局所在的册，再没有就是第一本。
   */
  initialAlbumId?: string | null
  totalCount: number
  /**
   * 收藏架抬头上那个分子：**解锁过多少幅**，与架上摆着的画、收藏页抬头数的是同一批。
   *
   * 不是「当前通关多少关」——重玩一关时 completed 会暂时翻回 false，那一刻架上的画
   * 一幅没少，数字却退一格，点进收藏页又变回来。四宫格上每本的 n/m 是另一回事，
   * 那儿数的就是当前通关，重玩时本来就该退。
   */
  unlockedCount: number
  /** 收藏架上的画，最近解开的排最前；只传已解锁的 */
  unlocked: Puzzle[]
  progressMap: Record<string, PuzzleProgress>
  resume?: ResumeInfo
  daily?: DailyCardInfo | null
  onSelectDaily?: () => void
  /** 进主题画册页；带主题名时直接落在那一题上 */
  onOpenLibrary: (group?: string) => void
  /** 直接翻开一本画册，落到它的选关页 */
  onOpenAlbum: (albumId: string) => void
  onOpenCollection: () => void
  onBeginLesson?: () => void
  onSelect: (puzzleId: string) => void
}

/**
 * 首页只回答「去哪儿」，一屏之内自上而下四段：今天（每日挑战）、主题、收藏架、主行动。
 * 主行动钉在底部拇指区——它是全页点得最多的一下，不该让人往上够。
 *
 * 顶上那张牌子把字标、每日挑战和设置收进同一张卡：三样都是「今天开门这一下」，
 * 从前它们散成标题、卡片、右上角一颗按钮三段，各占一道缝。并成一块之后省下的高度
 * 全给了主题卡——主题是这一屏真正要人做的选择。
 *
 * 第一层选择是**想画点什么**：四个主题横排成一条，一次露两张，卡上是一整幅圆形
 * 场景画。从前这里是四张摆成两行两列的小卡，每张右侧压四格 26px 的封面——
 * 那四格太小，认不出画的是什么，等于用四张糊图替四个书名说话。现在一题只出一幅，
 * 但它有 120px 见方：一眼看得出这一摞是什么味道，这才是第一层要回答的事。
 *
 * 16 本画册连同各自的进度仍在下一层的主题画册页，尺寸退回关卡卡片上的一行小字。
 */
export function LevelSelect({
  albums,
  initialGroup = null,
  initialAlbumId = null,
  totalCount,
  unlockedCount,
  unlocked,
  progressMap,
  onOpenCollection,
  resume,
  daily,
  onSelectDaily,
  onOpenLibrary,
  onOpenAlbum,
  onSelect,
  onBeginLesson,
}: Props) {
  const t = useT()
  const [showAccount, setShowAccount] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  /* 字标点开的游戏说明（见 Tutorial/AboutCard）：常驻入口，不走新手导览那一套 */
  const [showAbout, setShowAbout] = useState(false)
  const closeAbout = useCallback(() => setShowAbout(false), [])
  const percent = Math.round((unlockedCount / Math.max(1, totalCount)) * 100)
  /*
   * 第一次打开游戏的首页导览（见 Tutorial/HomeTour）。
   *
   * 只给真正的第一次：一幅没解开、没有半局、教学没看过、导览也没看过。
   * 装过旧版本再升上来的人有进度，不会被它拦一道；跳过教学回到首页的人
   * 教学已记为看过，也不再讲。看过的标记在按下那条入口的那一刻落下——
   * 导览的最后一页只放行它，所以这一下就是「读完了」。
   *
   * 只挂在活着的那一层：首页当预热的上一层垫在底下时（网页端刷新落回册页），
   * 这一层不该压进返回栈、不该拦点按。
   */
  const active = useLayerActive()
  const [tour, setTour] = useState(
    () => unlockedCount === 0 && !resume && Boolean(onBeginLesson) &&
      !loadTutorialSeen() && !journeySeen('home-tour'),
  )
  const beginLesson = useCallback(() => {
    if (tour) {
      rememberJourney('home-tour')
      setTour(false)
    }
    onBeginLesson?.()
  }, [tour, onBeginLesson])
  const shelves = useMemo(() => shelvesOf(albums), [albums])
  // 试玩版宽屏：四本横排 + 选中那本的六关摊在下面（见 DemoCollections）。
  // hook 无条件调用，正式版只是不读它的结果
  const wide = useMediaQuery(DEMO_WIDE_QUERY)
  const demoWide = isDemoBuild && wide
  // 手上那一局在哪一本、是这本的第几关：卡上要写清去处，但不写画名（那是通关才揭晓的）
  const resumeAlbum = useMemo(
    () => (resume ? albumOfPuzzle(albums, resume.puzzle.id) : undefined),
    [albums, resume],
  )
  const resumeNumber = resumeAlbum
    ? resumeAlbum.puzzles.findIndex((puzzle) => puzzle.id === resume?.puzzle.id) + 1
    : 0
  /*
   * 收藏架不能只按 viewport 高度猜行数：主题卡在法语等长文案下会实际增高，
   * 同一块屏幕留给收藏架的空间也随之变化。量 shelfSpace 最终分到的宽与高：
   * 它们共同定格子边长，高还决定能完整露几行。
   * ResizeObserver 同时覆盖语言、方向与相邻部件尺寸的变化。
   *
   * 解开几关都量，没有"画少就不量"的捷径：从前 40 幅以下一律按四行排，
   * 31–39 幅在矮屏上全靠父级 overflow: hidden 裁，解开第 40 幅才开始量、
   * 猛地收成两行。量不到（jsdom、还没挂上）时按最多四行、格子取上限。
   */
  const shelfSpaceRef = useRef<HTMLSpanElement>(null)
  const [shelfSpace, setShelfSpace] = useState<{ cell: number; rows: number }>()
  useLayoutEffect(() => {
    const space = shelfSpaceRef.current
    if (!space) return
    const measure = () => {
      const { width, height } = space.getBoundingClientRect()
      const rows = shelfRowsThatFit(width, height)
      if (rows === undefined) return
      const layout = shelfLayout(unlocked.length, rows)
      const next = {
        cell: shelfDisplayCell(width, height, unlocked.length, layout),
        rows,
      }
      setShelfSpace((current) =>
        current && current.cell === next.cell && current.rows === next.rows ? current : next,
      )
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(space)
    return () => observer?.disconnect()
  }, [unlocked.length])

  /*
   * 四宫格里书名的字号，一页量一次。
   *
   * 不放在每一格自己身上量：拉丁语系要的是**十六本共用一个字号**（见
   * utils/albumTitleFit），那是一个只有页面这一层看得全的决定——一格只看得见
   * 自己那本书，各量各的就会得出四个不同的字号，同一张卡上四本书大小不一。
   *
   * 量的时机有三个：换语言（书名整批换掉）、字体加载完（度量变了）、
   * 布局尺寸变了（转屏、分屏、换机器）。三个都要，少一个就会留下一批
   * 按旧尺寸算出来的字号。
   */
  const pageRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const page = pageRef.current
    if (!page) return
    const fit = () => fitAlbumTitles(page, isCjkLocale(t.locale))
    fit()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit)
    observer?.observe(page)
    document.fonts?.addEventListener('loadingdone', fit)
    return () => {
      observer?.disconnect()
      document.fonts?.removeEventListener('loadingdone', fit)
    }
  }, [shelves, t.locale])

  // 区域该留几行由解锁数定档（0–20 两行、21–30 三行、31 起四行），再被屏幕装得下的行数封顶
  const shelfTier = shelfTierRows(unlocked.length)
  const shelf = useMemo(
    () => shelfLayout(unlocked.length, shelfSpace?.rows ?? SHELF_MAX_ROWS),
    [shelfSpace?.rows, unlocked.length],
  )
  const shelfPuzzles = useMemo(() => unlocked.slice(0, shelf.shown), [shelf.shown, unlocked])

  return (
    <div className={styles.page} ref={pageRef} data-demo={isDemoBuild || undefined}>
      {/*
        门面：一条窄横栏，左起字标、今天那一关、设置。

        从前它是一张两行高的牌子：字标折成两行点阵，右沿竖着摞设置与每日卡，
        一个人还没做任何选择就先被一块 155px 高的招牌占掉五分之一屏。招牌不该
        比要选的东西还大——这一屏真正要人做的选择在下面那张四宫格上。

        点阵字标同时退场。它当初的理由是「字标本身就是一张数织」，可那要一格
        一格看得清才成立；缩到一条横栏里只剩一片蓝色噪点，不如把这点高度让给
        画册，字标退回一行普通字：NONO 用主题蓝、GRAM 用正文色，一眼是个名字。

        三样在一行里的次序照「谁最常被点」从右往左排：设置最靠右（拇指够得着，
        又不在滑动路径上），今天那一关贴着它，字标占左边剩下的位置——而剩下的
        位置现在很宽：每日那一枚收成了与设置同样大的方块，「每日挑战」四个字
        退到 aria-label 里。那四个字说的是日历块本身已经说清的事（星期加日号
        就是「今天」），却要占掉 50 多个像素，而这一行本来该由 App 的名字领头。
      */}
      <section className={styles.hero} data-demo={isDemoBuild || undefined}>
        {/* 字标本身是一枚按钮：点开游戏说明。它长得仍是一行名字，摸上去才有区别。
            标题的读法仍是 App 的名字，按钮的读法才是「游戏说明」 */}
        {/*
          试玩版：「4 本精选合集 · 24 关」是字标的副题——宽屏上跟在字标后面一行，
          竖屏上字标底下一行（一行放不下）。竖屏那张卡的抬头因此只写「精选合集」。
        */}
        {isDemoBuild && !demoWide ? (
          <div className={styles.titleStack}>
            <h1 className={styles.title} aria-label={isDemoBuild ? "Gridweave Nonogram" : "Nonogram"} data-coach="title">
              <button
                type="button"
                className={styles.titleButton}
                aria-label={t('about.aria')}
                onClick={() => setShowAbout(true)}
              >
                {isDemoBuild ? <>Gridweave</> : <><span className={styles.titleMark}>NONO</span>GRAM</>}
              </button>
            </h1>
            <DemoTagline albums={albums} className={styles.demoSubtitle} />
            <DemoLinks compact />
          </div>
        ) : (
          <h1 className={styles.title} aria-label={isDemoBuild ? "Gridweave Nonogram" : "Nonogram"} data-coach="title">
            <button
              type="button"
              className={styles.titleButton}
              aria-label={t('about.aria')}
              onClick={() => setShowAbout(true)}
            >
              {isDemoBuild ? <>Gridweave</> : <><span className={styles.titleMark}>NONO</span>GRAM</>}
            </button>
          </h1>
        )}
        {demoWide && <div><DemoTagline albums={albums} className={styles.demoTagline} /><DemoLinks compact /></div>}

        {daily && onSelectDaily && (
          <button
            className={styles.dailyCard}
            type="button"
            data-coach="daily"
            /* 卡面上只剩那枚日历块，名字挂在这儿：读屏念得出，视觉上省下的
               50 多个像素归字标 */
            aria-label={t('home.daily')}
            /* 还没发布、或正在同步：整张卡淡一档。这一条从前是卡上那行状态字
               （待发布 / 同步中 / 已完成 / 未开始），字撤掉之后仍要有人说这句话 */
            data-muted={daily.syncing === true || daily.available === false}
            onClick={onSelectDaily}
          >
            <span className={styles.dateChip} aria-hidden="true">
              <span className={styles.dateWeekday}>{weekdayLabel(daily.today)}</span>
              <span className={styles.dateDay}>{Number(daily.today.slice(8))}</span>
              {daily.progress?.completed && <span className={styles.dailyDone} />}
            </span>
          </button>
        )}

        <div className={styles.tools}>
          {authAvailable() && (
            <button
              className={styles.accountButton}
              type="button"
              aria-label={t('home.account')}
              onClick={() => setShowAccount(true)}
            >
              {t('home.account')}
            </button>
          )}
          <button
            className={styles.settingsButton}
            type="button"
            aria-label={t('home.settings')}
            onClick={() => setShowSettings(true)}
          >
            <SettingsGear size={22} />
          </button>
        </div>
      </section>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}

      {/*
        试玩版的中段是一张卡：四本精选合集摆成一排（宽屏）或两行（竖屏）。
        主题横排与页点不在——试玩的 24 关不分主题。竖屏（手机）之下收藏架与
        底部那条照 App 的样子留着；宽屏（桌面）上解开的画全摊在面板里，不再另摆一架。
      */}
      {isDemoBuild ? (
        <DemoCollections
          albums={albums}
          progressMap={progressMap}
          wide={demoWide}
          initialAlbumId={initialAlbumId ?? resumeAlbum?.id ?? null}
          onOpenAlbum={onOpenAlbum}
          onSelect={onSelect}
          lesson={unlockedCount === 0 && onBeginLesson && !resume ? beginLesson : undefined}
        />
      ) : (
        <ThemeRail
          shelves={shelves}
          initialGroup={initialGroup}
          progressMap={progressMap}
          onOpenGroup={onOpenLibrary}
          onOpenAlbum={onOpenAlbum}
        />
      )}

      {/*
        页点与「我的收藏」之间那一道缝。写成一个会伸也会缩的空元素：宽松时它
        撑开成一道正经的缝，挤的时候一路让到 2px，页点与收藏抬头并成一条紧凑
        横带。让到哪一档由 flex 按当时还剩多少空间算（见 .gapRail）。
      */}
      {/* 试玩版：竖屏（手机）照搬 App 的收藏架；宽屏（桌面）没有它——解开的画都摊在面板上 */}
      {!demoWide && <span className={styles.gapRail} aria-hidden="true" />}

      {!demoWide && (
      <button className={styles.shelf} type="button" data-coach="collection" onClick={onOpenCollection}>
        <span className={styles.shelfHead}>
          <span className={styles.shelfTitle}>{t('home.collection')}</span>
          <span
            className={styles.tally}
            aria-label={t('album.unlockedTally', { done: unlockedCount, total: totalCount })}
          >
            <span
              className={styles.tallyFill}
              style={{ width: `${percent}%` }}
              aria-hidden="true"
            />
            <span className={styles.tallyText} aria-hidden="true">
              <b>{unlockedCount}</b> / {totalCount}
            </span>
          </span>
          <span className={styles.shelfChevron} aria-hidden="true" />
        </span>
        <span
          className={styles.shelfSpace}
          ref={shelfSpaceRef}
          data-tier-rows={shelfTier}
          style={
            {
              /*
                四个数全部来自 shelfLayout.ts，CSS 只做加法：
                上限十列与格子上限定 .shelfSpace 的理想高度（参与 flex 收缩的基准），
                量到的格边长与缝定 .shelfWindow / .shelfGrid 的真实尺寸。
              */
              '--shelf-max-columns': SHELF_MAX_COLUMNS,
              '--shelf-cell-max': `${SHELF_CELL_MAX}px`,
              '--shelf-gap': `${COLLECTION_GAP}px`,
              '--shelf-tier-rows': shelfTier,
              // 取整数 CSS 像素：画是 canvas，格边要落在像素边界上（理由见 CollectionGrid）
              ...(shelfSpace && { '--shelf-cell': `${Math.floor(shelfSpace.cell)}px` }),
            } as React.CSSProperties
          }
        >
          {/*
            一行都摆不下就整架不摆：连一格完整缩略图都放不进的高度上，按一行的
            高度摊开只会露出被拦腰切断的一排（见 shelfRowsThatFit 的地板）。
            画都还在解锁库里，这一屏少露一排，不少任何东西。
          */}
          {shelf.rows > 0 && (
            <span
              className={styles.shelfWindow}
              data-empty={shelfPuzzles.length === 0}
              data-rows={shelf.rows}
              style={
                {
                  '--shelf-rows': shelf.rows,
                  '--shelf-cols': shelf.columns,
                } as React.CSSProperties
              }
            >
              {shelfPuzzles.length === 0 && (
                <span className={styles.shelfHint}>{t('home.collectionEmpty')}</span>
              )}
              {shelfPuzzles.length > 0 && (
                <CollectionGrid puzzles={shelfPuzzles} className={styles.shelfGrid} />
              )}
            </span>
          )}
        </span>
      </button>
      )}

      {/*
        收藏架与底部主行动之间那一道缝，写成一个会伸缩的空元素：一屏之内的富余
        高度全落在这儿，直到上限为止（见 LevelSelect.module.css 的 .gapAction）。

        从前这一页是 space-between，富余由它平均分给三道缝——真机上量到三道缝
        各 30px、主行动离屏幕底边只剩 10.7px。平均分没有主张：页点周围空出一块，
        最常被点的那一条却贴着边。富余该落在有意义的那一道缝里，就是这一道。

        底部那条不出现时它连按钮的高度一起吃掉，上面几段一个像素都不动。
      */}
      <span className={styles.gapAction} aria-hidden="true" />

      {/*
        底部只剩一件事：接着上一局。

        从前这里是一条「开始游戏」：库里 602 关，它落在哪一关只有代码知道，
        点下去之前不知道要去哪本书，回来也说不清刚才在哪儿；全部通关后弹出的
        那张随机选关面板更是纯随机，连册都不认。首页不替人挑关——挑关是画册
        那一层的事，那儿有一整册的关卡摆着，底部也有一条「从第 n 关接着打」。

        没有半局时这一格空着，但**格子照样在**：上面那道缝与底边留白因此两种
        状态下一模一样，收藏架不会因为「这局刚打完」就整段往下挪。卡上写清是
        哪一本、第几关、已经花了多久，但**不写画名**——那是通关才揭晓的东西。
      */}
      {/* 宽屏的试玩首页没有这一格：行动在摊开那本的面板抬头上（见 DemoPanel） */}
      {!demoWide && (
      <div className={styles.bottom}>
        {unlockedCount === 0 && onBeginLesson && resume && (
          <button className={styles.learnLink} onClick={beginLesson}>{t('journey.homeBody')}</button>
        )}
        {unlockedCount === 0 && onBeginLesson && !resume && (
          <button className={entryStyles.bar} type="button" data-coach="lesson" onClick={beginLesson}>
            <span className={entryStyles.text}>
              <span className={entryStyles.action}>{t('journey.homeTitle')}</span>
              {/*
               * 这一句用入口条自己的 .detail，不用 .resumeMeta：.resumeMeta 是给
               * 「接着打」那条排的——它是一行 flex，长的那截（册名）由里头的
               * .resumeAlbum 自己收。这儿只有一句整话，没有那层壳，套上去就没人
               * 收边：德语这句写满一行后会从条子里溢出去，压在右边那枚播放键底下。
               */}
              <span className={entryStyles.detail}>{t('journey.homeBody')}</span>
            </span>
            <span className={entryStyles.play} aria-hidden="true" />
          </button>
        )}
        {resume && (
          <button className={entryStyles.bar} type="button" onClick={() => onSelect(resume.puzzle.id)}>
            <span className={entryStyles.text}>
              <span className={entryStyles.action}>{t('home.resume')}</span>
              <span className={styles.resumeMeta}>
                {resumeAlbum && (
                  <span className={styles.resumeAlbum}>{albumTitle(resumeAlbum.id)}</span>
                )}
                {resumeNumber > 0 && <span className={styles.resumeDot} aria-hidden="true" />}
                {resumeNumber > 0 && <span>{t('album.startMeta', { number: resumeNumber })}</span>}
                {resume.elapsedSeconds > 0 && (
                  <span className={styles.resumeDot} aria-hidden="true" />
                )}
                {resume.elapsedSeconds > 0 && (
                  <span className={styles.resumeTime}>{formatSeconds(resume.elapsedSeconds)}</span>
                )}
              </span>
            </span>
            <span className={entryStyles.play} aria-hidden="true" />
          </button>
        )}
      </div>
      )}

      {showAccount && <AccountModal onClose={() => setShowAccount(false)} />}
      {showAbout && active && <AboutCard rootRef={pageRef} onClose={closeAbout} />}
      {tour && active && (
        <HomeTour rootRef={pageRef} hasDaily={Boolean(daily && onSelectDaily)} hasCollection={!demoWide} />
      )}
    </div>
  )
}

/** 「4 本精选合集 · 24 关」那一句：竖屏是卡的抬头，宽屏跟在字标后面 */
function DemoTagline({ albums, className }: { albums: Album[]; className: string }) {
  const t = useT()
  const total = albums.reduce((count, album) => count + album.puzzles.length, 0)
  return (
    <span className={className}>
      <span className={styles.themeName}>{t('home.demoCollections', { count: albums.length })}</span>
      <span className={styles.demoMeta}>{t('home.demoPuzzles', { count: total })}</span>
    </span>
  )
}

/**
 * 试玩版首页的中段：四本精选合集。
 *
 * 竖屏是一张卡，借主题卡的托盘与四宫格（.theme / .albumGrid / AlbumTile），抬头换成
 * 「4 本精选合集 · 24 关」——试玩里没有主题这一层，四本册子分属两个主题，卡面上不再
 * 按主题分摞，也不写 Free / Full Game 那枚角标（试玩没有付费这回事）。点一本翻开册页。
 *
 * 宽屏（手机横过来、平板、桌面浏览器）不翻页：四本横排成一列书，选中的那本抬起来，
 * 它的六关按章直接摊在下面的面板里——同一张关卡卡、同一套样式（Album/ChapterGrid）。
 * 面板抬头带这一本的进度与「开始 / 继续」，点关卡卡直接开局。首页导览指的两块
 * （data-coach="themes" / "lesson"）两种版式里都在。
 */
function DemoCollections({
  albums,
  progressMap,
  wide,
  initialAlbumId,
  onOpenAlbum,
  onSelect,
  lesson,
}: {
  albums: Album[]
  progressMap: Record<string, PuzzleProgress>
  wide: boolean
  initialAlbumId: string | null
  onOpenAlbum: (albumId: string) => void
  onSelect: (puzzleId: string) => void
  /** 第一次玩的那条入口；有它时面板抬头上的行动就是它 */
  lesson?: () => void
}) {
  const t = useT()
  // 与主题卡同一口径：四本全集齐整张卡镶金
  const cleared = albums.flatMap((album) => album.puzzles).every((puzzle) => isUnlocked(progressMap[puzzle.id]))

  /*
   * 宽屏上摊开的那一本。从对局退回来落在刚打的那一册（initialAlbumId 由 App 按
   * lastSelectedId 算），首页常驻在树上时这个值会变，所以要跟着拨过去。
   */
  const fallbackId = albums[0]?.id ?? ''
  const [openId, setOpenId] = useState(initialAlbumId ?? fallbackId)
  useLayoutEffect(() => {
    if (initialAlbumId) setOpenId(initialAlbumId)
  }, [initialAlbumId])
  const open = albums.find((album) => album.id === openId) ?? albums[0]

  const openTile = useCallback(
    (albumId: string) => (wide ? setOpenId(albumId) : onOpenAlbum(albumId)),
    [wide, onOpenAlbum],
  )

  if (!wide) {
    return (
      <section className={styles.themes} data-demo="">
        <section
          className={`${styles.theme} ${styles.demoCard}`}
          data-group="精选合集"
          data-cleared={cleared}
          data-coach="themes"
        >
          <header className={styles.themeHead} data-demo="">
            {/* 几本几关写在字标底下的副题里了，这里只留主题名 */}
            <span className={styles.themeName}>{t('tour.demo.title')}</span>
          </header>
          <ul className={`${styles.albumGrid} ${styles.demoGrid}`}>
            {albums.map((album) => (
              <li key={album.id}>
                <AlbumTile album={album} progressMap={progressMap} onOpen={openTile} />
              </li>
            ))}
          </ul>
        </section>
      </section>
    )
  }

  return (
    <section className={styles.themes} data-demo="" data-wide="">
      <ul className={`${styles.albumGrid} ${styles.demoShelf}`} data-coach="themes" data-cleared={cleared}>
        {albums.map((album) => (
          <li key={album.id}>
            <AlbumTile
              album={album}
              progressMap={progressMap}
              onOpen={openTile}
              selected={open?.id === album.id}
            />
          </li>
        ))}
      </ul>
      {open && (
        <DemoPanel
          key={open.id}
          album={open}
          progressMap={progressMap}
          onSelect={onSelect}
          lesson={lesson}
        />
      )}
    </section>
  )
}

/**
 * 宽屏首页上摊开的那一本：抬头（书名、进度、开始 / 继续）+ 按章摊开的六关。
 *
 * 抬头那一下的落点与册页底部那条同一条规矩（albumStartTarget）：半局优先，
 * 没看过教学时优先教学关，再按编号最小的未通关。第一次玩的人看到的是
 * 「第一次玩？」那条，它替这一本的「开始」说话——教学关就在这一本里。
 */
function DemoPanel({
  album,
  progressMap,
  onSelect,
  lesson,
}: {
  album: Album
  progressMap: Record<string, PuzzleProgress>
  onSelect: (puzzleId: string) => void
  lesson?: () => void
}) {
  const t = useT()
  const done = countUnlocked(album.puzzles, progressMap)
  const bodyRef = useRef<HTMLDivElement>(null)
  useFitPuzzleNames(bodyRef, [album, progressMap])
  /*
   * 第一次打开：教学关那一格就是「第一次玩？」——导览最后一页指着它，点它走
   * beginLesson（记下导览看过、进教学）。别的卡照常开局。
   */
  const coachPuzzleId =
    lesson && album.puzzles.some((puzzle) => puzzle.id === TUTORIAL_LEVEL_ID) ? TUTORIAL_LEVEL_ID : undefined
  const select = useCallback(
    (puzzleId: string) => {
      if (lesson && puzzleId === TUTORIAL_LEVEL_ID) lesson()
      else onSelect(puzzleId)
    },
    [lesson, onSelect],
  )

  return (
    <section className={styles.demoPanel} data-album-id={album.id} aria-label={albumTitle(album.id)}>
      {/*
        抬头只有书名与进度：四本的抬头一样高，面板也就一样高。从前右端还坐着一条
        「开始 / 继续」，集齐那本换成一枚「已集齐」，两样不等高，四本面板高矮不一；
        而六关就摆在底下，「从哪关开始」看一眼卡就知道，那条入口是多余的。
      */}
      <header className={styles.demoPanelHead}>
        <h2 className={styles.demoPanelTitle}>{albumTitle(album.id)}</h2>
        <span
          className={styles.tally}
          aria-label={t('album.unlockedTally', { done, total: album.puzzles.length })}
        >
          <span
            className={styles.tallyFill}
            style={{ width: `${Math.round((done / album.puzzles.length) * 100)}%` }}
            aria-hidden="true"
          />
          <span className={styles.tallyText} aria-hidden="true">
            <b>{done}</b> / {album.puzzles.length}
          </span>
        </span>
      </header>
      <div className={styles.demoPanelBody} data-chapter-row="" ref={bodyRef}>
        {album.pages.map((page) => (
          <ChapterGrid
            key={page.index}
            page={page}
            progressMap={progressMap}
            onSelect={select}
            coachPuzzleId={coachPuzzleId}
          />
        ))}
      </div>
    </section>
  )
}

/**
 * 主题那一段：一条横排的主题卡 + 页点。
 *
 * 一张卡就是一个主题的门面，卡里直接摆着这一题的四本画册。从前卡上只有一幅
 * 圆画和主题名，点进去是主题画册页，再点一本才到选关——想打一关要点三下，
 * 中间那一层除了把四本书重说一遍没有别的事做。现在四本书就在首页卡上，
 * 点哪一本直接进那一本的选关页，中间那一层退成「看全部」的补充入口。
 *
 * 卡宽压到只比一屏窄一截：右边那张露出左沿，这条横排才看得出还能划。
 * 页点是它另一半说明书，只说「一共四张，你在第几张」。
 */
function ThemeRail({
  shelves,
  initialGroup,
  progressMap,
  onOpenGroup,
  onOpenAlbum,
}: {
  shelves: AlbumShelf[]
  initialGroup: string | null
  progressMap: Record<string, PuzzleProgress>
  onOpenGroup: (group: string) => void
  onOpenAlbum: (albumId: string) => void
}) {
  const t = useT()
  const railRef = useRef<HTMLUListElement>(null)

  const initialIndex = Math.max(0, shelves.findIndex((shelf) => shelf.group === initialGroup))
  const [active, setActive] = useState(initialIndex)

  /*
   * 重新回到首页时直接落到原主题，不从第一张滑过去。
   *
   * 首页从前在画册期间会卸载，`active` 那个初值就够了；现在它作为「上一层」
   * 常驻在树上（见 App 的预热层），状态一路留着，所以页点要在这里一并
   * 拨回去——只把 scrollLeft 挪过去的话，滚动事件在无布局的环境里不会来，
   * 指示器会停在离开前那一档。
   */
  useLayoutEffect(() => {
    setActive(initialIndex)
    const rail = railRef.current
    const first = rail?.children.item(0) as HTMLElement | null
    const target = rail?.children.item(initialIndex) as HTMLElement | null
    if (rail && first && target) rail.scrollLeft = target.offsetLeft - first.offsetLeft
  }, [initialIndex])

  // 页点跟着实际滚动走，不做动画也不做惯性：它只是个位置指示
  const trackScroll = useCallback(() => {
    const rail = railRef.current
    if (!rail) return
    const cards = rail.children
    if (cards.length < 2) return
    const pitch =
      (cards[1] as HTMLElement).offsetLeft - (cards[0] as HTMLElement).offsetLeft || 1
    const index = Math.round(rail.scrollLeft / pitch)
    setActive(Math.min(cards.length - 1, Math.max(0, index)))
  }, [])

  return (
    <section className={styles.themes}>
      <ul className={styles.themeRail} aria-label={t('home.themes')} ref={railRef} onScroll={trackScroll}>
        {shelves.map((shelf, index) => (
          <li className={styles.themeSlot} key={shelf.group}>
            <ThemeCard
              shelf={shelf}
              progressMap={progressMap}
              onOpenGroup={onOpenGroup}
              onOpenAlbum={onOpenAlbum}
              /* 首页导览指的是第一张卡本身（一个主题连它的四本），不是整条横排 */
              coach={index === 0}
            />
          </li>
        ))}
      </ul>
      <span className={styles.dots} aria-hidden="true">
        {shelves.map((shelf, index) => (
          <i className={styles.dot} data-on={index === active} key={shelf.group} />
        ))}
      </span>
    </section>
  )
}

/**
 * 一张主题卡：一行抬头 + 这一题的四本画册。
 *
 * 抬头三样：主题名、它的英文副名、这一摞要不要钱（Free / Full Game）。点抬头
 * 进主题画册页——那一层现在的用处是「把这一题的四本连同大封面摊开看」，
 * 不再挡在打一关的路上。抬头下面压一道主题色的细线，把「这是什么」与
 * 「里面有什么」分成两段。
 *
 * 四本画册摆成四宫格，一格一本：封面有自己的底色（甜品店的奶油粉、深蓝之海的
 * 海水蓝、天空之上的夜空墨，见 global.css 那一组 --album-rgb），封面画裱在一圈
 * 白边里，名字在下，再下面是这一本自己的进度条。封面画一律满色，哪怕一关没通
 * ——那是印在书封上的画，是这一本里有什么的承诺；攒画的成就感留在收藏架上。
 * 集齐一本就得荣誉章，封面始终保留本册主题色；四本都集齐时整张卡镶金。
 *
 * 抬头那一行是标签，四宫格才是入口：书名比主题名重，点它直接开始打关。
 */
function ThemeCard({
  shelf,
  progressMap,
  onOpenGroup,
  onOpenAlbum,
  coach = false,
}: {
  shelf: AlbumShelf
  progressMap: Record<string, PuzzleProgress>
  onOpenGroup: (group: string) => void
  onOpenAlbum: (albumId: string) => void
  /** 首页导览要指的那一张（见 Tutorial/HomeTour） */
  coach?: boolean
}) {
  const t = useT()
  /*
   * 角标那一枚锁：这一摞还没解锁时才亮。
   *
   * 付费状态直接从那份唯一的判断里读（billing/entitlement），不从 App 一路传下来：
   * 首页在当前层与预热层各挂着一份，靠 props 传就得两条路各喂一次，而这两份
   * 迟早会在某一帧上说出不同的话。直装渠道恒为已拥有，那条路上这枚锁永远不亮。
   */
  // hook 无条件调用：写成 `tier === 'full' && !useFullGame().entitled` 会被短路吃掉
  const { entitled } = useFullGame()
  const locked = shelf.tier === 'full' && !entitled
  // 与四宫格同一口径：数的是解开过没有，重玩不算把这一题打回去（见 utils/unlocked.ts）
  const cleared = shelf.albums
    .flatMap((album) => album.puzzles)
    .every((puzzle) => isUnlocked(progressMap[puzzle.id]))
  return (
    <section
      className={styles.theme}
      data-group={shelf.group}
      data-tier={shelf.tier}
      data-cleared={cleared}
      data-coach={coach ? 'themes' : undefined}
    >
      <button className={styles.themeHead} type="button" onClick={() => onOpenGroup(shelf.group)}>
        {/* 主题名只出一行当前语言；英文副名那一套只留给关卡名（见 i18n/content） */}
        <span className={styles.themeName}>{groupTitle(shelf.group)}</span>
        <span className={styles.themeTier} aria-label={locked ? t('fullGame.lockedAria') : undefined}>
          {locked && <LockIcon />}
          {shelf.tier === 'free' ? t('home.tierFree') : t('home.tierFull')}
        </span>
        <span className={styles.chevron} aria-hidden="true" />
      </button>

      <ul className={styles.albumGrid}>
        {shelf.albums.map((album) => (
          <li key={album.id}>
            <AlbumTile album={album} progressMap={progressMap} onOpen={onOpenAlbum} />
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * 四宫格里的一格：一本画册，点它直接进这一本的选关页。
 *
 * 进度用一条细杠而不是只写「3/28」：两个数字要读完才知道打了多少，一条杠
 * 扫一眼就有。数字仍留在杠的右边——四本并排时，「还差几关」是会被人真去数的。
 *
 * 杠和「集齐」数的都是**解开过多少幅**，与收藏架、收藏页抬头同一口径。重玩一关时
 * completed 会暂时翻回 false，但这一本里的画一幅没少：从前那一刻杠会退一格、
 * 金字掉回 27/28、荣誉章孤零零地留在一张没集齐的卡上——一次通关就该一直是通关。
 */
function AlbumTile({
  album,
  progressMap,
  onOpen,
  selected,
}: {
  album: Album
  progressMap: Record<string, PuzzleProgress>
  onOpen: (albumId: string) => void
  /** 试玩版宽屏首页：这一本此刻摊开在下面（见 DemoCollections）；正式版不传 */
  selected?: boolean
}) {
  const t = useT()
  const done = countUnlocked(album.puzzles, progressMap)
  const cleared = done === album.puzzles.length
  const title = albumTitle(album.id)
  return (
    <button
      className={styles.album}
      type="button"
      data-album-id={album.id}
      data-cleared={cleared}
      data-selected={selected || undefined}
      aria-pressed={selected === undefined ? undefined : selected}
      onClick={() => onOpen(album.id)}
    >
      <span className={styles.albumCover}>
        <Thumbnail puzzle={album.emblem} className={styles.albumArt} />
        {cleared && <AlbumAward className={styles.albumSeal} />}
      </span>
      {/*
        书名是「一格 + 一段字」两层：外面那格高度定死，一页之内所有书同高，
        底下的进度杠因此齐平；字号写在里面那段字上，由 useAlbumTitleFit 统一
        量完再发（中日韩一本一个值，拉丁全部同一个值）。

        名字里有空格时，data-multiword 关掉自动断词，理由见 .albumNameText。
      */}
      <span className={styles.albumName} data-album-name="" data-multiword={hasWrapPoint(title) || undefined}>
        <span className={styles.albumNameText}>{title}</span>
      </span>
      {/*
        试玩版一本合集只有一种棋盘（见 src/data/demo.json），书名底下写明它是几乘几：
        四本并排时「从哪本开始」就是看这一行。正式版一本里三档都有，没有这一行。
      */}
      {isDemoBuild && (
        <span className={styles.albumSize}>
          {SIZE_LABEL[album.puzzles[0].size] ?? album.puzzles[0].size}
        </span>
      )}
      <span className={styles.albumFoot}>
        {/*
          没集齐是「杠 + 数字」，集齐了整行换成一句「已集齐」。
          一条填满的杠与一条差一格的杠只差那一格，扫一眼分不出「打完了」和
          「快打完了」——而这一格恰恰只有这一件事值得说。所以到头那一下改说
          一句话，说完就不必再报数了。
        */}
        {cleared ? (
          <span className={styles.albumDone}>{t('home.albumCleared')}</span>
        ) : (
          <>
            <span className={styles.albumBar} aria-hidden="true">
              <span
                className={styles.albumBarFill}
                style={{ width: `${Math.round((done / album.puzzles.length) * 100)}%` }}
              />
            </span>
            <span className={styles.albumTally}>{`${done}/${album.puzzles.length}`}</span>
          </>
        )}
      </span>
    </button>
  )
}
