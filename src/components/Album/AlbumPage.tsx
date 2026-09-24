import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PuzzleProgress } from '../../types'
import { isDemoBuild } from '../../config/demo'
import { useT } from '../../i18n'
import { albumTitle, chapterLabel } from '../../i18n/content'
import { type Album, albumStartTarget } from '../../utils/albums'
import { initialPageIndex, isInProgress, splitOverviewPages } from '../../utils/levelSections'
import { useLayerActive } from '../../hooks/useLayerActive'
import { useSettings } from '../../hooks/settingsContext'
import { countUnlocked } from '../../utils/unlocked'
import { quietFocus } from '../../utils/quietFocus'
import { BackIcon } from '../BackIcon'
import { ChapterGrid, OverviewGrid } from './ChapterGrid'
import { useFitPuzzleNames } from './puzzleNames'
import styles from './AlbumPage.module.css'
import entryStyles from '../GameEntryBar/GameEntryBar.module.css'

interface Props {
  album: Album
  progressMap: Record<string, PuzzleProgress>
  /** 从这一关返回时用：定位到它所在的页并聚焦它 */
  returnToPuzzleId: string | null
  onSelect: (puzzleId: string) => void
  onExit: () => void
  /** 返回键回到哪儿：从首页四宫格直接翻开时是首页，从主题画册页进来时是那一页 */
  backLabel?: string
  /**
   * 重新挂上来时先翻回这一页，不按进度另挑（见 App 的 albumPage）。
   *
   * 只用挂载那一次：之后从对局返回仍走 returnToPuzzleId 那条（连点几次「下一关」
   * 打到第 2 页再退出来，册子该停在第 2 页，不是进去之前那一页）。
   */
  restorePage?: number
  /** 手上翻到第几页，报给上一层记着——这一层被卸掉时页码只剩它了 */
  onPageChange?: (albumId: string, index: number) => void
  /** 底部那一下优先落在这一关（教学关没看过时用），它已通关或不在本册时照常取最小编号 */
  preferPuzzleId?: string
}

/**
 * 只挂当前页与左右各一页的缩略图：翻页时新的一页已经画好，再远的不占内存。
 *
 * 窗口的圆心必须是 pageIndex，别再往后拖。屏幕上任何一刻至多露着相邻的两页，
 * 而 pageIndex 走的是页中线四舍五入——露着的那两页必定是它和它的一个邻居，
 * pageIndex ± 1 于是恒定盖住屏幕，而且总能提前半页把下一页备好。这个「盖得住」
 * 不是碰巧，是这两个定义之间的关系。
 *
 * 曾经把圆心挪到「停稳之后的那一页」，想省掉手势期间的挂载（见 0909d528f）。
 * 那一版凭的是 scroll-snap-stop: always 一次只翻一页——它只管得住甩出去的那一下，
 * 管不住手指按住不放一路拖：圆心在手势里一直不动，从第三页起人已经把那一页拖到
 * 眼前了，里头还是空的，非要等跨过中线才现挂，就是「下一页要闪一帧才弹出来」。
 * 而它想治的顿挫根本不在挂载，在贴齐那条硬写 scrollLeft（见 172a1cb9f）——
 * 治错了地方，还把这条恒不变式赔了进去。要再动这里，先确认新的圆心仍然盖得住
 * 屏上露着的那两页。
 */
const RENDER_RADIUS = 1


/**
 * 这一页离落位还差多少算「已经摆在眼前」：不超过一屏的两成，也就是动画走完八成。
 * 到这一步，手指底下那张卡和眼睛看到的已经是同一张，那一点就该算进关。
 */
const TAP_SETTLED_FRACTION = 0.2

/** 手指挪动超过这么多像素就是在滑，不是在点 */
const TAP_SLOP = 10


/**
 * WebKit 会把带安全区、滚动条和小数像素的滚动页算出非整数宽度。不能用
 * `index * clientWidth` 猜位置，否则误差会逐页累积；始终读取浏览器排版后的真实坐标。
 */
function pageLeft(pager: HTMLElement, index: number): number {
  const first = pager.children.item(0) as HTMLElement | null
  const target = pager.children.item(index) as HTMLElement | null
  if (!first || !target) return 0
  return target.offsetLeft - first.offsetLeft
}

function nearestPage(pager: HTMLElement): number {
  let nearest = 0
  let nearestDistance = Number.POSITIVE_INFINITY

  for (let index = 0; index < pager.children.length; index += 1) {
    const distance = Math.abs(pager.scrollLeft - pageLeft(pager, index))
    if (distance < nearestDistance) {
      nearest = index
      nearestDistance = distance
    }
  }

  return nearest
}

/**
 * 翻开一本画册：一页一屏，左右滑动翻页，底部的页码也能直接点。
 *
 * 翻页用原生 scroll-snap 而不是手写手势：滚动跟手、惯性和回弹都由合成器接管，
 * 主线程只在跨过页中线时更新一次页码。一册最多 59 关，同时挂满就是 59 张
 * 缩略图 canvas，所以只渲染当前页左右各一页，其余留空占位。
 */
export function AlbumPage({
  album,
  progressMap,
  returnToPuzzleId,
  onSelect,
  onExit,
  backLabel,
  restorePage,
  onPageChange,
  preferPuzzleId,
}: Props) {
  const t = useT()
  const { settings, set: setSetting } = useSettings()
  /*
   * 试玩版一律分章：一本只有六关、一页装得下，总览与分章的区别只剩「有没有章名」，
   * 而章名正是试玩要保留的那点结构（见 config/demo.ts）。底部的页码条与视图切换
   * 随之整条不挂——一页没有第二页可翻，也没有第二种视图可切。
   */
  const chapterMode = isDemoBuild || settings.albumView === 'chapters'
  const overviewPages = useMemo(() => splitOverviewPages(album.puzzles), [album.puzzles])
  const pages = chapterMode ? album.pages : overviewPages
  /**
   * 这一本此刻是不是摊在屏幕上的那一层。它作为「上一层」被预热时也照常渲染、
   * 照常排版，但不许碰 html/body 的类名，也不许抢焦点（见 useLayerActive）。
   */
  const active = useLayerActive()
  /**
   * 这一本该翻到哪一页：从某一关退回来就是那一关所在的页，否则按进度挑。
   *
   * 存在 ref 里而不是 useMemo：这一层现在会作为「上一层」常驻在树上（见 App 的
   * 预热层），returnToPuzzleId 会在它藏着的时候变（进对局那一下就变），
   * 换过来的时候要按**当时**的值现算一次。若还按挂载那一刻的旧值办事，
   * 连点几次「下一关」打到第 2 页再返回，册子会停在第 1 页。
   *
   * 每次渲染算一遍不心疼：一本 35 关，findIndex 到底也就几十次比较。
   */
  const openingIndex = useRef(0)
  openingIndex.current = (() => {
    const fromReturn = pages.findIndex((p) => p.puzzles.some((q) => q.id === returnToPuzzleId))
    return fromReturn >= 0 ? fromReturn : initialPageIndex(pages, progressMap)
  })()
  /*
   * 挂载那一次要还的是「手上停着的那一页」，不是按进度挑的那一页。
   *
   * iOS 左缘手势起手就真退了一页，这一层当场被卸掉；手指半路收回时它是重新
   * 挂上来的，pageIndex 早随着卸载没了。于是人明明停在第 1 页，收回手册子却
   * 翻到了第 3 页——那一下没有翻页动作，页却换了。
   *
   * 只认这一次：用掉就清空，下面那条落位从第二次起照常按 openingIndex 办事。
   */
  const restoring = useRef(restorePage)
  const [pageIndex, setPageIndex] = useState(() => restoring.current ?? openingIndex.current)
  const safePageIndex = Math.min(pageIndex, pages.length - 1)
  const page = pages[safePageIndex]
  /*
   * 抬头那个分子与下面卡片露不露图案同一判据（PageGrid 的 revealed 用的也是 isUnlocked）。
   * 用 completed 数的话，重玩一关时这一页的图案一张没变、抬头却退一格。
   */
  const unlocked = useMemo(
    () => countUnlocked(album.puzzles, progressMap),
    [album.puzzles, progressMap],
  )
  /*
   * 底部那一下的落点：这一本里编号最小的未通关关卡。
   *
   * 从前首页底部挂着一条「开始游戏」，它落在整个库的哪一关只有代码知道。
   * 挑关这件事搬到这儿来做就有了依据——一本册子摊在眼前，「接着打」指的
   * 只可能是这一本里还没打完的最靠前那关。全本通关时整条不出现：
   * 那时它无关可开，重玩得自己在上面挑一张。
   */
  const startTarget = useMemo(
    () => albumStartTarget(album, progressMap, preferPuzzleId),
    [album, progressMap, preferPuzzleId],
  )
  const startNumber = startTarget
    ? album.puzzles.findIndex((p) => p.id === startTarget.id) + 1
    : 0
  const startPage = startTarget
    ? pages.find((candidate) => candidate.puzzles.some((puzzle) => puzzle.id === startTarget.id))
    : undefined
  const startChapter = startTarget
    ? startPage?.chapters.find((chapter) =>
        chapter.puzzles.some((puzzle) => puzzle.id === startTarget.id),
      )
    : undefined
  const startChapterNumber =
    startTarget && startChapter
      ? startChapter.puzzles.findIndex((puzzle) => puzzle.id === startTarget.id) + 1
      : 0
  const startResuming = startTarget ? isInProgress(progressMap[startTarget.id]) : false
  const pageRef = useRef<HTMLDivElement>(null)
  const pagerRef = useRef<HTMLDivElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  const tickingRef = useRef(false)
  const previousAlbumViewRef = useRef(settings.albumView)

  /*
   * **自然滚动期间，JS 一个字节都不写 pager 的位置。** 位置只有一个裁决者：CSS
   * scroll-snap（mandatory + scroll-snap-stop: always），手指与惯性都归它。
   *
   * 从前这儿有一套「停稳了再贴齐」：静默 140ms / scrollend 之后按最近的一页硬写
   * scrollLeft，外加一道「手指按着不许写」的闸门（draggingRef，由 touch 事件维护）。
   * 五轮修复（172a1cb9f、15891bd41、621e2955f、5a64134af、050597700）全在加固那道
   * 闸门，抽搐却反复回来。2026-09-16 用合成时序量到了病根：**手指落在正在减速的
   * pager 上时，DOM 一个 touch 事件都收不到**——按住不动、按下再拖都没有，滚动
   * 却照样跟手（UIKit 把这一笔当成 scroll view 自己的交互吃掉了）。于是闸门在恰好
   * 需要它的那个场景里永远开着；而所有者的真机是 iPhone X（iOS 16，没有
   * scrollend），走的正是掐表那条：手指一按、动画一停、140ms 静默一到，贴齐把页硬写
   * 到目标页，下一帧被原生位置拽回——一跳一回，就是「抽搐」。
   *
   * 「有没有手指按着」这件事平台不告诉我们，所以任何依赖它的写入都不可能做对。
   * 唯一站得住的规矩是：**JS 只在程序化跳转时写位置**——点页码、切视图、换层落位、
   * resize——这些入口按定义没有手指在 pager 上。贴齐那一套连同它的闸门一并删掉；
   * 「停在两页之间」的老病根（-webkit-overflow-scrolling 让 scrollLeft 失真）已在
   * 343d7b109 拔掉，两端又都锁竖屏、画册页没有输入框、禁了缩放，snap 之外没有
   * 谁还能把 pager 挪到页中间。
   */

  /** 改 pager 横向位置只有这一个入口，且只许上面那几条程序化跳转调它。 */
  const alignPager = useCallback((index: number) => {
    const pager = pagerRef.current
    if (!pager) return
    const target = pageLeft(pager, index)
    // 差一像素以内算贴齐，不跟合成器的小数较劲
    if (Math.abs(pager.scrollLeft - target) > 1) pager.scrollLeft = target
  }, [])

  /*
   * 矮屏里每页有自己的纵向滚动；翻到谁，谁都从顶部开始。
   *
   * 跳页（点页码、切视图、换层落位）当场把目标页归零，那几路没有手指按着。
   * 手势翻页那一路不在中途写：被拖到一半的那一页竖着跳一下，玩家看得见。改在
   * pager 正落在某一页上的那一刻（scroll 事件里读到的位置与页首差不到一像素）把
   * **其余**页归零——那时它们都在屏幕外，写了也没人看见；下次翻到谁，谁都已经在
   * 顶部。这一刻不需要知道手指在不在：不在屏上的东西怎么改都不会抽。
   */
  const resetSlideTops = useCallback((shouldReset: (index: number) => boolean) => {
    const pager = pagerRef.current
    if (!pager) return
    for (let index = 0; index < pager.children.length; index += 1) {
      if (!shouldReset(index)) continue
      const slide = pager.children.item(index) as HTMLElement | null
      if (slide && slide.scrollTop !== 0) slide.scrollTop = 0
    }
  }, [])

  /** 程序化跳到某一页：贴齐位置、目标页回到顶部、页码跟上 */
  const jumpTo = useCallback((index: number) => {
    alignPager(index)
    resetSlideTops((candidate) => candidate === index)
    setPageIndex(index)
  }, [alignPager, resetSlideTops])

  /*
   * iOS 的根 WebView 也能响应横向拖动。pager 到页边时若把手势继续传给它，
   * 整个页面会停在一个横向回弹的位置；进入此页时锁住外层，只允许 pager 自己翻页。
   *
   * html/body 全文档只有一份，所以这一条只归活着的那一层。藏着的册页要是也
   * 挂上去，正在打的那一局就会被锁成 position: fixed 的根视口——棋盘还在，
   * 底下的操作条却滑不到了。
   */
  useEffect(() => {
    if (!active) return
    document.documentElement.classList.add('album-open')
    document.body.classList.add('album-open')
    document.documentElement.scrollLeft = 0
    document.body.scrollLeft = 0
    return () => {
      document.documentElement.classList.remove('album-open')
      document.body.classList.remove('album-open')
    }
  }, [active])

  /*
   * 进页面时直接落到目标页，不要让它从第 1 页滑过去。
   *
   * 依赖是 active 而不是空数组：这一层被预热时就已经挂好了，之后是「换过来」
   * 而不是「重新挂载」，靠挂载跑一次已经等不到那一刻。绝大多数时候这一下是
   * 白跑的——预热那会儿 returnToPuzzleId 已经是退出对局的那一关（见 App 的
   * popPageStep），页码早就停在对的地方，setPageIndex 传的是同一个值，
   * React 原地打住。留着它是为了另一条路：预热闸门关着、或者根本没有预热层时
   * （安卓、网页端）仍然要落到正确的一页。
   */
  useLayoutEffect(() => {
    if (!active) return
    const target = restoring.current ?? openingIndex.current
    restoring.current = undefined
    jumpTo(target)
  }, [active, jumpTo])

  // 翻到第几页就报一声，让外面替这一层记着（理由见 restoring 那一段）
  useEffect(() => {
    onPageChange?.(album.id, pageIndex)
  }, [album.id, onPageChange, pageIndex])

  // 旋转或 WebView 改变可用宽度后，仍让当前页严格贴齐视口，不遗留半列相邻页。
  useEffect(() => {
    const alignCurrentPage = () => alignPager(safePageIndex)
    window.addEventListener('resize', alignCurrentPage)
    return () => window.removeEventListener('resize', alignCurrentPage)
  }, [safePageIndex, alignPager])

  /*
   * 只有模式切换才需要在新的一组页面里重新贴齐同一页。
   *
   * 不能把横向 scrollLeft 写入放进普通 pageIndex effect：手势滑过中线时
   * handleScroll 会先更新页码，如果 effect 此刻把 pager 硬推到页首，就会与
   * WebKit 正在进行的惯性和 scroll-snap 抢位置，左右翻页会明显顿一下。
   */
  useLayoutEffect(() => {
    if (previousAlbumViewRef.current === settings.albumView) return
    previousAlbumViewRef.current = settings.albumView
    jumpTo(safePageIndex)
  }, [settings.albumView, safePageIndex, jumpTo])

  // 页码条可能横向溢出，把当前页滑进视野
  useLayoutEffect(() => {
    // 不用 scrollIntoView：它会继续滚动 .page 和根 WebView。pager 为铺满屏幕用了
    // 负外边距，外层一旦被它横滚，标题、网格和章号条会一起左偏。
    const picker = pickerRef.current
    const active = picker?.querySelector<HTMLElement>('[data-active="true"]')
    const first = picker?.firstElementChild as HTMLElement | null
    if (!picker || !active || !first) return

    const activeLeft = active.offsetLeft - first.offsetLeft
    const centeredLeft = activeLeft - (picker.clientWidth - active.offsetWidth) / 2
    const maxLeft = Math.max(0, picker.scrollWidth - picker.clientWidth)
    picker.scrollLeft = Math.max(0, Math.min(centeredLeft, maxLeft))

    // 兼容已经被旧版本 scrollIntoView 推偏的当前页面；后续只滚动 picker，不会再触发它。
    pageRef.current!.scrollLeft = 0
  }, [pages, safePageIndex])

  /*
   * 卡片上的名字收进一格（见 ./puzzleNames 的 useFitPuzzleNames）。一次量完整个
   * pager（当前页与相邻两页都在里面）；手势跨过页中线时这一趟也会跑（新挂上来的
   * 那一页要量），换页、解锁一关（「第 12 关」换成真名字）都要重量。
   * 它不写 pager 的位置，与上面那条规矩不冲突。
   */
  useFitPuzzleNames(pagerRef, [pages, safePageIndex, progressMap])

  /*
   * 从某一关退回来时把焦点放回那张卡：这一下是替读屏和键盘补的，不画描边（见 quietFocus）。
   *
   * 两道限制缺一不可。一是**只归活着的那一层**：焦点全文档只有一个，藏着的
   * 册页把它抢走，正在打的那一局就没人接键盘了（那一层还挂着 inert，focus()
   * 落上去本就什么都不会发生，等于焦点凭空丢掉）。二是**只在自己这棵树里找**：
   * 上一层与本页同时挂在文档里，首页收藏架用的也是 data-puzzle-id，
   * 按全文档查第一个命中的很可能是另一层里的格子。
   */
  useEffect(() => {
    if (!active) return
    const root = pageRef.current
    const card =
      root && returnToPuzzleId
        ? root.querySelector<HTMLElement>(`[data-puzzle-id="${returnToPuzzleId}"]`)
        : null
    if (!card) return
    return quietFocus(card)
  }, [active, returnToPuzzleId])

  /*
   * 滚动事件每帧都来，但只有跨过页中线时才 setState，翻页途中不会重复渲染。
   * 这一路只读位置，不写：位置归 scroll-snap（见 alignPager 上面那段）。
   */
  const handleScroll = useCallback(() => {
    if (tickingRef.current) return
    tickingRef.current = true
    requestAnimationFrame(() => {
      tickingRef.current = false
      const pager = pagerRef.current
      if (!pager) return
      const next = nearestPage(pager)
      setPageIndex((current) => (next === current ? current : next))
      // 正落在某一页上：其余页都在屏幕外，趁这会儿归零（见 resetSlideTops）
      if (Math.abs(pager.scrollLeft - pageLeft(pager, next)) <= 1) {
        resetSlideTops((index) => index !== next)
      }
    })
  }, [resetSlideTops])

  /*
   * 翻页刚落定的那一下点不进关卡，第一次点击总是白点。
   *
   * iOS 的滚动视图在减速期间会把第一次轻点当刹车吞掉，只发 touch 不补 click；
   * 翻页的 snap 动画正在减速，于是「滑过来马上点」必定失效一次。click 给不给
   * 由浏览器说了算，等不来；touch 那一路是必到的，就自己认这一下。
   *
   * 但不是任何时候都认：真在快滑途中按下去，那一下就该是刹车——此刻手指底下是
   * 哪一关全看惯性停在哪儿，替玩家做主必错。只有当前这一页已经就位八成以上，
   * 眼睛看到的和手指按到的才是同一张卡，那一点才算进关。
   *
   * 这里的 touch 事件只用来判「点」，不用来判「手指在不在 pager 上」——后者
   * 平台不保证给（见 alignPager 上面那段），拿它当闸门就是从前那五轮的病根。
   */
  const tapRef = useRef<{ x: number; y: number; card: HTMLElement | null; settled: boolean } | null>(
    null,
  )

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const pager = pagerRef.current
    const touch = event.touches[0]
    if (!pager || !touch || event.touches.length > 1) {
      tapRef.current = null
      return
    }
    const target = pageLeft(pager, nearestPage(pager))
    tapRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      card: (event.target as HTMLElement).closest<HTMLElement>('[data-puzzle-id]'),
      settled: Math.abs(pager.scrollLeft - target) <= pager.clientWidth * TAP_SETTLED_FRACTION,
    }
  }

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const tap = tapRef.current
    tapRef.current = null
    const touch = event.changedTouches[0]
    if (!tap?.card || !touch) return
    if (Math.abs(touch.clientX - tap.x) > TAP_SLOP) return
    if (Math.abs(touch.clientY - tap.y) > TAP_SLOP) return

    // 这一下已经由我们判过了，别再让浏览器补一个 click 出来点第二次
    event.preventDefault()
    // 没就位的那一点只当刹车：位置由 scroll-snap 兜底，不替玩家挑关
    if (tap.settled) onSelect(tap.card.dataset.puzzleId!)
  }

  const toggleAlbumView = () => {
    const nextMode = chapterMode ? 'overview' : 'chapters'
    const nextPages = nextMode === 'chapters' ? album.pages : overviewPages
    // 页码属于布局；用当前视野最上方的关卡追踪内容，避免同页号指向另一批关卡。
    const slide = pagerRef.current?.children.item(safePageIndex) as HTMLElement | null
    const bounds = slide?.getBoundingClientRect()
    const visibleCard = bounds && Array.from(
      slide!.querySelectorAll<HTMLElement>('[data-puzzle-id]'),
    ).find((card) => {
      const rect = card.getBoundingClientRect()
      return rect.bottom > bounds.top && rect.top < bounds.bottom
    })
    const anchorId = visibleCard?.dataset.puzzleId ?? page.puzzles[0]?.id
    const targetIndex = nextPages.findIndex((candidate) =>
      candidate.puzzles.some((puzzle) => puzzle.id === anchorId),
    )
    setPageIndex(Math.max(0, targetIndex))
    setSetting('albumView', nextMode)
  }

  return (
    <div className={styles.page} ref={pageRef} data-demo={isDemoBuild || undefined}>
      <header className={styles.header}>
        <button
          className={styles.back}
          type="button"
          onClick={onExit}
          aria-label={backLabel ?? t('library.backLibrary')}
        >
          <BackIcon />
        </button>
        {/* 书名只出一行当前语言；双语那一套只留给关卡名（见 i18n/content） */}
        <h1 className={styles.title}>{albumTitle(album.id)}</h1>
        <span
          className={styles.count}
          aria-label={t('album.unlockedTally', { done: unlocked, total: album.puzzles.length })}
        >
          <span
            className={styles.countFill}
            style={{ width: `${(unlocked / album.puzzles.length) * 100}%` }}
            aria-hidden="true"
          />
          <span className={styles.countText} aria-hidden="true">
            <b>{unlocked}</b> / {album.puzzles.length}
          </span>
        </span>
      </header>

      <div
        className={styles.pager}
        data-pager=""
        ref={pagerRef}
        onScroll={handleScroll}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={() => {
          tapRef.current = null
        }}
      >
        {pages.map((p) => (
          <div className={styles.slide} key={p.index} data-album-page={p.index}>
            {Math.abs(p.index - safePageIndex) <= RENDER_RADIUS && (
              chapterMode ? (
                <ChapterGrid page={p} progressMap={progressMap} onSelect={onSelect} />
              ) : (
                <OverviewGrid page={p} progressMap={progressMap} onSelect={onSelect} />
              )
            )}
          </div>
        ))}
      </div>

      <div className={styles.controls} data-compact={pages.length > 4}>
        {!isDemoBuild && (
        <footer className={styles.footer}>
          <div className={styles.picker} ref={pickerRef} role="group" aria-label={t('album.pager')}>
            {pages.map((p) => {
              const doneInPage = p.puzzles.filter((q) => progressMap[q.id]?.completed).length
              const state =
                doneInPage === p.puzzles.length ? 'done' : doneInPage > 0 ? 'partial' : 'fresh'
              return (
                <button
                  key={p.index}
                  className={styles.chip}
                  type="button"
                  data-active={p.index === page.index}
                  data-state={state}
                  aria-pressed={p.index === page.index}
                  aria-label={t('album.pageAria', { page: p.index + 1 })}
                  onClick={() => jumpTo(p.index)}
                >
                  {p.index + 1}
                </button>
              )
            })}
          </div>
          <button
            className={styles.viewToggle}
            type="button"
            data-target-view={chapterMode ? 'overview' : 'chapters'}
            aria-label={chapterMode ? t('album.toOverview') : t('album.toChapters')}
            title={chapterMode ? t('album.toOverview') : t('album.toChapters')}
            onClick={toggleAlbumView}
          >
            <ViewIcon mode={chapterMode ? 'overview' : 'chapters'} />
          </button>
        </footer>
        )}

        {startTarget && (
          <button className={entryStyles.bar} type="button" onClick={() => onSelect(startTarget.id)}>
            <span className={entryStyles.text}>
              <span className={entryStyles.action}>
                {startResuming ? t('album.resume') : t('album.start')}
              </span>
              <span className={entryStyles.detail}>
                {/*
                 * 章名按 startChapter 自带的三段稳定键现解析（见 utils/chapters 的
                 * ChapterRef）：分章模式下报章内关号，总览模式没有章，报册内关号。
                 */}
                {startChapter
                  ? `${chapterLabel(startChapter.ref, t.locale)} · ${t('album.startMeta', { number: startChapterNumber })}`
                  : t('album.startMeta', { number: startNumber })}
              </span>
            </span>
            <span className={entryStyles.play} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  )
}

function ViewIcon({ mode }: { mode: 'chapters' | 'overview' }) {
  if (mode === 'overview') {
    return (
      <svg className={styles.viewIcon} viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    )
  }
  return (
    <svg className={styles.viewIcon} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 3h10M3 14h10" />
      <rect x="3" y="6" width="5" height="4" rx="1" stroke="none" />
      <rect x="10" y="6" width="5" height="4" rx="1" stroke="none" />
      <rect x="17" y="6" width="4" height="4" rx="1" stroke="none" />
      <rect x="3" y="17" width="5" height="4" rx="1" stroke="none" />
      <rect x="10" y="17" width="5" height="4" rx="1" stroke="none" />
    </svg>
  )
}
