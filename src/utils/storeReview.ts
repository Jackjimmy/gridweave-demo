import { AppLauncher } from '@capacitor/app-launcher'
import { registerPlugin } from '@capacitor/core'
import { distributionChannel, isStoreBuild } from '../config/distribution'
import { nativeAppInfo } from './devBuild'
import { journeySeen, rememberJourney } from './journey'

/**
 * 去商店打分，两条路：
 *
 *   - **被动**：设置面板里一行「去评分」，跳到商店的评论页。玩家自己来找的，
 *     什么时候点都行。
 *   - **主动**：某个高光时刻请系统弹邀评层。Apple 审核指南 1.1.7 要求邀评只能走
 *     系统 API（SKStoreReviewController），自绘的「喜欢就去打分」会被拒；Google 的
 *     In-App Review 同理。两家都有配额（Apple 每用户每年最多三次）、都不保证真的
 *     弹出来、都不告诉我们弹没弹——所以这一层只管「什么时候请」，弹不弹是系统的事。
 *
 * 主动邀评的时机（2026-09-19 定）：
 *
 *   1. 第一次打开游戏的那一个会话里，补完第二章的时候。第一章是 5×5 的上手关，
 *      刚教完就伸手要分太急；能在第一次就连着打完两章的人，是真的玩进去了。
 *   2. 第二次及以后打开游戏，补完任何一章（5×5 上手章除外）的时候。
 *
 * 两条都要等结算卡上「某某章 · 完成」那行字出现之后再请（见 WinModal 的
 * onChapterCompleteShown），系统弹层不能压在揭晓和结算的节奏上。
 *
 * 门槛全在本地：只在商店渠道；每个版本至多请一次；玩家已经从设置主动去过评论页
 * 就永远不再请。每日挑战不在任何一章里，天然不触发。
 */

export interface StoreReviewPlugin {
  /** 请系统弹邀评层。promise 只表示「已经请了」，弹不弹、评没评都不可知。 */
  requestReview(): Promise<void>
  /**
   * 作废还没弹出来的那次请求。Android 要先异步向 Play 取 ReviewInfo，慢的时候玩家
   * 可能已经点了「下一关」；作废之后迟到的 ReviewInfo 直接丢掉，不压到新棋盘上。
   * iOS 是同步请的，没有这段窗口，那边是空实现。
   */
  cancelReview(): Promise<void>
  /**
   * 打开商店里本应用的详情页（设置里「去评分」）。只有 Android 用：点名交给 Google Play
   * （com.android.vending），没有 Play 再用浏览器开网页版；`market://` 不点名，ColorOS、
   * HyperOS 自带的商城也接它，还常被设成默认。网页层的 window.open 兜底同样不点名，
   * 所以兜底也在原生里做。iOS 走 https 通用链接，只有 App Store 接得住，那边是空实现。
   */
  openStorePage(): Promise<{ opened: 'play' | 'web' | 'none' }>
}

export const StoreReview = registerPlugin<StoreReviewPlugin>('StoreReview')

/** App Store Connect → App Information → Apple ID */
const APPLE_APP_ID = '6812812939'

/**
 * App Store 评论页。走 https 而不是 itms-apps://：AppLauncher.openUrl 先 canOpenURL，
 * 自定义 scheme 要在 Info.plist 登记 LSApplicationQueriesSchemes，https 是通用链接，
 * 系统直接交给 App Store；?action=write-review 落到评论框。
 * Play 的详情页由原生 openStorePage 打开（点名 Google Play），网页层不拼链接。
 */
const APP_STORE_REVIEW_PAGE = `https://apps.apple.com/app/id${APPLE_APP_ID}?action=write-review`

/** 这一版请过没有；键带版本号，升级后有一次新的机会 */
const ASKED_KEY = 'review-asked'
/** 玩家主动去过评论页；之后一律不再请 */
const OPENED_KEY = 'review-opened'
const LAUNCH_COUNT_KEY = 'nonogram:review:launches'

/** 本次是第几次打开游戏；0 表示还没登记（测试、或 noteAppLaunch 没被调用） */
let launchOrdinal = 0
/** 本次会话里补完了几章 */
let chaptersThisSession = 0

function appVersion(): string {
  return nativeAppInfo()?.version ?? 'web'
}

/**
 * 冷启动登记一次：第几次打开游戏决定邀评走哪条规则。
 * 回前台不算新的一次——「第一次登录」说的是第一次装上打开的那一整段。
 */
export function noteAppLaunch(): number {
  let count = 0
  try {
    count = Number(localStorage.getItem(LAUNCH_COUNT_KEY)) || 0
  } catch {
    // 读不到就当第一次
  }
  count += 1
  try {
    localStorage.setItem(LAUNCH_COUNT_KEY, String(count))
  } catch {
    // 写不进去下次还是第一次；宁可多等一章，不会多请
  }
  launchOrdinal = count
  chaptersThisSession = 0
  return count
}

/** 有没有商店可去；设置面板据此决定那一行显不显示 */
export function canOpenStoreReview(): boolean {
  return distributionChannel === 'appstore' || distributionChannel === 'play'
}

/**
 * 跳到商店的评论页（设置里那一行）。
 * 真打开了才记一笔：主动来过的人不必再被请；点了没打开的人照常还会收到系统邀评。
 *
 *   - Play：原生 openStorePage 点名 Google Play，没有 Play 退到浏览器。插件不在
 *     （旧包）或 reject 都按没打开算。
 *   - App Store：AppLauncher 打不开时是正常 resolve `{ completed: false }` 而不是
 *     reject（UIApplication.open 失败），和 reject 一样退到 window.open。
 */
export function openStoreReviewPage(): void {
  if (distributionChannel === 'play') {
    void StoreReview.openStorePage().then(
      (result) => {
        if (result?.opened === 'play' || result?.opened === 'web') rememberJourney(OPENED_KEY)
      },
      () => {
        // 没打开：不记，以后照常邀评
      },
    )
    return
  }
  if (distributionChannel !== 'appstore') return
  const url = APP_STORE_REVIEW_PAGE
  const fallback = () => {
    const opened = window.open(url, '_blank', 'noopener,noreferrer')
    if (opened) rememberJourney(OPENED_KEY)
  }
  void AppLauncher.openUrl({ url }).then(
    (result) => (result?.completed ? rememberJourney(OPENED_KEY) : fallback()),
    fallback,
  )
}

/** 5×5 是上手章：教完就要分太急 */
const ONBOARDING_SIZE = 5

/**
 * 补完了一章。返回这一章该不该请系统邀评（只判定并记账，不真的去请）。
 * 每一章都要报到这里，不管最后请不请：第一次会话「第二章」的计数靠它。
 */
export function noteChapterCompleted(chapter: { size: number }): boolean {
  chaptersThisSession += 1
  if (!isStoreBuild) return false
  if (journeySeen(OPENED_KEY)) return false
  const askedKey = `${ASKED_KEY}:${appVersion()}`
  if (journeySeen(askedKey)) return false
  const firstSession = launchOrdinal <= 1
  const eligible = firstSession
    ? chaptersThisSession >= 2
    : chapter.size !== ONBOARDING_SIZE
  if (!eligible) return false
  rememberJourney(askedKey)
  return true
}

/**
 * 补完一章之后、章名完成那行字已经在屏上：该请就请。
 *
 * 返回一个「离开这张结算卡」时调用的函数：请求若还没弹出来就作废（见
 * StoreReviewPlugin.cancelReview）。本版的「已请过」在发请求前就记下了，作废或原生
 * 失败都不补请——宁可这一版少请一次，也不在别的时刻冒出来。
 */
export function requestReviewAfterChapter(chapter: { size: number }): () => void {
  if (!noteChapterCompleted(chapter)) return () => {}
  let settled = false
  void StoreReview.requestReview()
    .catch(() => {
      // 插件不在（浏览器、旧包）或 Play 不可用：不重试，本版不再请
    })
    .finally(() => {
      settled = true
    })
  return () => {
    if (settled) return
    void StoreReview.cancelReview().catch(() => {
      // 旧包没有这个方法：迟到的请求拦不住，但也不影响离开
    })
  }
}

/** 测试用：回到刚启动、什么都没登记的状态 */
export function resetStoreReviewForTests(): void {
  launchOrdinal = 0
  chaptersThisSession = 0
}
