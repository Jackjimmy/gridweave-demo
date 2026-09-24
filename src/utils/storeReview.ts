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
}

export const StoreReview = registerPlugin<StoreReviewPlugin>('StoreReview')

/** App Store Connect → App Information → Apple ID */
const APPLE_APP_ID = '6812812939'
/** Play 的包名。不读 nativeAppInfo().id：debug 包多一个 .debug 后缀，商店里没有它 */
const ANDROID_PACKAGE = 'jack.nonogram'

/**
 * 商店评论页。iOS 走 https 而不是 itms-apps://：AppLauncher.openUrl 先 canOpenURL，
 * 自定义 scheme 要在 Info.plist 登记 LSApplicationQueriesSchemes，https 是通用链接，
 * 系统直接交给 App Store；?action=write-review 落到评论框。
 * Android 的 market:// 由 Play 接管；没有 Play 的机器退到网页版。
 */
const REVIEW_PAGE: Record<typeof distributionChannel, string | null> = {
  appstore: `https://apps.apple.com/app/id${APPLE_APP_ID}?action=write-review`,
  play: `market://details?id=${ANDROID_PACKAGE}`,
  direct: null,
}
const PLAY_WEB_PAGE = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`

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
  return REVIEW_PAGE[distributionChannel] !== null
}

/**
 * 跳到商店的评论页（设置里那一行）。
 * 记一笔：主动来过的人不必再被请。
 */
export function openStoreReviewPage(): void {
  const url = REVIEW_PAGE[distributionChannel]
  if (!url) return
  rememberJourney(OPENED_KEY)
  void AppLauncher.openUrl({ url }).catch(() => {
    window.open(distributionChannel === 'play' ? PLAY_WEB_PAGE : url, '_blank', 'noopener,noreferrer')
  })
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

/** 补完一章之后、章名完成那行字已经在屏上：该请就请。 */
export function requestReviewAfterChapter(chapter: { size: number }): void {
  if (!noteChapterCompleted(chapter)) return
  void StoreReview.requestReview().catch(() => {
    // 插件不在（浏览器、旧包）就当没请过这回事
  })
}

/** 测试用：回到刚启动、什么都没登记的状态 */
export function resetStoreReviewForTests(): void {
  launchOrdinal = 0
  chaptersThisSession = 0
}
