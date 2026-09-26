import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { App as CapApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import {
  ensureAlbumLoaded,
  ensureLevelLoaded,
  getLoadedPuzzle,
  getPuzzleById,
  isAlbumLoaded,
  isPuzzleLoaded,
  levelIds,
  usePuzzleLibrary,
} from './data'
import { usePuzzleProgress } from './hooks/usePuzzleProgress'
import {
  backHandlerCount,
  hasBackHandler,
  runTopBackHandler,
  subscribeBackHandlers,
} from './hooks/useBackHandler'
import { useBrowserHistory } from './hooks/useBrowserHistory'
import type { NavSnapshot } from './hooks/useBrowserHistory'
import { useStatusBarStyle } from './hooks/useStatusBarStyle'
import { LayerActiveProvider } from './hooks/useLayerActive'
import { LevelSelect } from './components/LevelSelect/LevelSelect'
import { AlbumPage } from './components/Album/AlbumPage'
import { CollectionPage } from './components/Collection/CollectionPage'
import { PuzzleDetailPage } from './components/PuzzleDetail/PuzzleDetailPage'
import { LibraryPage } from './components/Library/LibraryPage'
import { Game } from './components/Game/Game'
import { UpdateModal } from './components/UpdateModal/UpdateModal'
import { ResourceRetryNotices } from './components/RetryNotice/RetryNotice'
import type { PuzzleLoadFailure } from './components/RetryNotice/RetryNotice'
import { DailyCalendar } from './components/DailyCalendar/DailyCalendar'
import { FullGameSheet } from './components/FullGame/FullGameSheet'
import { isFullGameAlbum, isFullGameDaily, isFullGameLevel } from './billing/content'
import { isDemoBuild } from './config/demo'
import { fullGameEntitled, initFullGameBilling } from './billing/entitlement'
import { getOrCreateGuestId } from './auth/guest'
import { currentBuildInstalledAt, primeDevBuild } from './utils/devBuild'
import { useT } from './i18n'
import { albumTitle, chapterLabel } from './i18n/content'
import { installUiHaptics } from './utils/uiHaptics'
import { checkForUpdate } from './utils/updateCheck'
import { installSoundPrimer, resumeSoundContext } from './utils/sound'
import { noteAppLaunch } from './utils/storeReview'
import type { UpdateInfo } from './utils/updateCheck'
import {
  dailyEnabled,
  fetchDailyByDate,
  fetchDailyIndex,
  fetchTodayDaily,
  getCachedDaily,
  nextDailyCursor,
  prefetchDailyPuzzles,
  purgeStaleDailyCache,
  releasedDailyDates,
  shanghaiToday,
} from './utils/daily'
import { dailyProgressKey } from './types/daily'

import type { DailyIndex, DailyPuzzleFile } from './types/daily'
import { deriveClues } from './utils/clues'
import {
  albumChapterOfPuzzle,
  completesAlbumOnFirstClear,
  albumOfPuzzle,
  albumOrder,
  buildAlbums,
  nextInAlbum,
} from './utils/albums'
import { resumeTarget } from './utils/levelSections'
import { sameRenderedProgress } from './utils/renderedProgress'
import { countUnlocked, isUnlocked, unlockedByRecency } from './utils/unlocked'
import { JourneyDialog } from './components/Tutorial/JourneyDialog'
import { hasPlayedSize, needsFirstLesson } from './utils/journey'
import { TUTORIAL_LEVEL_ID, TUTORIAL2_LEVEL_ID } from './components/Tutorial/coachScript'
import { loadProgressByKey, loadTutorialSeen, saveProgressByKey, saveTutorialSeen, saveTutorial2Seen } from './utils/storage'
import { primeTelemetry, track, trackLaunchOncePerDay } from './metrics/telemetry'
import {
  IOS_EDGE_BACK_BEGIN_EVENT,
  IOS_EDGE_BACK_CANCEL_EVENT,
  IOS_EDGE_BACK_COMMIT_EVENT,
  type EdgeBackMarks,
  edgeBackPrepaintedOf,
  edgeBackTokenOf,
  nativeBackAnimationAvailable,
  reportEdgeBackActivated,
  reportEdgeBackMode,
  reportEdgeBackPageReady,
  reportEdgeBackPrepared,
  reportEdgeBackRestored,
  runNativeBackAnimation,
} from './utils/nativeNavigation'
import { setAndroidBackHandled } from './utils/nativeBackHandler'
import { runBackTransition } from './utils/viewTransition'
import type { Album } from './utils/albums'
import { sameChapter } from './utils/chapters'
import type { Puzzle, PuzzleProgress } from './types'

/**
 * 当前摊在屏幕上的那一层。
 *
 * 层级从前有两份真相：render 那一串 if 一份，返回键的 popPageStep 又手写一份。
 * 两份的顺序并不相同（画册页在 render 里排在主题画册页前面，pop 里却排在后面），
 * 而 render 里那些「内容还没到就落到下一层」的条件更是只有 render 知道——于是
 * 存在这样的窗口：屏幕上明明是册页，返回键退掉的却是一层看不见的对局，画面
 * 纹丝不动。
 *
 * 现在只留一份：这里算出当前层，render 按它出页面，返回按它退一步。带内容的
 * 那几层顺便把找好的册与画捎上，render 不必再找第二遍，也就不可能找出别的结果。
 */
type Layer =
  | { kind: 'daily-game'; daily: DailyPuzzleFile; puzzle: Puzzle }
  | { kind: 'daily-calendar' }
  | { kind: 'game'; puzzle: Puzzle }
  | { kind: 'album'; album: Album }
  | { kind: 'library' }
  | { kind: 'detail'; puzzle: Puzzle; album: Album }
  | { kind: 'collection' }
  | { kind: 'home' }

/**
 * 层级的全部原料：一串互斥的显式状态。
 *
 * 「往回退一步」就是把其中一个放回去（见 popPageStep），所以**上一层不需要第二套
 * 判断**——把退过一步的这份快照喂给同一个 resolveLayer，出来的就是它。层级判断
 * 仍然只有一份，这是这次改动最要紧的一条：多一套 switch，迟早会与这一套走岔。
 */
interface NavState {
  dailyActive: boolean
  dailyView: boolean
  currentId: string | null
  openAlbumId: string | null
  libraryView: boolean
  detailPuzzleId: string | null
  collectionView: boolean
  /**
   * 上一次退出对局的那一关。它**不参与** resolveLayer——层级判断看不见它——
   * 但册页要按它翻到哪一页、把焦点放回哪张卡。
   *
   * 放进这份状态是为了让预热的上一层也拿得到它：退一步之后它会变成什么，
   * 与 pop 写在同一行（见 popPageStep 的 game 一支）。少了这一条，预热的册页
   * 会停在「上上次退出的那一关」所在的页，揭开的那一刻才现翻——那一下翻页
   * 正是预热要省掉的开销。
   */
  lastSelectedId: string | null
}

/** 层级判断还要看的、与「退到哪一层」无关的那几样。 */
interface LayerContext {
  albums: Album[]
  daily: DailyPuzzleFile | null
  dailyPuzzle: Puzzle | null
  dailyFeatureEnabled: boolean
}

/**
 * 唯一的那份层级判断。顺序即优先级，render 与返回键都只认它。
 *
 * 「内容还没到」的几处一律往下落，与从前 render 的行为一致：块还在路上时界面
 * 停在原来那一层（本地读块以毫秒计），而不是先摆一张空盘。关键在于返回键现在
 * 看到的也是这一份，不会再去退一层屏幕上并不存在的页。
 *
 * 提到模块级是为了让它能被喂第二份状态（退过一步的那份）。getLoadedPuzzle /
 * getPuzzleById 读的是模块里那张表，不进参数——调用处靠 albums 换新数组来触发
 * 重算（见 layerContext），那正是「这一册的画到了」的那一刻。
 */
function resolveLayer(nav: NavState, ctx: LayerContext): Layer {
  const { albums, daily, dailyPuzzle, dailyFeatureEnabled } = ctx
  if (nav.dailyActive && daily && dailyPuzzle) {
    return { kind: 'daily-game', daily, puzzle: dailyPuzzle }
  }
  if (nav.dailyView && dailyFeatureEnabled) return { kind: 'daily-calendar' }
  // 开局要的是真关卡：拿不到画就不算这一层（selectPuzzle 保证只有到手的才设 currentId）
  const puzzle = nav.currentId ? getLoadedPuzzle(nav.currentId) : undefined
  if (puzzle) return { kind: 'game', puzzle }
  const openedAlbum = albums.find((album) => album.id === nav.openAlbumId)
  if (openedAlbum) return { kind: 'album', album: openedAlbum }
  if (nav.libraryView) return { kind: 'library' }
  if (nav.detailPuzzleId) {
    const detailPuzzle = getPuzzleById(nav.detailPuzzleId)
    const detailAlbum = albumOfPuzzle(albums, nav.detailPuzzleId)
    // 找不到画或找不到册（脏存档、内容改名）就不算这一层，免得返回键去退一层空页
    if (detailPuzzle && detailAlbum) {
      return { kind: 'detail', puzzle: detailPuzzle, album: detailAlbum }
    }
  }
  if (nav.collectionView) return { kind: 'collection' }
  return { kind: 'home' }
}

/**
 * 退一层之后的那份状态。层级判断只有一份，「退一步」也只有这一份。
 *
 * 从 popPageStep 里提出来，是因为浏览器历史也要问同一个问题：一步跨进两层深的
 * 入口（首页直接开教学关）要把跳过的那一层补成历史条目，靠的就是它
 * （见 hooks/useBrowserHistory 的 popSnapshot）。写成两份，迟早走岔。
 *
 * 每一支只把一个值放回去——层级本来就是一串互斥的显式状态，这正是它的逆。
 * game 那支多带一个 lastSelectedId：退到的那一册要按它翻到正确的一页（见 NavState）。
 */
function popNav(layer: Layer, nav: NavState): NavState | null {
  switch (layer.kind) {
    case 'daily-game':
      return { ...nav, dailyActive: false }
    case 'daily-calendar':
      return { ...nav, dailyView: false }
    case 'game':
      return { ...nav, currentId: null, lastSelectedId: layer.puzzle.id }
    case 'album':
      return { ...nav, openAlbumId: null }
    case 'library':
      return { ...nav, libraryView: false }
    case 'detail':
      return { ...nav, detailPuzzleId: null }
    case 'collection':
      return { ...nav, collectionView: false }
    case 'home':
      return null
  }
}

/**
 * 一层的身份。同一层的两次渲染算同一个，换了册、换了画就是另一个。
 *
 * 只有一处用它：判断预热的那一层还是不是当前该预热的那一层（换人了就要把
 * 「已经画好了」的凭据从原生手上撤回来）。
 */
function layerKey(layer: Layer | null): string {
  if (!layer) return ''
  switch (layer.kind) {
    case 'album':
      return `album:${layer.album.id}`
    case 'detail':
      return `detail:${layer.puzzle.id}`
    case 'game':
      return `game:${layer.puzzle.id}`
    case 'daily-game':
      return `daily-game:${layer.daily.date}`
    default:
      return layer.kind
  }
}

/**
 * 一层页面渲染时要的、与「它是哪一层」无关的那几样。
 *
 * 当前层与预热的上一层用的是同一个 renderLayer（两套渲染迟早走岔），
 * 差别全部收在这里：谁是活的那一层，各自看哪一份进度表。
 */
interface LayerEnv {
  /** 见 hooks/useLayerActive：藏着的那一层不碰 document、不抢焦点、不挂浮层。 */
  active: boolean
  progressMap: Record<string, PuzzleProgress>
  lastSelectedId: string | null
}

/**
 * 退过一页之后，多久才把新的上一层挂上去。
 *
 * 挂一层新页要跑它全部的 effect——退回首页那一下还要把 602 关摊平排一遍序、
 * 画三十张缩略图。这一笔绝不能挤进返回的那一帧（那正是要省掉的），也不该
 * 压着原生的收尾动画跑。原生那段是 0.28s（SceneDelegate 的 settleDuration），
 * 等它走完再动手。
 *
 * 这不是拿延时去盖住空白——空白由预热层本身消掉；这只是在挑一个「什么时候
 * 做后台准备工作」的时机，早一点晚一点都不影响任何一次返回的正确性。
 */
const PREWARM_RESUME_MS = 360

/**
 * 翻页前等册块的上限（见 whenAlbumsLoaded）。
 *
 * 原生上全库开机就取齐了，这个上限从来碰不到；它是给网页端弱网的：一册迟迟不来，
 * 到点照样翻页，那一页先按占位站起来，而不是一下点下去半秒没有任何反应。
 */
const COLLECTION_OPEN_WAIT_MS = 500

/**
 * 「这一层把屏幕交出去了」。样式在 global.css，取名在这里，因为只有这一处会挂它。
 *
 * 挂它、摘它都绕开 React：整条链路上唯一不能等 React 的就是起手那一帧。走 state
 * 就得多一次渲染、多一次 diff，而这一帧要的恰恰是「什么都不改，只改一处合成器
 * 属性」。React 那边也不会跟它打架——className 由 props 定，props 没变 React 就
 * 不会去写这个节点的 class；节点自己退场时，这个 class 跟着一起没。
 */
const YIELDED_CLASS = 'nav-layer-yielded'

/**
 * 左缘手势落地时那一次退页：同步提交，并且在同一拍里把根滚动归零。
 *
 * 揭开时看到的是垫底那层的**顶端**（它是 fixed inset:0）。它翻回文档流的那一刻，
 * 文档要是还停在刚退掉那一页的滚动位置，同一份内容会整体上移——那是看得见的一跳。
 * 绝大多数时候本来就是 0（画册与日历锁根滚动，主题画册页自己拿着滚动，详情页
 * 不满一屏），所以这一句几乎不执行，只是把「几乎」变成「一定」。
 *
 * 同步是为了让这两件事落在同一次提交里：中间隔一次绘制，那一跳就真的出现在屏幕上。
 */
function popForEdgeBack(pop: () => void): void {
  flushSync(pop)
  const scroller = document.scrollingElement
  if (scroller && scroller.scrollTop !== 0) scroller.scrollTop = 0
}

/** 当前层往回退一步：`pop` 是这一步，`undo` 是它的逆，`previous` 是退完之后的状态。 */
interface PageStep {
  pop: () => void
  undo: () => void
  /**
   * 退过这一步之后的那份 NavState。
   *
   * 与紧挨着的 `pop` 写在同一个 case 里，不是另起一处推导——两行贴着，就不可能
   * 各说各话。喂给 resolveLayer 得到的就是「上一层」，预热层拿它挂页面。
   */
  previous: NavState
}

export default function App() {
  const t = useT()
  // 系统栏样式跟应用主题走（不是跟系统外观走），「跟随系统」下还会随系统实时翻。
  // 早年这里注的是「App 无深色主题、图标固定为深色」，那是深色主题落地之前的事了。
  useStatusBarStyle()

  const dailyFeatureEnabled = useMemo(() => dailyEnabled(), [])
  /*
   * 关卡库是分块加载的（见 src/data/index.ts）：开机拿到的是一份目录加十六张封面，
   * 每册的画等翻到那一册才来。这个订阅让「画到了」这件事驱动一次重画——
   * 缩略图从占位换成画，就发生在这一下。
   */
  const puzzles = usePuzzleLibrary()
  // 画册目录是首页书架、书页、解锁库与「下一关」共同的骨架，一次算好往下传
  const albums = useMemo(() => buildAlbums(puzzles), [puzzles])
  // 展示顺序＝书架从上到下、册内从易到难；「继续」按这条线找落点
  const ordered = useMemo(() => albumOrder(albums), [albums])
  const { progressMap, save, markCompleted } = usePuzzleProgress(levelIds)
  const [lessonOffer, setLessonOffer] = useState<string | null>(null)
  const [lessonReturnId, setLessonReturnId] = useState<string | null>(null)
  const [lessonRequested, setLessonRequested] = useState(false)
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [openAlbumId, setOpenAlbumId] = useState<string | null>(null)
  /** 首页四个主题的横向位置；从画册返回时仍停在打开它的那一题。 */
  const [homeGroup, setHomeGroup] = useState<string | null>(null)
  /**
   * 摊开的那一本此刻翻在第几页。
   *
   * 页码本来归册页自己管，但左缘手势的**老路**（原生没压着位移、垫的是一层纯色）
   * 起手就真退了一页（见 popPageStep），那一层当场被卸掉；手指半路收回时是重新
   * 挂一个上来，页码随卸载一起没了，只能按进度重挑一页——人明明停在第 1 页，
   * 收回手却翻到了第 3 页。所以把它记在这一层外面，挂回来时还给它。
   *
   * 快路（有预热层可揭的那一路，绝大多数手势走的是它）整笔都不退页，这一份
   * 用不上：那条路上这一层从头到尾没动过。
   *
   * 用 ref 不用 state：它只在册页挂载那一刻被读一次，不参与任何渲染判断，
   * 翻一页不该惊动 App 重画一遍（对局中这一层还兼着预热的上一层）。
   */
  const albumPage = useRef<number | undefined>(undefined)
  const rememberAlbumPage = useCallback((_albumId: string, index: number) => {
    albumPage.current = index
  }, [])
  /**
   * 主题画册页滚到哪儿了。与上面那份页码同一件事、同一个理由，也同样只管老路：
   * 那条路上起手就真退了一页，这一层当场被卸掉，收回手时是重新挂一个上来。
   *
   * 平常的滚动位置不靠它——那一页自己拿着一个滚动容器（见 LibraryPage 的
   * scrollerRef），只要节点还在，位置就在。这一份只补「节点没了」那一种情况。
   */
  const libraryScroll = useRef<number | undefined>(undefined)
  const rememberLibraryScroll = useCallback((top: number) => {
    libraryScroll.current = top
  }, [])
  const [libraryView, setLibraryView] = useState(false)
  const [libraryGroup, setLibraryGroup] = useState<string | null>(null)
  const [collectionView, setCollectionView] = useState(false)
  /** 摊开在看的那一幅藏品；它压在解锁库上面，是一层正经的页，不是浮层 */
  const [detailPuzzleId, setDetailPuzzleId] = useState<string | null>(null)
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null)
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [dailyIndex, setDailyIndex] = useState<DailyIndex | null>(null)
  const [daily, setDaily] = useState<DailyPuzzleFile | null>(null)
  const [dailyView, setDailyView] = useState(false)
  const [selectedDailyDate, setSelectedDailyDate] = useState(shanghaiToday)
  const [dailyProgress, setDailyProgress] = useState<PuzzleProgress | null>(null)
  const [dailyActive, setDailyActive] = useState(false)
  const [dailyLoading, setDailyLoading] = useState(false)
  const [dailySyncing, setDailySyncing] = useState(dailyFeatureEnabled)
  const [dailyError, setDailyError] = useState<string | null>(null)
  /**
   * 完整版的购买面板开着没有。
   *
   * 它是**浮层，不是一层页**：不进 resolveLayer 那串互斥状态，也不进浏览器历史。
   * 理由是它不改变「人现在在看哪一页」——关掉之后仍然站在原地那本书架前。
   * 返回键由面板自己的 useBackHandler 接住（与二次确认面板同一套）。
   */
  const [paywall, setPaywall] = useState(false)

  /*
   * 全站可点击元素的触感，一处委托覆盖全部（见 utils/uiHaptics）。
   * 单独一个 effect：它必须只装一次，不能跟着上面那个 effect 的依赖反复重装。
   */
  useEffect(() => installUiHaptics(), [])

  /*
   * 这里从前有三段按需取册的 effect（兜底加载、收藏架那几册、收藏页的闲时预取）。
   * 全库现在在挂树之前取齐（见 data/libraryBoot），页面挂上之后不再有册落地，
   * 三段一起删掉：它们每落一册都让整棵树重画一遍，正是左缘返回露旧页的来路。
   */

  // 冷启动：确立本地游客身份（零网络）→ 打点日活 → 查版本清单 → 拉每日挑战
  useEffect(() => {
    getOrCreateGuestId()
    // 每一份新构建第一次启动就落下时间；设置页只负责展示，不能等用户打开设置才计时。
    currentBuildInstalledAt()
    // 是不是 DEV 包也走一次桥问清楚，开发菜单据此决定挂不挂（见 utils/devBuild）
    void primeDevBuild()
    // 版本号先走一次桥并缓存，免得第一次通关时才付这笔往返
    primeTelemetry()
    trackLaunchOncePerDay()
    // 第几次打开游戏决定商店邀评走哪条规则（见 utils/storeReview）
    noteAppLaunch()
    /*
     * 接上 Google Play，问一遍「完整版买过没有」。
     *
     * 放在开机这一批里而不是等玩家撞上付费墙：重装或换机的人一打开 App，
     * 他买过的东西就该已经是开着的——让他先看见一屏锁、再自己去点「恢复购买」，
     * 那是把我们这边的一次查询变成他的一道手续。直装渠道这一句直接返回
     * （见 billing/entitlement 的不变量 2）。
     */
    initFullGameBilling()
    void checkForUpdate().then((info) => {
      setUpdateInfo(info)
      if (info) void track('update_prompt')
    })
    if (dailyFeatureEnabled) {
      // 排期调整过的旧缓存必须先清掉，否则下面拉到的新数据会与它并存
      purgeStaleDailyCache()
      void Promise.all([fetchDailyIndex(), fetchTodayDaily()]).then(([index, todayFile]) => {
        setDailyIndex(index)
        if (todayFile) setDaily(todayFile)
        const today = shanghaiToday()
        const dates = releasedDailyDates(
          index?.dates ?? (todayFile ? [todayFile.date] : []),
          today,
        )
        if (dates.length > 0) {
          const initialDate = dates.includes(today) ? today : dates.at(-1)!
          setSelectedDailyDate(initialDate)
          setDailyProgress(loadProgressByKey(dailyProgressKey(initialDate)))
        }
        // 后台静默把全部已发布关卡下载到本地；稳态下只有新增一两期要补拉，不阻塞启动。
        void prefetchDailyPuzzles(dates)
      }).finally(() => setDailySyncing(false))
    }
  }, [dailyFeatureEnabled])

  useEffect(() => {
    /*
     * iOS 第一次 new AudioContext() 会占住输入热路径一小段时间。把这笔成本放到
     * App 的第一次真实交互（通常是翻开画册/进入每日挑战），不要等玩家落第一格
     * 才创建。监听器在任一交互命中后会把另外两种事件也一并卸掉。
     */
    const removeSoundPrimer = installSoundPrimer(document)
    const resumeWhenVisible = () => {
      if (document.visibilityState === 'visible') resumeSoundContext()
    }
    document.addEventListener('visibilitychange', resumeWhenVisible)
    const subscription = CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) resumeSoundContext()
    })
    return () => {
      removeSoundPrimer()
      document.removeEventListener('visibilitychange', resumeWhenVisible)
      void subscription.then((listener) => listener.remove())
    }
  }, [])

  const dailyPuzzle: Puzzle | null = useMemo(
    () => (daily ? { ...daily.puzzle, clues: deriveClues(daily.puzzle.solution) } : null),
    [daily],
  )

  const dailyDates = useMemo(
    () =>
      releasedDailyDates(
        dailyIndex?.dates ?? (daily ? [daily.date] : []),
        shanghaiToday(),
      ),
    [dailyIndex, daily],
  )
  const dailyProgressByDate = useMemo(
    () =>
      Object.fromEntries(
        dailyDates.map((date) => [
          date,
          date === selectedDailyDate && dailyProgress
            ? dailyProgress
            : loadProgressByKey(dailyProgressKey(date)) ?? undefined,
        ]),
      ),
    [dailyDates, selectedDailyDate, dailyProgress],
  )
  // 日历要拿任意一天的关卡数据来拼当月那张画；已发布的期次冷启动时都预取过了
  const dailyPuzzleByDate = useCallback(
    (date: string) => (daily?.date === date ? daily : getCachedDaily(date))?.puzzle,
    [daily],
  )
  const selectedDailyPuzzle = useMemo(
    () => (daily?.date === selectedDailyDate ? daily : getCachedDaily(selectedDailyDate))?.puzzle,
    [daily, selectedDailyDate],
  )

  /*
   * 在途的那一笔「进入关卡」。
   *
   * 开一局之前必须先拿到这一关的画：占位关卡的 solution 是空的，拿它开局就是
   * 一张空盘。已经在手上的册（多数情况：人是从册页点进来的）当场就进，一帧都
   * 不等；没在手上才等那一块，本地读块通常是几毫秒。
   *
   * 等块的这几毫秒是一段**看不见的在途状态**：currentId 还没设，屏幕上仍是册页，
   * 而玩家随时可能在这时按返回。所以每发起一笔就领一个号，块到了先验号——号
   * 变了（返回过、或又点了别的关）就当没点过。少这一道，返回之后那个旧 Promise
   * 照样会 setCurrentId，把人从册页硬拽进关卡。
   */
  const selectGeneration = useRef(0)
  const [pendingPuzzleId, setPendingPuzzleId] = useState<string | null>(null)

  /**
   * 上一次点开一关时那一册没拉回来。
   *
   * 有它，底部才会出一条「这一关没能加载 / 重试」（见 components/RetryNotice）。
   * 从前这一路是没有失败分支的：块拉不到，`.then()` 永不兑现，pendingPuzzleId
   * 就一直挂着那一关——于是同一关再点会被开头那句去重挡回去，屏幕上什么都没有
   * 发生，也没有任何东西告诉人发生了什么。
   */
  const [puzzleFailure, setPuzzleFailure] = useState<PuzzleLoadFailure | null>(null)

  /**
   * 进关的同时要一并落下的那一步导航（首页直接开教学：册页得垫在对局下面）。
   *
   * 它必须与 setCurrentId **同一批**提交。从前 beginLesson 先把 openAlbumId 设出去、
   * 再去等这一关的块——块在路上的那几毫秒里 currentId 还是空的，层级判断就落在
   * 册页上，屏幕先闪一帧画册再翻到教学。按关卡 id 记着，重试那一笔照样认得它。
   */
  const landing = useRef<{ puzzleId: string; run: () => void } | null>(null)

  /** 作废在途的这一笔进入。返回时调；之后旧 Promise 的回调只会被丢掉。 */
  const cancelPendingPuzzle = useCallback(() => {
    selectGeneration.current += 1
    setPendingPuzzleId(null)
    // 人已经走开了，那一条提示跟着这一笔一起作废，垫底那一步也一样
    setPuzzleFailure(null)
    landing.current = null
  }, [])

  const selectPuzzle = useCallback(
    (puzzleId: string, prepare?: () => void) => {
      if (prepare) landing.current = { puzzleId, run: prepare }
      else if (landing.current?.puzzleId !== puzzleId) landing.current = null
      // 同一关连点两下就是同一笔，别再发一次号，也别再挂一个回调
      if (pendingPuzzleId === puzzleId) return
      // 领号的同时作废上一笔：连点两张不同的卡只算最后那一张
      selectGeneration.current += 1
      const generation = selectGeneration.current
      /*
       * 点的还是失败的那一关，这一下就是「重试」：提示留着，只把它标成正在重试。
       * 点的是别的关，上一条提示不再说明任何事，收掉。
       */
      setPuzzleFailure((prev) =>
        prev?.puzzleId === puzzleId ? { puzzleId, retrying: true } : null,
      )
      // 垫底那一步与 currentId 同一批落下：块到手之前屏幕上不许先露出它
      const land = () => {
        if (landing.current?.puzzleId === puzzleId) landing.current.run()
        landing.current = null
        setCurrentId(puzzleId)
      }
      if (isPuzzleLoaded(puzzleId)) {
        setPendingPuzzleId(null)
        setPuzzleFailure(null)
        land()
        return
      }
      setPendingPuzzleId(puzzleId)
      void ensureLevelLoaded(puzzleId).then(
        () => {
          if (selectGeneration.current !== generation) return
          setPendingPuzzleId(null)
          setPuzzleFailure(null)
          land()
        },
        () => {
          /*
           * 块没到手。两件事都得做：pending 一定要清（不清的话同一关再点会被
           * 上面那句去重挡回去，重试根本发不出去），并且把失败摆到台面上——
           * 失败的那一册也没有留在缓存里（见 data/index.ts），所以下一次点击
           * 是一次真的重来。
           */
          if (selectGeneration.current !== generation) return
          setPendingPuzzleId(null)
          setPuzzleFailure({ puzzleId, retrying: false })
        },
      )
    },
    [pendingPuzzleId],
  )

  const choosePuzzle = useCallback((id: string) => {
    /*
     * 付费墙排在教学邀请前面：一关打不开的时候，先问他要不要上一课是答非所问。
     *
     * 这一道是**兜底**，不是唯一的一道。正常路径上锁着的册子在 openAlbum 那儿就
     * 拦住了，走到这里的是那些绕过书架的入口——首页那条「继续上一局」、退款之后
     * 还留在存档里的半局、以及将来任何一个直接点名关卡 id 的地方。判断只有一份
     * （billing/content + billing/entitlement），所以多加一道门不会多一种口径。
     */
    if (isFullGameLevel(id) && !fullGameEntitled()) {
      cancelPendingPuzzle()
      setPaywall(true)
      return
    }
    if (id !== TUTORIAL_LEVEL_ID && needsFirstLesson(progressMap, loadTutorialSeen())) {
      cancelPendingPuzzle()
      setLessonOffer(id)
      return
    }
    setLessonRequested(false)
    setLessonReturnId(null)
    selectPuzzle(id)
  }, [progressMap, cancelPendingPuzzle, selectPuzzle])

  const beginLesson = useCallback((returnId: string | null = null) => {
    setLessonOffer(null)
    setLessonReturnId(returnId)
    setLessonRequested(true)
    // 跨册学习保留原来翻开的那本
    if (returnId) {
      selectPuzzle(TUTORIAL_LEVEL_ID)
      return
    }
    /*
     * 首页直接开课也有明确的选关落点：教学关所在的那一册垫在对局下面，退出对局
     * 回的是它。但它只能与对局**同一批**落下（见 selectPuzzle 的 landing）——
     * 先设出去，块在路上的那一帧屏幕上就是一页画册，然后才翻到教学。
     */
    const album = albumOfPuzzle(albums, TUTORIAL_LEVEL_ID)
    selectPuzzle(TUTORIAL_LEVEL_ID, () => {
      if (album) setOpenAlbumId(album.id)
      albumPage.current = undefined
    })
  }, [albums, selectPuzzle])

  /** 提示上那个「重试」：就是把同一关再点一次 */
  const retryPuzzleLoad = useCallback(() => {
    const failed = puzzleFailure?.puzzleId
    if (failed) selectPuzzle(failed)
  }, [puzzleFailure, selectPuzzle])

  const dismissPuzzleFailure = useCallback(() => setPuzzleFailure(null), [])

  // 新翻开画册不沿用上一次退出对局的定位；这次进入应按当前进度选页。
  const openAlbum = (albumId: string) => {
    // 锁着的册子不翻开，直接摆价格：翻开一本每一关都点不动的书只是把失望拖长
    if (isFullGameAlbum(albumId) && !fullGameEntitled()) {
      setPaywall(true)
      return
    }
    const group = albums.find((album) => album.id === albumId)?.group
    if (group) setHomeGroup(group)
    setLastSelectedId(null)
    // 页码那份记忆同理：它记的是上一本翻在哪儿，从头翻开一本时不作数
    albumPage.current = undefined
    /*
     * 这一册的画到手了才翻开——与 selectPuzzle / openCollection 同一条规矩。
     * 原生上全库开机就取齐了，这里永远直接翻页；网页端弱网才会真的等一下。
     * 取不到也翻（册页靠占位撑得住版面），真要开一关时那一路会再取、再说话。
     */
    whenAlbumsLoaded([albumId], () => setOpenAlbumId(albumId))
  }

  /**
   * 「内容没到手不换层」——翻开一页之前，它要陈列的册必须已经在手上。
   *
   * 原生上全库开机就取齐了（见 data/libraryBoot），这里永远同步命中、当场翻页；
   * 只有网页端弱网、开机那一趟到点放行之后，才会真的等一下。等的那几十毫秒里人
   * 可能已经走开（翻开别的、点进一关），兑现时先看一眼当前层还是不是发起时那一层：
   * 收藏页在层级里排得靠后，这时把它设上去不会立刻露出来，却会埋在下面。
   *
   * 取不到的册不拦着翻页：那一页停在占位上，真要用它时那一路会再取（见 data/index.ts）。
   */
  const whenAlbumsLoaded = (albumIds: string[], open: () => void) => {
    const pending = albumIds.filter((id) => !isAlbumLoaded(id))
    if (pending.length === 0) {
      open()
      return
    }
    const from = layerKindRef.current
    let opened = false
    const settle = () => {
      if (opened) return
      opened = true
      if (layerKindRef.current === from) open()
    }
    const timer = window.setTimeout(settle, COLLECTION_OPEN_WAIT_MS)
    void Promise.all(pending.map((id) => ensureAlbumLoaded(id).catch(() => undefined))).then(
      () => {
        window.clearTimeout(timer)
        settle()
      },
    )
  }

  const openCollection = () => {
    const wanted = albums
      .filter((album) => album.puzzles.some((puzzle) => isUnlocked(progressMap[puzzle.id])))
      .map((album) => album.id)
    whenAlbumsLoaded(wanted, () => setCollectionView(true))
  }

  // 只有真正退出对局才记住落点。连续点「下一关」后，puzzleId 就是最后退出的那关。
  const exitPuzzle = useCallback((puzzleId: string) => {
    setLastSelectedId(puzzleId)
    setCurrentId(null)
  }, [])

  const exitDailyView = useCallback(() => setDailyView(false), [])

  const selectDailyDate = useCallback((date: string) => {
    if (date > shanghaiToday()) return
    setSelectedDailyDate(date)
    setDailyProgress(loadProgressByKey(dailyProgressKey(date)))
    setDailyError(null)
  }, [])

  const startDaily = useCallback(async () => {
    if (!dailyDates.includes(selectedDailyDate) || selectedDailyDate > shanghaiToday()) {
      setDailyError(t('daily.errorUnreleased'))
      return
    }
    // 今天那一期白送，往期属于完整版（见 billing/content 的 isFullGameDaily）
    if (isFullGameDaily(selectedDailyDate, shanghaiToday()) && !fullGameEntitled()) {
      setDailyError(null)
      setPaywall(true)
      return
    }
    setDailyError(null)
    // 已经预取到本地的话直接秒开，不用每次都等一轮网络；后台仍悄悄刷新缓存供下次使用。
    const cached = daily?.date === selectedDailyDate ? daily : getCachedDaily(selectedDailyDate)
    if (cached) {
      setDaily(cached)
      setDailyProgress(loadProgressByKey(dailyProgressKey(cached.date)))
      setDailyActive(true)
      void track('daily_open')
      void fetchDailyByDate(selectedDailyDate)
      return
    }
    setDailyLoading(true)
    const file = await fetchDailyByDate(selectedDailyDate)
    setDailyLoading(false)
    if (!file) {
      setDailyError(t('daily.errorLoad'))
      return
    }
    setDaily(file)
    setDailyProgress(loadProgressByKey(dailyProgressKey(file.date)))
    setDailyActive(true)
    void track('daily_open')
  }, [daily, dailyDates, selectedDailyDate, t])

  const completeDaily = useCallback(
    (_id: string, timeSeconds: number) => {
      if (!daily) return
      const saved = loadProgressByKey(dailyProgressKey(daily.date))
      const best = saved?.bestTimeSeconds
      const progress: PuzzleProgress = {
        version: 1,
        board: '',
        elapsedSeconds: 0,
        completed: true,
        everCompleted: true,
        bestTimeSeconds: best === undefined ? timeSeconds : Math.min(best, timeSeconds),
        // 每日挑战还没有陈列的地方，但首通时刻过后就补不回来了，先记下（与正式关卡同一口径）
        firstClearedAt: saved?.firstClearedAt ?? (saved?.everCompleted ? undefined : Date.now()),
      }
      saveProgressByKey(dailyProgressKey(daily.date), progress)
      // 与正式关卡同一口径：就地发，不推迟（理由见下面 track('win') 处）
      void track('daily_win')

      // 光标自动前进：优先跳到下一天；之后（含下一天）都做完了就落到离今天最近的未完成一期。
      const completedDates = new Set(
        dailyDates.filter(
          (date) => date === daily.date || loadProgressByKey(dailyProgressKey(date))?.completed,
        ),
      )
      const nextDate = nextDailyCursor(dailyDates, completedDates, daily.date)
      if (nextDate !== selectedDailyDate) {
        setSelectedDailyDate(nextDate)
        setDailyProgress(loadProgressByKey(dailyProgressKey(nextDate)))
      } else {
        setDailyProgress(progress)
      }
    },
    [daily, dailyDates, selectedDailyDate],
  )

  /** 层级的原料。退一步就是把其中一个放回去，见 popPageStep 的 previous。 */
  const nav = useMemo<NavState>(
    () => ({
      dailyActive,
      dailyView,
      currentId,
      openAlbumId,
      libraryView,
      detailPuzzleId,
      collectionView,
      lastSelectedId,
    }),
    [
      collectionView,
      currentId,
      dailyActive,
      dailyView,
      detailPuzzleId,
      lastSelectedId,
      libraryView,
      openAlbumId,
    ],
  )

  /*
   * albums 必须在依赖里：getLoadedPuzzle / getPuzzleById 读的是模块里那张表，
   * 不进 resolveLayer 的参数，块到了要靠它换一个新数组来触发重算——它由
   * usePuzzleLibrary 那份订阅算出来。这一条别删成「只留 currentId」：
   * 那样块到了层级不会更新。
   */
  const layerContext = useMemo<LayerContext>(
    () => ({ albums, daily, dailyPuzzle, dailyFeatureEnabled }),
    [albums, daily, dailyFeatureEnabled, dailyPuzzle],
  )

  const layer = useMemo(() => resolveLayer(nav, layerContext), [nav, layerContext])
  // 给在途的异步导航（openCollection）兑现时看一眼「人还在不在这一层」
  const layerKindRef = useRef(layer.kind)
  layerKindRef.current = layer.kind

  /**
   * 当前层往回退一步：`pop` 是这一步，`undo` 是它的逆，`previous` 是退完的状态。
   *
   * 逆运算是为跟手手势准备的——左缘手势起手就要换页，手指半路收回时必须原路
   * 退回来。层级本身是一串互斥的显式状态，每一步的逆都只是把那一个值放回去。
   *
   * `previous` 与 `pop` 逐行贴着写：pop 动哪一个状态，popNav 就改哪一个。
   * 「上一层是谁」由它交给 resolveLayer 算，不另立一套判断（见 NavState）。
   */
  const popPageStep = useCallback((): PageStep | null => {
    // 「退一步之后是什么」只有 popNav 一份，浏览器历史问的也是它（见上面的注释）
    const previous = popNav(layer, nav)
    if (!previous) return null
    switch (layer.kind) {
      case 'daily-game':
        return {
          pop: () => setDailyActive(false),
          undo: () => setDailyActive(true),
          previous,
        }
      case 'daily-calendar':
        return {
          pop: exitDailyView,
          undo: () => setDailyView(true),
          previous,
        }
      case 'game': {
        const id = layer.puzzle.id
        const previousLastSelectedId = lastSelectedId
        return {
          pop: () => exitPuzzle(id),
          // 跟手返回半途收回不算退出，连定位记忆也原样还原。
          undo: () => {
            setLastSelectedId(previousLastSelectedId)
            setCurrentId(id)
          },
          previous,
        }
      }
      case 'album': {
        const id = layer.album.id
        return {
          pop: () => setOpenAlbumId(null),
          undo: () => setOpenAlbumId(id),
          previous,
        }
      }
      case 'library':
        return {
          pop: () => setLibraryView(false),
          undo: () => setLibraryView(true),
          previous,
        }
      case 'detail': {
        const id = layer.puzzle.id
        return {
          pop: () => setDetailPuzzleId(null),
          undo: () => setDetailPuzzleId(id),
          previous,
        }
      }
      case 'collection':
        return {
          pop: () => setCollectionView(false),
          undo: () => setCollectionView(true),
          previous,
        }
      case 'home':
        return null
    }
  }, [exitPuzzle, exitDailyView, lastSelectedId, layer, nav])

  /**
   * 紧挨着的上一层——只这一层，不是整条栈。
   *
   * 层级判断只有一份：把「退过一步的那份状态」喂给同一个 resolveLayer，
   * 出来的就是它（见 NavState）。nav 一并带出来，是因为册页翻到第几页
   * 要看退完之后的 lastSelectedId。
   */
  const previous = useMemo(() => {
    const step = popPageStep()
    if (!step) return null
    return { layer: resolveLayer(step.previous, layerContext), nav: step.previous }
  }, [popPageStep, layerContext])

  /**
   * 预热闸门：0 是「可以把上一层挂上去」，非 0 是刚退过一页的代号。
   *
   * 退一页的那一帧里绝不能顺手挂一层新的上一层。退出对局那一下，新的上一层
   * 是首页——挂它要把 602 关摊平排一遍序、画三十张缩略图，这笔开销会原封不动
   * 落进手势的 flushSync 里，把刚省下的那几十毫秒又还回去。所以退页时先把闸门
   * 关上，只留下正在被揭开的那一层；等原生收尾动画走完再开（PREWARM_RESUME_MS）。
   *
   * 用「代号」而不是布尔：连划两笔时第二笔要能把计时重新按一遍，值不变的
   * setState 会被 React 直接吞掉。
   */
  const [prewarmPaused, setPrewarmPaused] = useState(0)
  const pausePrewarm = useCallback(() => setPrewarmPaused((n) => n + 1), [])

  useEffect(() => {
    if (!prewarmPaused) return
    const id = window.setTimeout(() => setPrewarmPaused(0), PREWARM_RESUME_MS)
    return () => window.clearTimeout(id)
  }, [prewarmPaused])

  /**
   * 真正挂在树上、垫在当前页下面的那一层。
   *
   * 前进导航时不关闸门，所以刚刚还是当前页的那一层会**原地**变成预热层——
   * 同一个 key、同一个实例、同一批 DOM 节点，画好的缩略图 canvas 一张都不用重画。
   * 退页时反过来：它原地变回当前页，起手那一下只是把盖在上面的那层摘掉。
   */
  const buffer = prewarmPaused ? null : previous
  const bufferKey = layerKey(buffer?.layer ?? null)

  /**
   * 给预热层看的那份进度表：内容一样就不换引用（见 sameRenderedProgress）。
   *
   * 揭开的那一刻它会立刻换成实时的那一份——被揭开的层这时已经是「当前层」了，
   * 走的是下面 activeEnv 那一路。两份的差别只在 board / elapsedSeconds，
   * 没有一处画得出来，所以那一次重渲染是零 DOM 改动。
   */
  const stableProgressRef = useRef(progressMap)
  const bufferProgressMap = useMemo(() => {
    const held = stableProgressRef.current
    if (held !== progressMap && !sameRenderedProgress(held, progressMap)) {
      stableProgressRef.current = progressMap
    }
    return stableProgressRef.current
  }, [progressMap])

  // 入门资格只看解锁与是否开过局，复用稳定进度引用，避免每笔落盘遍历关卡库。
  const journeyExperience = useMemo(() => ({
    learningTools: Object.values(bufferProgressMap).filter(isUnlocked).length < 7,
    sizes: [10, 15].filter((size) => hasPlayedSize(size, puzzles, bufferProgressMap)),
  }), [puzzles, bufferProgressMap])

  /*
   * 把「上一页已经画好了」这件事预先摆到原生手上（见 reportEdgeBackPrepared）。
   *
   * 挂上还不算数，要等它真的跨过一次绘制——两次 rAF，与 pageReady 同一条判据。
   * 换层时先撤（cleanup 跑在下一次 effect 之前），退页那一下闸门一关
   * bufferKey 就成了空串，撤销正好落在手势的 flushSync 里，绝不会让原生
   * 拿着上一层的凭据去揭下一层。
   *
   * **上一层重画了也要重新走一遍这道门**，不只是换人时。从前依赖只有 bufferKey：
   * 上一层一挂上、跨过一次绘制就报 true，此后不管它怎么重画都一直算「画好了」。
   * 关卡库按册分块之后这条前提不再成立——册块是在页面已经摊在屏幕上之后才一册一册
   * 落地的，每落一册，库快照换新，垫在下面的首页跟着重画（收藏架上的画从占位换成
   * 真画）。这一帧的图层提交于是带着一屏脏位图；左缘手势恰好起在这时，起手那一处
   * opacity 就与这批脏位图挤在同一次提交里，UI 进程要等位图到齐才能上屏——快照已经
   * 跟着手指走了，露出来的是刚要退掉的那一页（2026-09-15 真机 iPhone X 在收藏页
   * 报的就是这个，正是复盘里「揭页那次提交携带大量脏内容」那条根因换了个入口回来）。
   *
   * 正主是 openCollection：册取齐了才翻页，收藏页摊开之后不再有册落地（见那段注释）。
   * 这里是兜底——只报真话：上一层的输入（库快照、进度）一变，它就不再算画好了，
   * 先撤凭据，再等它真的跨过一次绘制。这两帧里起手的手势走的是垫底色那条老路，
   * 露一块页面底色，绝不露旧页。
   */
  useEffect(() => {
    if (!bufferKey) return
    let alive = true
    let inner = 0
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        if (alive) reportEdgeBackPrepared(true)
      })
    })
    return () => {
      alive = false
      cancelAnimationFrame(outer)
      cancelAnimationFrame(inner)
      reportEdgeBackPrepared(false)
    }
    // puzzles / bufferProgressMap 就是上一层画的东西：它们一变，上一层就得重新跨一次绘制
  }, [bufferKey, puzzles, bufferProgressMap])

  /**
   * 全局「返回」。页面左上角那枚箭头、安卓返回键、iOS 左缘手势，三条路都从这里过。
   *
   * 从前只有后两条走这里，箭头各页自己 setState 退一层。那样有两处对不上：一是
   * 箭头不问浮层栈——教学浮层的根层是 pointer-events: none，顶栏那枚箭头照样点得着，
   * 于是同一个「返回」，按系统返回是「跳过教学」，点箭头却是退出关卡、丢掉这一局；
   * 二是箭头不走任何转场，同一件事在同一台机器上有两种动法。
   *
   * source 只决定**怎么动**和**到根页之后怎么办**，退到哪一层三条路完全一致。
   * 转场分两处做，是因为两端能用的东西不一样：iOS 由原生拿真实快照跟着手指滑
   * （部署目标到 iOS 15，网页的 View Transitions 要 iOS 18 才有）；返回键与箭头
   * 都是一次性事件，没有可跟的手，走网页那条 View Transitions 正好。
   */
  const navigateBack = useCallback(
    (source: 'button' | 'android-back' | 'ios-edge') => {
      // 强制更新弹窗展示期间，返回键与左缘手势都不再是逃生通道
      if (updateInfo?.mandatory) return
      /*
       * 设置面板这类临时层不在下面的视图层级里，先问它们要不要接管。它们各自
       * 有出场动画，收起一张浮层也不是「退回上一页」，因此不走整页回退转场。
       */
      if (runTopBackHandler()) return

      const step = popPageStep()
      /*
       * 到根页了。安卓那一下本该根本走不到这里：站在首页时那条原生回调已经关掉，
       * 返回直接归系统（见下面的 setAndroidBackHandled）。走到了只有一种可能——
       * 刚退回首页、开关还没来得及落地的那几毫秒里又按了一次。那就照老路退出应用：
       * 少一段系统动画，总好过一次没有反应的返回。
       *
       * iOS 左缘手势在首页只是不做任何事。首页没有那枚箭头，'button' 也走不到这里，
       * 真走到了同样当无事发生，绝不退出应用。
       */
      if (!step) {
        if (source === 'android-back') CapApp.exitApp()
        return false
      }
      /*
       * 在途那一笔进入一并作废：返回是「往回」，不该让几毫秒前点下的那一关在
       * 块到达时把人反向送出去。跟手手势半途收回时不恢复它——原路退回来的是
       * 页面，不是那一次点击。
       */
      cancelPendingPuzzle()
      /*
       * 退这一步的同时把预热闸门关上：这一帧只该做「摘掉当前页」，不该顺手
       * 再挂一层新的上一层（见 prewarmPaused）。两句在同一个 flushSync 里
       * 一起提交，中间不会有一帧同时挂着三层。
       */
      const pop = () => {
        pausePrewarm()
        step.pop()
      }
      /*
       * 同一件事，三种放法，按「谁在动」分，不按事件从哪来分：
       *
       * - ios-edge：原生已经拿真实快照跟着手指走了，这里只管换页。
       * - iOS 上的其余返回：没有手可跟，交给原生放同一段转场（快照拍完就推到底）。
       *   网页那条 View Transitions 在 iOS 15 上根本没有，也不该有第二套观感。
       * - 安卓与网页端：走 View Transitions，动作按平台分（见 global.css 的 .nav-back）。
       */
      if (source === 'ios-edge') popForEdgeBack(pop)
      else if (nativeBackAnimationAvailable()) runNativeBackAnimation(pop)
      else runBackTransition(pop)
      return true
    },
    [cancelPendingPuzzle, pausePrewarm, popPageStep, updateInfo],
  )

  /** 各页左上角那枚箭头共用的一句：与系统返回同一个语义，同一套动作。 */
  const handleBackButton = useCallback(() => navigateBack('button'), [navigateBack])

  /*
   * 浏览器的返回/前进键。模型写在 hooks/useBrowserHistory 的头注释里：
   * 一层页面一条历史条目，条目里存这一层的层级快照。这里只接三根线——
   * 快照怎么取、退一层怎么算、快照怎么落回应用状态。
   *
   * 只在 Web 上装。iOS 左缘手势与安卓返回键各有自己那一套（见 navigateBack
   * 与 utils/nativeBackHandler），它们不看 history，这里也就不往 history 里写。
   */
  const webHistoryEnabled = useMemo(() => !Capacitor.isNativePlatform(), [])

  const navSnapshot = useMemo<NavSnapshot>(
    () => ({
      dailyActive,
      dailyView,
      // 只在真打着的时候记日期：日历上换一天不是一次导航，不该各留一条条目
      dailyDate: dailyActive ? selectedDailyDate : null,
      currentId,
      openAlbumId,
      libraryView,
      detailPuzzleId,
      collectionView,
    }),
    [
      collectionView,
      currentId,
      dailyActive,
      dailyView,
      detailPuzzleId,
      libraryView,
      openAlbumId,
      selectedDailyDate,
    ],
  )

  /** 历史那边问「这一层退一步是什么」，答的是返回键用的同一个 popNav。 */
  const popSnapshot = useCallback(
    (snap: NavSnapshot): NavSnapshot | null => {
      // lastSelectedId 不参与层级判断（见 NavState），补一个占位即可
      const snapNav: NavState = { ...snap, lastSelectedId: null }
      const previous = popNav(resolveLayer(snapNav, layerContext), snapNav)
      if (!previous) return null
      return {
        dailyActive: previous.dailyActive,
        dailyView: previous.dailyView,
        dailyDate: previous.dailyActive ? snap.dailyDate : null,
        currentId: previous.currentId,
        openAlbumId: previous.openAlbumId,
        libraryView: previous.libraryView,
        detailPuzzleId: previous.detailPuzzleId,
        collectionView: previous.collectionView,
      }
    },
    [layerContext],
  )

  /**
   * 把一份快照落回应用状态。
   *
   * 一层的原料是一串互斥的显式状态，所以「跳到某一层」就是把这几个值一次摆好，
   * 不必也不该沿着层级一步步走——浏览器前进键可能一下跨回两层。
   *
   * direction 只决定怎么动：往回退配整页回退转场（与左上角那枚箭头同一套），
   * 往前和刷新恢复都不配——刷新那一下页面刚出来，没有「从哪儿退回来」可言。
   */
  const applyNavSnapshot = useCallback(
    (snap: NavSnapshot, direction: 'back' | 'forward' | 'restore') => {
      const commit = () => {
        // 在途那一笔进入一并作废，理由与 navigateBack 里那一句相同
        cancelPendingPuzzle()
        if (direction === 'back') pausePrewarm()
        // 退出对局要留下落点，册页据此翻到正确的一页（与 popPageStep 的 game 一支同义）
        if (currentId && !snap.currentId) setLastSelectedId(currentId)
        setDailyActive(snap.dailyActive)
        setDailyView(snap.dailyView)
        if (snap.dailyDate) {
          setSelectedDailyDate(snap.dailyDate)
          setDailyProgress(loadProgressByKey(dailyProgressKey(snap.dailyDate)))
        }
        setCurrentId(snap.currentId)
        setOpenAlbumId(snap.openAlbumId)
        setLibraryView(snap.libraryView)
        setDetailPuzzleId(snap.detailPuzzleId)
        setCollectionView(snap.collectionView)
      }
      if (direction === 'back') runBackTransition(commit)
      else commit()
    },
    [cancelPendingPuzzle, currentId, pausePrewarm],
  )

  useBrowserHistory({
    enabled: webHistoryEnabled,
    snapshot: navSnapshot,
    popSnapshot,
    applySnapshot: applyNavSnapshot,
    consumeOverlay: runTopBackHandler,
    locked: Boolean(updateInfo?.mandatory),
  })

  /** 浮层栈里压着几层。空栈是「根页可以把返回交还系统」的必要条件之一。 */
  const overlayCount = useSyncExternalStore(subscribeBackHandlers, backHandlerCount, backHandlerCount)

  /*
   * 安卓根页把返回交还系统（这条只在安卓上有动作，见 utils/nativeBackHandler）。
   *
   * 「根页」不只看层级：首页上开着设置面板时，那一下返回该收面板；强制更新弹窗
   * 展示期间返回本来就不是逃生通道，更不能顺手退出应用。三者任一成立就还归网页管。
   *
   * 用 layout effect 而不是普通 effect：这一句要尽量贴着提交那一刻发出去。离开首页
   * 时晚一步开回来，中间那几毫秒里按返回就会被系统当成根页返回，直接把应用送到后台。
   * 桥调用本身是异步的，不会挡住这一帧的绘制。
   */
  useLayoutEffect(() => {
    setAndroidBackHandled(
      layer.kind !== 'home' || overlayCount > 0 || Boolean(updateInfo?.mandatory),
    )
  }, [layer.kind, overlayCount, updateInfo])

  /** 跟手期间挂着的「撤销这一步」；手指收回时用它原路退回。 */
  const edgeBackUndo = useRef<(() => void) | null>(null)
  /** 正在跟手的那一笔手势的号；起手时从事件里拿，回话原样带回（见 nativeNavigation）。 */
  const edgeBackToken = useRef(0)
  /** 此刻摊在屏幕上的那一层。起手第一帧要交出去的就是它（见 startCompositorReveal）。 */
  const activeLayer = useRef<HTMLDivElement | null>(null)
  /**
   * 快路正交着屏幕的那一层。
   *
   * 快路整笔手势里页面一步都不退（见 startCompositorReveal）：只有这一层的
   * 不透明度交给了合成器，底下那一层原样摆着。所以这一份在，就是「这一笔还没
   * 落地，页也还没退」——收回手就把它收回来，算数了才真退一页。
   */
  const edgeBackReveal = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const subscription = CapApp.addListener('backButton', () => navigateBack('android-back'))

    /*
     * 左缘手势起手。只有整页回退才就地换页——原生要先把新页面拿到 webView 里，
     * 才能一边跟手一边把它从 -24% 推上来。浮层和首页回 defer：那两种情况做成
     * 整页滑动是撒谎，而且一次半途收回的手势不该顺手关掉设置面板。
     */
    const onEdgeBackBegin = (event: Event) => {
      /*
       * 号在这里就地取出来、往下一路传值，不能等到发的时候再去读 ref：page 那句
       * 要等过一次绘制才发，那一刻 ref 里可能已经是下一笔手势的号了——回话带错号，
       * 等于把这一笔的回执记到下一笔账上，比不带号还糟。
       */
      const token = edgeBackTokenOf(event)
      edgeBackToken.current = token
      // 起手阶段那块纯色到底盖了多久，中间这一段只有网页量得到（见 EdgeBackMarks）。
      // 三个数搭 pageReady 那趟已经在跑的车回去，量它本身不多走一步。
      const begin = performance.now()
      if (updateInfo?.mandatory || hasBackHandler()) {
        reportEdgeBackMode('defer', token)
        return
      }
      const step = popPageStep()
      if (!step) {
        reportEdgeBackMode('defer', token)
        return
      }
      // 与返回键同一条规矩：起手就作废在途那一笔进入（理由见 navigateBack）
      cancelPendingPuzzle()

      /*
       * 快路：原生正压着位移在等（prepainted），底下那一层此刻就画好摆着。
       * 走 startCompositorReveal——整笔手势只交一处合成器属性，页一步都不退。
       *
       * 「压没压着」以原生的说法为准，不由网页自己推断（见 edgeBackPrepaintedOf）。
       * 拿不到当前那一层的节点（理论上不该发生）也退回老路：宁可慢，不可乱。
       */
      const yielding = activeLayer.current
      if (edgeBackPrepaintedOf(event) && yielding) {
        reportEdgeBackMode('page', token)
        startCompositorReveal(token, begin, yielding)
        return
      }

      // 老路要真退一页，所以得留一份撤销；快路没退过，也就没有可撤的
      edgeBackUndo.current = step.undo

      /*
       * 老路（prepainted=no）：原生垫着一层纯色，起手就跟手，这里一个字没改。
       *
       * 必须同步提交。这条监听器不在 React 的事件系统里，setState 会被排进
       * MessageChannel 宏任务——两次 rAF 不保证它已经落到 DOM，原生那边拍到的
       * 「新页」就还是旧页，跟手时底下那层会是旧页面的副本。
       */
      const flushStart = performance.now()
      /*
       * 只做两件事：关掉预热闸门、退掉当前页。退完之后垫在下面那一层原地
       * 变成当前页——同一个 key、同一个实例，它早就排好版画好了，这一次提交
       * 里没有任何一层要新挂（见 prewarmPaused）。贵在它要从 position: fixed
       * 挪回文档流，一整页重排重画；快路正是为了把这一段挪出第一帧。
       */
      flushSync(() => {
        pausePrewarm()
        step.pop()
      })
      const flushEnd = performance.now()
      /*
       * 三句分开发，各说各的，时机也各不相同：
       *
       * - page：这一笔演。立刻发，它只是一个判断。
       * - activated：当前这一层已经把屏幕交出去了。等这一帧交给合成器之后才发
       *   （见 afterRenderingUpdate）——原生的快路压着快照不许有可见位移，就等
       *   这一句；早说一步，第一帧露出来的还是刚要退掉的那一页。
       * - pageReady：上一页画在屏幕上了。等过一次绘制才发，是快照与真页面交接
       *   的凭据；原生等到它才撤图层，撤的那一刻露出来的必定是真页面。
       *
       * activated 与 pageReady 不能合并成一句：前者要尽可能早（第一帧就要动），
       * 后者要尽可能稳（撤图层不能撤早）。合起来就只能取其一。
       */
      reportEdgeBackMode('page', token)
      reportEdgeBackActivated(token, begin)
      reportEdgeBackPageReady(token, { begin, flushStart, flushEnd })
    }

    /**
     * 快路的起手：整笔手势只改一处合成器属性，页一步都不退。
     *
     * 为什么退页非挪走不可——真机（iPhone X）画册退首页量到的账：`flushSync` 换页
     * 本身只有 3~7ms，`activated` 也只要 36ms 就发出去了，可上一页真正落到屏幕上要
     * 83ms。中间那 45ms 不在 JS 里，也不在桥上，而在 WebContent 的排版与光栅：退一页
     * 要卸掉当前层、把垫底那层从 `position: fixed` 挪回文档流，等于把一整页重排重画
     * 一遍。原生收到 activated 就开始跟手，于是第一帧露出来的还是刚要退掉的那一页。
     *
     * 所以这一帧只剩一件事：给当前那一层挂上 YIELDED_CLASS。那一层是常驻的合成层
     * （global.css 里的 will-change: opacity），这一下不重排、不重画，只有一次图层
     * 属性提交；底下那层的位图在手指落下之前就已经存在。
     *
     * 退页则一路挪到手势**落地之后**（commit 那条路，见 onEdgeBackCommit），不再是
     * 「挪到 activated 后面一点」。差别在半途收回的那一笔上：从前起手就真退了一页，
     * 收回手要重新挂一个当前页上来——那一页的滚动位置、册子的页码、画好的缩略图
     * 全是新的，而且两帧之内光栅不完，交还屏幕的那一刻露出的是半张画好的页压着
     * 底下那一层（iPhone Air 模拟器逐帧可见）。现在收回手就只是把这一处属性摘掉，
     * 页面从头到尾没动过，也就没有什么可复原、可重画的。
     *
     * pageReady 因此在这里就发得出去：快路的前提就是底下那一层已经排好版画好了
     * （prepainted），当前这一层一交出屏幕，露出来的就是货真价实的上一页——原生
     * 拿这句话撤快照，撤的那一刻底下必定是它。等到退页之后再发反而是晚的。
     */
    const startCompositorReveal = (token: number, begin: number, yielding: HTMLElement) => {
      const flushStart = performance.now()
      yielding.classList.add(YIELDED_CLASS)
      const flushEnd = performance.now()
      const marks: EdgeBackMarks = { begin, flushStart, flushEnd, revealFrame: -1 }
      /*
       * 揭开的那一帧起于哪次 vsync——只是仪表，后填进同一个对象（见 EdgeBackMarks）。
       * 它不参与任何判断，量不到也只是日志里少一个数。
       *
       * 这一次 rAF 是**白搭的**：activated 那条路自己有一次 rAF，两者在同一帧的
       * 同一批回调里跑完，不多等一帧，也不改变任何时序。取的是回调收到的帧时标，
       * 于是 `act.js - js.frame` 恰好就是那一帧渲染更新的耗时——这一版要证明的
       * 正是这个数从「一整页重排重画」变成了「一次图层属性提交」。
       */
      requestAnimationFrame((frameTime) => {
        marks.revealFrame = frameTime - begin
      })
      edgeBackReveal.current = yielding
      reportEdgeBackActivated(token, begin)
      reportEdgeBackPageReady(token, marks)
    }

    // 手指没过阈值收回去了：把起手那一步原样放回去，画好了再告诉原生撤快照。
    const onEdgeBackCancel = (event: Event) => {
      const reveal = edgeBackReveal.current
      edgeBackReveal.current = null
      const undo = edgeBackUndo.current
      edgeBackUndo.current = null
      if (reveal) {
        /*
         * 快路：页面从头到尾没退过，也就没有什么可撤的——把交出去的那一层收回来
         * 就是全部，同样只是一处合成器属性。这条路上绝不能调 undo：那一步压根
         * 没做过，撤它就是往前多退了一页。
         */
        reveal.classList.remove(YIELDED_CLASS)
      } else if (undo) {
        /*
         * 同 begin：原生一收到回执就撤快照，这一步没同步落到 DOM 就会露出错的一页。
         *
         * 闸门在这里就地开回来，与撤销同一次提交：撤销之后的上一层，正是此刻
         * 摊在屏幕上、马上要被盖回去的这一层。晚一步开，它会先被卸掉、
         * 360ms 后再原样挂回来——画好的缩略图白扔一遍，收回手指也就白收了。
         *
         * 交出去的那一层不必在这里摘：它随着退页那一次提交已经退场了。
         */
        flushSync(() => {
          setPrewarmPaused(0)
          undo()
        })
      }
      reportEdgeBackRestored(edgeBackTokenOf(event) || edgeBackToken.current)
    }

    /*
     * 手势成立，这才轮到真退一页。
     *
     * 快路整笔手势都没退过（见 startCompositorReveal），退页就落在这一句上。这时
     * 屏幕上是原生在放收尾动画：快照往右滑走，露出来的是底下那一层——它早就排好版
     * 画好了，退页只是把盖在上面那层看不见的当前页卸掉、把它自己从 fixed 换回文档流。
     * 前后两帧内容一模一样（两个类的不透明度取齐了，见 global.css），主线程在这儿堵
     * 几十毫秒也看不出来，何况动画归原生那个进程放，根本不受这边阻塞影响。
     *
     * 老路起手时就已经退过一页（撤销还挂着），这里只是确认保留，绝不能再退一次——
     * 原生在回话迟到时也会走到这条路径上来，双方各记一份「到底 pop 没 pop」最容易
     * 走岔，所以以网页手上这份撤销为准。
     */
    const onEdgeBackCommit = () => {
      const reveal = edgeBackReveal.current
      edgeBackReveal.current = null
      if (edgeBackUndo.current) {
        edgeBackUndo.current = null
        return
      }
      /*
       * 退成了，交出去的那一层随着退页一起退场，那一处属性也跟着没了。万一没退成
       * （手势起手到落地之间冒出一张浮层，把这一下接管走了），得自己把它收回来——
       * 否则屏幕上停着一层看不见的当前页：看着是上一页，点哪儿都不响。
       */
      if (!navigateBack('ios-edge')) reveal?.classList.remove(YIELDED_CLASS)
    }

    window.addEventListener(IOS_EDGE_BACK_BEGIN_EVENT, onEdgeBackBegin)
    window.addEventListener(IOS_EDGE_BACK_CANCEL_EVENT, onEdgeBackCancel)
    window.addEventListener(IOS_EDGE_BACK_COMMIT_EVENT, onEdgeBackCommit)
    return () => {
      window.removeEventListener(IOS_EDGE_BACK_BEGIN_EVENT, onEdgeBackBegin)
      window.removeEventListener(IOS_EDGE_BACK_CANCEL_EVENT, onEdgeBackCancel)
      window.removeEventListener(IOS_EDGE_BACK_COMMIT_EVENT, onEdgeBackCommit)
      void subscription.then((listener) => listener.remove())
    }
  }, [cancelPendingPuzzle, navigateBack, pausePrewarm, popPageStep, updateInfo])

  /**
   * 按层出页面。当前层与预热的上一层走的是同一份，差别全部收在 env 里——
   * 上一层被揭开时要长得跟它自己该有的样子一模一样，就不能有第二套渲染。
   */
  const renderLayer = (target: Layer, env: LayerEnv) => {
    /*
     * 就地遮住外层同名的那两个。下面每一处 progressMap / lastSelectedId 都必须
     * 读这一层自己的那一份，漏掉一处就是「藏着的册页停在旧进度」——遮住是唯一
     * 不可能漏的写法。
     */
    const { progressMap, lastSelectedId } = env
    if (target.kind === 'daily-game') {
      const storageKey = dailyProgressKey(target.daily.date)
      return (
        <Game
          key={target.puzzle.id}
          puzzle={target.puzzle}
          titleOverride={t('daily.title')}
          exitLabel={t('daily.exitLabel')}
          initialProgress={dailyProgress ?? undefined}
          onPersist={(_id, progress) => {
            saveProgressByKey(storageKey, progress)
            setDailyProgress(progress)
          }}
          onCompleted={completeDaily}
          onExit={handleBackButton}
        />
      )
    }

    if (target.kind === 'daily-calendar') {
      return (
        <DailyCalendar
          dates={dailyDates}
          selectedDate={selectedDailyDate}
          selectedPuzzle={selectedDailyPuzzle}
          today={shanghaiToday()}
          progressByDate={dailyProgressByDate}
          loading={dailyLoading}
          error={dailyError}
          getPuzzle={dailyPuzzleByDate}
          onSelectDate={selectDailyDate}
          onPlay={() => void startDaily()}
          onExit={handleBackButton}
        />
      )
    }

    if (target.kind === 'game') {
      const puzzle = target.puzzle
      const currentAlbum = albumOfPuzzle(albums, puzzle.id)
      const chapterContext = currentAlbum
        ? albumChapterOfPuzzle(currentAlbum, puzzle.id)
        : undefined
      const nextId = nextInAlbum(albums, puzzle.id, progressMap)
      const nextChapterContext =
        currentAlbum && nextId ? albumChapterOfPuzzle(currentAlbum, nextId) : undefined
      /* 换章的判据是三段稳定键，不是章 id：章 id 只在卷内唯一（见 utils/chapters） */
      const enteringNextChapter =
        chapterContext !== undefined &&
        nextChapterContext !== undefined &&
        !sameChapter(chapterContext.ref, nextChapterContext.ref)
      const completesChapterOnFirstClear =
        chapterContext !== undefined &&
        !progressMap[puzzle.id]?.everCompleted &&
        chapterContext.puzzles.every(
          (candidate) =>
            candidate.id === puzzle.id ||
            progressMap[candidate.id]?.completed ||
            progressMap[candidate.id]?.everCompleted,
        )
      return (
        <Game
          key={puzzle.id}
          puzzle={puzzle}
          /*
           * 顶栏弱显示当前章；单章卷没有独立章名时沿用卷标题，都没有才退回册名。
           *
           * 章、卷、册三级名字全部过 i18n 的名字解析器：章的三段稳定键由
           * chapterContext.ref 给出（见 utils/chapters），只凭当前这一关就查得到，
           * 不依赖任何导航状态——刷新、从存档恢复、直接落在对局页都是同一条路。
           */
          titleOverride={
            chapterContext
              ? chapterLabel(chapterContext.ref, t.locale)
              : currentAlbum
                ? albumTitle(currentAlbum.id, t.locale)
                : undefined
          }
          chapter={
            chapterContext
              ? { ref: chapterContext.ref, puzzles: chapterContext.puzzles }
              : undefined
          }
          completesChapterOnFirstClear={completesChapterOnFirstClear}
          completedAlbum={
            currentAlbum && completesAlbumOnFirstClear(currentAlbum, puzzle.id, progressMap)
              ? currentAlbum
              : undefined
          }
          /*
           * 集齐一本之后的去处。正式版是主题画册页（同一题的另外三本摊在眼前）；
           * 试玩版没有主题这一层，回首页——四本合集就在首页上。
           */
          onChooseAlbum={currentAlbum ? () => {
            if (!isDemoBuild) {
              setLibraryGroup(currentAlbum.group)
              libraryScroll.current = undefined
              setLibraryView(true)
            }
            setOpenAlbumId(null)
            setDetailPuzzleId(null)
            setCurrentId(null)
          } : undefined}
          /* 从藏品页点「再次游玩」进来的，退出去回的是那一幅画，不是选关页 */
          exitLabel={detailPuzzleId === puzzle.id ? t('detail.exitLabel') : undefined}
          tutorialRequested={lessonRequested && puzzle.id === TUTORIAL_LEVEL_ID}
          onTutorialRequestHandled={() => setLessonRequested(false)}
          learningTools={journeyExperience.learningTools}
          sizeExperienced={journeyExperience.sizes.includes(puzzle.size)}
          initialProgress={progressMap[puzzle.id]}
          onPersist={save}
          onCompleted={(id, timeSeconds) => {
            markCompleted(id, timeSeconds)
            /*
             * 就地发，不推迟。
             *
             * 从前推迟 4s，怕 fetch 的发起、序列化和 Capacitor 桥挤掉结算的帧。
             * 真正贵的那一项——versionCode 的桥往返——早已被 primeTelemetry() 挪到
             * 冷启动（见 metrics/telemetry.ts）；剩下的在真机上实测只有 0.3~2.2ms，
             * 掉不了一帧（预算 16.7ms）。A/B 也验过：通关瞬间就发 vs 完全不发，
             * 掉帧数 4/2/5 对 16/3/6，差异全在噪声里。
             *
             * 而推迟是有代价的：那 4s 里玩家退出或系统回收进程，这个数据点就没了。
             * 既然买不到帧，就别买。
             */
            void track('win')
          }}
          onExit={handleBackButton}
          /* 下一关同样要先拿到画：走 selectPuzzle，块没到就等着，绝不先把 currentId 设出去 */
          onNext={lessonReturnId || nextId ? () => {
            const targetId = lessonReturnId ?? nextId!
            setLessonReturnId(null)
            setLessonRequested(false)
            selectPuzzle(targetId)
          } : undefined}
          /* 章名摆在按钮上方，按钮只留短动词；回教学关那一趟不摆章名 */
          nextDescription={!lessonReturnId && enteringNextChapter
            ? t('win.nextChapter', { chapter: chapterLabel(nextChapterContext.ref, t.locale) })
            : undefined}
          /* 下一章解析的是**它自己**那三段键，不沿用当前章的上下文 */
          nextLabel={
            lessonReturnId ? t('journey.returnPuzzle') : enteringNextChapter
              ? t('win.nextChapterAction')
              : undefined
          }
        />
      )
    }

    if (target.kind === 'album') {
      const openedAlbum = target.album
      return (
        <AlbumPage
          key={openedAlbum.id}
          album={openedAlbum}
          progressMap={progressMap}
          returnToPuzzleId={lastSelectedId}
          /* 首页四宫格直接翻开的那一本，返回键回的是首页；从主题画册页进来才回那一页 */
          backLabel={libraryView ? t('library.backLibrary') : t('common.backHome')}
          /* 半途收回的左缘手势会把这一层卸了再挂回来，页码得由外面还给它 */
          restorePage={albumPage.current}
          onPageChange={rememberAlbumPage}
          /* 教学讲的是 festive-tales-01-heart 那张盘，而它是首册第 3 关：没看过教学的人
             从第 1 关开局就再也遇不上它，所以这一本里优先把它排在前面 */
          preferPuzzleId={loadTutorialSeen() ? undefined : TUTORIAL_LEVEL_ID}
          onSelect={choosePuzzle}
          onExit={handleBackButton}
        />
      )
    }

    if (target.kind === 'library') {
      return (
        <LibraryPage
          albums={albums}
          progressMap={progressMap}
          initialGroup={libraryGroup}
          /* 半途收回的左缘手势会把这一层卸了再挂回来，滚动位置得由外面还给它 */
          restoreScrollTop={libraryScroll.current}
          onScrollChange={rememberLibraryScroll}
          onOpenAlbum={openAlbum}
          onExit={handleBackButton}
        />
      )
    }

    if (target.kind === 'detail') {
      const detailPuzzle = target.puzzle
      const detailAlbum = target.album
      const detailChapter = albumChapterOfPuzzle(detailAlbum, detailPuzzle.id)
      return (
        <PuzzleDetailPage
          key={detailPuzzle.id}
          puzzle={detailPuzzle}
          albumId={detailAlbum.id}
          albumName={albumTitle(detailAlbum.id)}
          chapterName={detailChapter ? chapterLabel(detailChapter.ref) : undefined}
          index={detailAlbum.puzzles.findIndex((p) => p.id === detailPuzzle.id) + 1}
          progress={progressMap[detailPuzzle.id]}
          onReplay={() => choosePuzzle(detailPuzzle.id)}
          onExit={handleBackButton}
        />
      )
    }

    if (target.kind === 'collection') {
      return (
        <CollectionPage
          albums={albums}
          progressMap={progressMap}
          totalCount={puzzles.length}
          onExit={handleBackButton}
          onOpenDetail={setDetailPuzzleId}
        />
      )
    }

    /*
     * 下面这几样都只有首页要，所以算在这儿，不算在函数开头。
     *
     * 它们都要摊平全库（602 关的 filter / 排序），而 App 在对局中每 500ms 就重渲染
     * 一次——写在开头就等于每落一笔都替一面看不见的架子重排一遍。
     *
     * 首页当预热的上一层挂着时，这一段照样会跑。跑得起：那时当前层是画册页
     * 或收藏页，App 并不高频重渲染；对局中的上一层是画册，首页根本不在树上。
     */
    // 收藏架与解锁库看的是同一份陈列：解锁过的，最近玩完的排最前
    const unlocked = unlockedByRecency(ordered, progressMap)
    // 抬头那个分子：解锁过多少幅，与架上摆的画、收藏页数的是同一批（见 countUnlocked）
    const unlockedCount = countUnlocked(puzzles, progressMap)
    const today = shanghaiToday()
    // 只有真打到一半才有落点：resumeTarget 不返回「还没打过的下一关」
    const resumePuzzle = resumeTarget(ordered, progressMap)
    const resumeProgress = resumePuzzle ? progressMap[resumePuzzle.id] : undefined
    return (
      <>
        <LevelSelect
          albums={albums}
          initialGroup={homeGroup}
          /* 试玩版宽屏首页摊开的那一本：刚打过的那一关所在的册 */
          initialAlbumId={lastSelectedId ? albumOfPuzzle(albums, lastSelectedId)?.id ?? null : null}
          totalCount={puzzles.length}
          unlockedCount={unlockedCount}
          unlocked={unlocked}
          progressMap={progressMap}
          /* 没有半局时这一条整条不出现 */
          resume={
            resumePuzzle
              ? { puzzle: resumePuzzle, elapsedSeconds: resumeProgress?.elapsedSeconds ?? 0 }
              : undefined
          }
          daily={
            dailyFeatureEnabled
              ? {
                  today,
                  publishedCount: dailyDates.length,
                  // 首页只表达“今天是否完成”，不跟随日历内部的日期选择光标。
                  progress: dailyProgressByDate[today],
                  syncing: dailySyncing,
                  available: dailyDates.includes(today),
                }
              : null
          }
          onSelectDaily={() => setDailyView(true)}
          onOpenLibrary={(group?: string) => {
            if (group) setHomeGroup(group)
            setLibraryGroup(group ?? null)
            // 新翻开这一页，按主题落点重新落地，不沿用上一次滚到哪儿
            libraryScroll.current = undefined
            setLibraryView(true)
          }}
          onOpenAlbum={openAlbum}
          onBeginLesson={() => beginLesson()}
          onOpenCollection={openCollection}
          onSelect={choosePuzzle}
        />
        {/* 浮层只归活着的那一层。藏着的首页要是也挂一张，它会压进返回栈
            （useBackHandler），下一笔左缘手势当场变成 defer——手势没了，
            人还看不见是谁挡的。 */}
        {env.active && updateInfo && (
          <UpdateModal info={updateInfo} onClose={() => setUpdateInfo(null)} />
        )}
      </>
    )
  }

  /*
   * 当前层，和垫在它下面预热的上一层。
   *
   * 四处细节都是必须的：
   *
   * 一、**这是一个带 key 的数组**，不是两个并排的表达式槽。槽按位置对齐，
   *    上一层从预热位翻成当前位时会换一个槽——按位置对齐就等于卸了重挂，
   *    预热白做。按 key 对齐，同一层从头到尾是同一个实例、同一批 DOM 节点，
   *    画好的缩略图 canvas 一张都不用重画。
   *
   * 二、**上一层排在前面**。它总是比当前层浅一级，退一步就是「当前层消失」，
   *    留下的那一个连位置都不用挪（React 的 keyed diff 只删一个尾节点）；
   *    前进一步则是「在它前面插一个新的」，同样不动它。这是这次改动的正主：
   *    起手那一下的 flushSync 里没有任何一层要挂、要卸、要移。
   *
   * 三、**两层的层级由 z-index 定，不由文档顺序定**（见 global.css 的 .nav-layer）。
   *    预热那一层是 position: fixed，不进文档流，当前页因此照常自己撑高、
   *    自己滚动；当前页那一层写死不透明底色，把下面完全盖住。
   *
   * 四、**预热那层在文档里排在前面**，全局 querySelector 会先撞上它。页面里
   *    按 data 属性找元素的地方要限定在自己那棵树内（见 AlbumPage 的焦点归位），
   *    inert 与 aria-hidden 则把它从焦点、点击和读屏里一并摘掉。
   *
   * 预热那一层每次都现画，不冻结旧 props——状态必须是实时的：通关一关后立刻
   * 返回，揭开的那一刻册页上就得是新的解锁数和新露出的那张画，不能先露出
   * 旧册页再跳。现画也不贵：它看的是一份按「画出来的内容」稳住引用的进度表
   * （bufferProgressMap），对局中那每 500ms 一次的落盘根本传不到它这儿。
   */
  const slots: { layer: Layer; node: ReactNode; active: boolean }[] = []
  if (buffer) {
    slots.push({
      layer: buffer.layer,
      active: false,
      node: renderLayer(buffer.layer, {
        active: false,
        progressMap: bufferProgressMap,
        // 退完那一步之后的定位记忆：册页据此提前就停在正确的那一页（见 NavState）
        lastSelectedId: buffer.nav.lastSelectedId,
      }),
    })
  }
  slots.push({
    layer,
    active: true,
    node: renderLayer(layer, { active: true, progressMap, lastSelectedId }),
  })

  return (
    <>
      {slots.map(({ layer: slot, node, active }) => (
        <div
          key={slot.kind}
          // 起手第一帧要交出去的就是当前这一层，拿着它的节点才能绕开 React 直接挂
          // 那一处 class（见 startCompositorReveal）。React 提交时先把退场节点的
          // ref 置空、再挂新节点的，所以退页那一次交接不会留下一个悬着的旧节点。
          ref={active ? activeLayer : undefined}
          className={active ? 'nav-layer' : 'nav-layer-buffer'}
          // 藏着的那一层不接点击、不进焦点顺序、读屏也看不见它
          inert={!active}
          aria-hidden={active ? undefined : true}
        >
          <LayerActiveProvider value={active}>{node}</LayerActiveProvider>
        </div>
      ))}
      {/* 按需资源的提示挂在页面层之外：藏着的那一层是 inert 的，而这条提示
          在哪一层上都得看得见、点得动（见 components/RetryNotice） */}
      {paywall && <FullGameSheet onClose={() => setPaywall(false)} />}
      {lessonOffer && (
        <JourneyDialog
          title={t('journey.offerTitle')}
          description={t('journey.offerBody')}
          action={t('journey.learn')}
          onAction={() => beginLesson(lessonOffer)}
          alternative={t('journey.playSelected')}
          onAlternative={() => {
            const id = lessonOffer
            saveTutorialSeen()
            // 选中的正好是叉子教材时，「直接玩」也跳过它，避免连续弹两段教学。
            if (id === TUTORIAL2_LEVEL_ID) saveTutorial2Seen()
            setLessonOffer(null)
            setLessonReturnId(null)
            setLessonRequested(false)
            selectPuzzle(id)
          }}
          onClose={() => setLessonOffer(null)}
        />
      )}
      <ResourceRetryNotices
        puzzleFailure={puzzleFailure}
        onRetryPuzzle={retryPuzzleLoad}
        onDismissPuzzle={dismissPuzzleFailure}
      />
    </>
  )
}
