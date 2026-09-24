import { DEFAULT_WAVE, REVEAL_TIMING, getRevealDurationMs } from '../Board/revealTimeline'
import type { RevealOrigin } from '../Board/revealTimeline'

/**
 * rAF 不推进时（切后台等）兜底落终态所留的余量。
 *
 * 比揭晓时长本身宽出这么多，是因为 canvas 的计时锚在第一帧回调、而定时器从
 * effect 就开始跑：两者之间隔着胜利那一帧的重渲染，几十毫秒的偏差是常态。
 * 余量太薄，兜底定时器就会在动画自然结束前抢跑，把最后一道波切掉。
 * 只要小于 REVEAL_ADMIRE_MS，落终态就仍然发生在结算卡升起之前。
 */
export const REVEAL_BUFFER_MS = 300

/**
 * 揭晓落幕到结算卡滑入之间的「欣赏窗口」。
 *
 * 玩家刚把一张画解出来，这一秒是整局的高潮；从前是落幕 150ms 就被结算框盖住，
 * 等于自己打断自己。留出这段空档让画面独处：线索已经淡出、棋盘上移居中，
 * 屏幕上只剩那张画，然后结算卡才从底部升上来——而且不遮挡它。
 *
 * 这段窗口不是干等，而是排了三拍（时长见对应 CSS，改任一处都要一起核对）：
 *   0.00–0.74s  棋盘吸气收束      Board.module.css  boardSettle
 *   0.30–0.90s  「关卡解锁！」浮现  Game.module.css   unlockIn
 *   0.26–1.16s  棋盘上移让位      Game.module.css   .layout transition
 * 结算卡定在 1.35s，与棋盘停稳错开 190ms——三件事依次发生，不再挤成一团。
 */
export const REVEAL_ADMIRE_MS = 1350

/** 结算卡提前挂载的时间；DOM、样式和首次光栅先在屏外准备好。 */
export const WIN_CARD_PREMOUNT_MS = 400

/**
 * 结算卡的出现时刻 = 整段揭晓 + 欣赏窗口。
 * 使用实际 solution 而不是棋盘理论右下角，避免图案较靠前时产生无意义等待。
 */
export function getWinModalDelayMs(
  solution: number[][],
  hasScene = false,
  origin: RevealOrigin | null = null,
): number {
  return getBoardRevealDurationMs(solution, hasScene, origin) + REVEAL_ADMIRE_MS
}

export function getWinModalMountDelayMs(
  solution: number[][],
  hasScene = false,
  origin: RevealOrigin | null = null,
): number {
  return Math.max(0, getWinModalDelayMs(solution, hasScene, origin) - WIN_CARD_PREMOUNT_MS)
}

/**
 * 棋盘揭晓动画的总时长。时序模型见 Board/revealTimeline.ts：
 * 整段已按棋盘尺寸归一化，因此同尺寸的关卡时长一致，不随起点位置漂移。
 */
export function getBoardRevealDurationMs(
  solution: number[][],
  hasScene = false,
  origin: RevealOrigin | null = null,
): number {
  return getRevealDurationMs(solution, hasScene, REVEAL_TIMING, DEFAULT_WAVE, origin)
}
