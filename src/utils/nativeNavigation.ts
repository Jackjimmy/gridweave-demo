import { Capacitor, registerPlugin } from '@capacitor/core'
import { flushSync } from 'react-dom'

/*
 * iOS 左缘返回的三条事件（事件名与 SceneDelegate.swift 保持一致）。
 *
 * 手势是跟手的，所以不能等到松手才动页面：原生起手时先拍下当前这一屏盖住
 * WKWebView，再问网页这一下算不算整页回退。算，就地换页，之后快照跟着手指走、
 * 底下的上一层从 -24% 推上来；半路收回就发 cancel 把那一步原样撤销。
 * 浮层与首页不参与跟手，留到松手过阈值再发 commit 照常走一次返回。
 *
 * 网页回给原生的是四句，含义各不相同，别再混成一句：
 *
 * - edgeBackMode：这一笔演不演。**立刻发**，它只是一个判断，不需要等任何东西。
 * - edgeBackActivated：当前这一层已经把屏幕交出去了，现在挪快照露出来的是对的
 *   那一页。快路（prepainted）压着快照不许有可见位移，等的就是这一句。
 *   注意「交出去」不等于「退了一页」：快路整笔手势只把当前层的 opacity 交给合成器，
 *   真正的退页要等这一笔落地才做（见 App.tsx 的 onEdgeBackCommit）。
 * - pageReady：上一页真的画在屏幕上了。等过一次绘制才发。原生拿它当交接的凭据——
 *   垫底那层与旧页快照都留到这一句才撤，撤的那一刻露出来的必定是真页面。
 * - edgeBackRestored：撤销那一步画回来了（半途收回那一路的同一件事）。
 *
 * activated 与 pageReady 分工不同，不要合并：前者管「第一帧能不能开始动」，
 * 后者管「什么时候把屏幕交还给真页面」。前者早，后者稳。
 */
export const IOS_EDGE_BACK_BEGIN_EVENT = 'nonogramIOSEdgeBackBegin'
export const IOS_EDGE_BACK_CANCEL_EVENT = 'nonogramIOSEdgeBackCancel'
export const IOS_EDGE_BACK_COMMIT_EVENT = 'nonogramIOSEdgeBackCommit'

/** page＝真退了一页，原生接管跟手；defer＝这一笔不做转场，松手再说。 */
export type EdgeBackMode = 'page' | 'defer'

/**
 * 三条事件都带着这一笔手势的号。
 *
 * 回话是异步的：pageReady 要等过一次绘制，再走一趟桥，一个来回上百毫秒。连划两笔
 * 时，上一笔的回话完全可能落到下一笔头上——迟到的 defer 会把跟手中的快照撤掉，
 * 迟到的 pageReady 会让原生以为上一页已经画好、提前撤掉垫底那层。回话原样带回这个
 * 号，原生对不上就整条丢掉。
 *
 * 号挂在事件对象**自己身上**，不在 detail 里：Capacitor 派事件时是把数据里的字段
 * 一个个 ev[key] = value 拷过去的（见 native-bridge.js 的 createEvent）。
 */
export interface EdgeBackEvent extends Event {
  token?: number
  prepainted?: boolean
}

/** 没带号的（旧事件、测试里的裸 Event）算 0；原生的号从 1 起，永远对不上。 */
export function edgeBackTokenOf(event: Event): number {
  return (event as EdgeBackEvent).token ?? 0
}

/**
 * 这一笔起手时，原生**压着位移在等**吗（快路）。
 *
 * 由原生在 `.began` 那一瞬定下并随 begin 事件发过来，不由网页自己推断。两边各推
 * 一次必然有对不上的时候：网页手上的「上一层备好了」是个常设状态，原生手上的
 * 是它读到那一瞬的快照，中间隔着一趟桥。谁压着位移只有原生知道，就让它说。
 *
 * 没带这个字段的（旧原生、测试里的裸 Event）一律当 false：那条路是
 * 垫纯色的老路，一个字都不该改。
 */
export function edgeBackPrepaintedOf(event: Event): boolean {
  return (event as EdgeBackEvent).prepainted === true
}

/**
 * 起手阶段的时标（Phase 0 仪表）。
 *
 * 要回答的问题只有一个：手指落下之后，那块纯色到底盖了多久，其中哪一段最贵。
 * 原生知道两头（`.began` 与撤掉垫底那层），中间这一段只有网页知道——两个进程
 * 的单调时钟没有共同原点，所以网页不报绝对时刻，只报相对自己收到 begin 那一刻
 * 的三个差值，原生拿总时长减去它就得到两趟桥的合计。
 *
 * 三个数搭的是 pageReady 那趟已经在跑的车：不新增事件、不多走一趟桥，也就不会
 * 因为量它而把它变慢。
 */
export interface EdgeBackMarks {
  /** 网页收到 begin 事件的那一刻 */
  begin: number
  /** 起手那一步同步改动的前后：老路是 flushSync 换页，快路是那一处 opacity */
  flushStart: number
  flushEnd: number
  /**
   * 快路专用：揭开的那一帧是从哪一次 vsync 开始的（相对 begin）。
   *
   * 取的是 rAF 回调收到的那个帧时标，不是 `performance.now()`：这一段要回答的是
   * 「把屏幕交出去的那一帧，渲染更新到底贵不贵」，而 `act.js - revealFrame`
   * 正好就是那一帧的渲染更新耗时（activated 发在这次更新走完之后的那个任务里）。
   *
   * 不要改回「再等一次绘制」那种量法：退页那一步就排在 activated 后面，会把
   * 下一个帧边界整个推后，量出来的数里混着的是退页，不是揭开。
   *
   * 这个字段是**后填**的——它比这条回话本身还晚一点才知道，所以调用方传进来的
   * 是同一个对象，量到了就写回去（见 App.tsx 的 startCompositorReveal）。
   */
  revealFrame?: number
  /** 快路专用：挪到第一帧之后的那次退页，同步这一段花了多久 */
  pop?: number
}

interface EdgeBackTiming {
  /** 收到 begin 到那一步同步改动开始：监听器里那几步判断的开销 */
  jsBeginToFlushMs: number
  /** 那一步同步改动本身（老路是整次换页，快路只是一处 opacity） */
  jsFlushMs: number
  /** 收到 begin 到跨过一次绘制（也就是发这一句的那一刻） */
  jsBeginToPaintMs: number
  /** 快路：揭开那一帧起于哪次 vsync。`act.js` 减它就是那一帧的渲染更新耗时 */
  jsRevealFrameMs?: number
}

interface NativeNavigationPlugin {
  edgeBackMode(options: { mode: EdgeBackMode; token: number }): Promise<void>
  pageReady(options: { token: number } & Partial<EdgeBackTiming>): Promise<void>
  edgeBackRestored(options: { token: number }): Promise<void>
  edgeBackActivated(options: { token: number; sinceBeginMs?: number }): Promise<void>
  edgeBackPrepared(options: { prepared: boolean }): Promise<void>
  beginBackAnimation(): Promise<{ token: number; handled?: boolean }>
}

const NativeNavigation = registerPlugin<NativeNavigationPlugin>('NonogramNavigation')

/*
 * 一次 rAF 的回调跑在绘制之前，两次才跨过一次绘制。「画好了」那两句都要等它：
 * 原生拿它当「那一页已经在屏幕上了」的凭据，早说一步，快照撤开时露出的就是错的一页。
 */
function afterNextPaint(run: () => void): void {
  if (typeof requestAnimationFrame !== 'function') {
    run()
    return
  }
  requestAnimationFrame(() => requestAnimationFrame(run))
}

/**
 * 这一次改动**已经交给合成器**了——比 afterNextPaint 早一帧，又绝不会抢在像素前面。
 *
 * 三种发法只有这一种站得住，差别全在「渲染更新」这一步的里外：
 *
 *   一、flushSync 之后立刻发。DOM 是改了，但样式、排版、绘制一步都还没跑，图层
 *      更没提交。原生这时开始挪快照，露出来的就是刚要退掉的那一页——正是要治的病。
 *
 *   二、一次 rAF。回调跑在渲染更新**里面**，排在样式与提交之前；从这里发出去的
 *      消息与那一帧的图层提交走的是同一条 IPC，消息先出门，提交后出门。原生照样
 *      会早一帧。这一条最像对的，其实是错的。
 *
 *   三、一次 rAF 里再排一个任务（这里）。任务不可能在本轮事件循环里插队，它一定
 *      跑在整个渲染更新走完之后——那时这一帧的图层提交已经发出去了。所以消息永远
 *      排在像素后面，与设备快慢无关，不是「大概来得及」。
 *
 * 与 afterNextPaint（两次 rAF）的区别只在等不等下一帧：那一条要等下一次 vsync
 * 才醒，这一条在同一帧的尾巴上就发得出去，实测早一整帧。「上一页画好了」那句
 * （pageReady）仍旧走两次 rAF，语义一个字没动。
 */
function afterRenderingUpdate(run: () => void): void {
  if (typeof requestAnimationFrame !== 'function' || typeof setTimeout !== 'function') {
    run()
    return
  }
  requestAnimationFrame(() => {
    setTimeout(run, 0)
  })
}

/**
 * 回答原生起手时那一问：这一笔演不演。
 *
 * 两种回话都立刻发。从前 page 那句要压着等过一次绘制才发，因为它同时兼着「上一页
 * 画好了」的意思——一句话背两件事，于是原生在整整一个来回里都不知道这一笔到底演
 * 不演，只能先假设演。现在「画好了」拆成了 pageReady，这一句就只剩判断，没有任何
 * 等的理由。
 */
export function reportEdgeBackMode(mode: EdgeBackMode, token: number): void {
  void NativeNavigation.edgeBackMode({ mode, token }).catch(() => {})
}

/**
 * 上一页已经画在屏幕上了——快照与垫底那层可以交给它了。
 *
 * 必须等过一次绘制再发。原生等的就是这一句：旧页快照滑开、垫底那层撤掉的那一刻，
 * 露出来的必须是真页面；早说一步，露出的就是刚刚退掉的那一页，满屏闪一帧再跳回来。
 *
 * 等这一下不会把手势卡住：跟手从起手第一帧就开始，与这句回话无关；原生那边也压着
 * 上限兜底，只是那条路只在异常时才走。
 */
export function reportEdgeBackPageReady(token: number, marks?: EdgeBackMarks): void {
  afterNextPaint(() => {
    // 最后一个差值只能在这里取：这一刻才是「跨过了一次绘制」。没带时标的那一路
    // （返回箭头）照旧只发号，回话的形状一个字节都不变。
    const timing: Partial<EdgeBackTiming> = marks
      ? {
          jsBeginToFlushMs: round(marks.flushStart - marks.begin),
          jsFlushMs: round(marks.flushEnd - marks.flushStart),
          jsBeginToPaintMs: round(performance.now() - marks.begin),
          // 快路那个数是后填的，读的是此刻对象里的值；老路根本不带
          ...(marks.revealFrame === undefined ? {} : { jsRevealFrameMs: round(marks.revealFrame) }),
        }
      : {}
    void NativeNavigation.pageReady({ token, ...timing }).catch(() => {})
  })
}

/**
 * 当前这一层**已经把屏幕交出去**了，底下露出来的就是预热好的上一层。
 *
 * 这一句是给「起手第一帧」用的，与 pageReady 分工不同，不要合并：
 *
 * - activated 回答的是「现在挪快照，露出来的是对的那一页吗」。原生在快路里
 *   （prepainted）压着快照不许产生任何可见位移，等的就是它；收到就地追到手指
 *   当前的位置，不是从零重放一段动画。
 * - pageReady 回答的是「这一页可以接管快照与垫底那层了」，是收尾交接的凭据。
 *   它照旧走两次 rAF、照旧是撤图层的唯一出口，语义一个字没动。
 *
 * 带号：连划两笔时上一笔的这句完全可能落到下一笔头上，原生对不上号就整条丢掉。
 * 重复发、迟到发都必须是安全的——原生那侧只在「正在压着等」时才认它一次。
 */
export function reportEdgeBackActivated(token: number, begin?: number): void {
  afterRenderingUpdate(() => {
    const timing = begin === undefined ? {} : { sinceBeginMs: round(performance.now() - begin) }
    void NativeNavigation.edgeBackActivated({ token, ...timing }).catch(() => {})
  })
}

/**
 * 上一页此刻就排好版、画好，压在当前页下面——这一笔起手可以直接揭它。
 *
 * 与上面三句不同，这一句**不属于任何一笔手势**，所以不带号：它是一个常设状态，
 * 在手指落下之前就得摆在原生手上。原生在 `.began` 那一瞬没有时间问网页——问一趟
 * 就是一个来回上百毫秒，正是要省掉的那一段——所以只能预先告诉它。
 *
 * 只报真话，宁可报晚不可报早：
 *   - 挂上还不算，要等它真的跨过一次绘制才报 true（与 pageReady 同一条判据）；
 *   - 一旦上一层换了人（导航、退页、预热闸门关上），当场报 false，绝不留着
 *     上一层的凭据让原生走快路。
 *
 * 原生拿它只做一个决定：垫不垫那层纯色（见 SceneDelegate 的 attachRevealCover）。
 * 报 false、报晚了、这一句根本没送到，都只是退回垫纯色的老路——也就是 Phase 1
 * 那条已经稳的路径，不会错到别处去。
 */
export function reportEdgeBackPrepared(prepared: boolean): void {
  // 只有 iOS 有这条快路；别的端连插件都没有，不必每次导航都去撞一次空
  if (!nativeBackAnimationAvailable()) return
  void NativeNavigation.edgeBackPrepared({ prepared }).catch(() => {})
}

/** 0.1ms 已经比这条链路上任何一段的抖动都细了，多的位数只是噪声。 */
function round(ms: number): number {
  return Math.round(ms * 10) / 10
}

/** 撤销那一步已经画好了，原生可以把快照撤掉。 */
export function reportEdgeBackRestored(token: number): void {
  afterNextPaint(() => {
    void NativeNavigation.edgeBackRestored({ token }).catch(() => {})
  })
}

/**
 * iOS 上要不要给这一次返回配原生转场。
 *
 * 只有 iOS：安卓与网页端走 View Transitions（见 utils/viewTransition），那条路
 * 在这两处都成立，也更省事。
 */
export function nativeBackAnimationAvailable(): boolean {
  return Capacitor.getPlatform() === 'ios'
}

/**
 * iOS 返回箭头由原生模拟一次零位移的快速左缘返回。
 * 新原生通过同一套 begin / commit 事件揭层和退页，回调不得再 pop。
 * 旧原生仍返回 token，由这里换页并回报绘制；桥不可用时直接返回。
 */
export function runNativeBackAnimation(commit: () => void): void {
  const pop = () => flushSync(commit)
  NativeNavigation.beginBackAnimation().then(
    ({ token, handled }) => {
      if (handled) return
      pop()
      if (token) reportEdgeBackPageReady(token)
    },
    () => pop(),
  )
}
