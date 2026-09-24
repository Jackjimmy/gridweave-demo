import { isInProgress } from './levelSections'
import type { PuzzleProgress } from '../types'

/**
 * 两份进度表**画出来**的东西一不一样。
 *
 * 只有一处用它：垫在当前页下面预热的那一层看哪一份进度表（见 App 的
 * bufferProgressMap）。
 *
 * 对局中棋盘每 500ms 防抖落盘一次，progressMap 就换一份新引用（见
 * usePuzzleProgress 与 Game 的 SAVE_DEBOUNCE_MS）。而背景那一层画的只有三件事：
 * 解锁没解锁、通关没通关、有没有一局打到一半——一局棋从头到尾这三样只会变一次
 * （第一次落子那下）。引用要是跟着换，藏着的册页就得每 500ms 重排一次字号
 * （fitOneLine 一次量 48 张卡，是实打实的强制同步布局），只为一面此刻根本
 * 看不见的架子。
 *
 * 所以只比「画出来的那几样」。board 与 elapsedSeconds 两项不比：它们按秒变，
 * 又没有任何一层背景页把它们画出来（首页那条「继续」读 elapsedSeconds，但首页
 * 只在没有对局时才会是上一层，那时它根本不动）。别的字段一律照原样比对——
 * 通关那一刻 completed / completedAt 立刻不同，藏着的那一层当场拿到新的解锁数，
 * 绝不会先露出旧册页再跳成新的。
 *
 * 这条判据只用来**省一次重渲染**，不用来决定给谁看什么：被揭开的那一层立刻
 * 就是「当前层」，读的是实时那一份。所以万一这里判宽了，代价也只是揭开时多
 * 一次零 DOM 改动的重渲染，不会有人看见旧数据。
 */
export function sameRenderedProgress(
  a: Record<string, PuzzleProgress>,
  b: Record<string, PuzzleProgress>,
): boolean {
  const keys = Object.keys(b)
  if (keys.length !== Object.keys(a).length) return false
  for (const id of keys) {
    const x = a[id]
    const y = b[id]
    // 一次落盘只换掉一关，其余六百来关都走这条捷径
    if (x === y) continue
    if (!x || !y) return false
    if (x.completed !== y.completed) return false
    if (x.everCompleted !== y.everCompleted) return false
    if (x.completedAt !== y.completedAt) return false
    if (x.firstClearedAt !== y.firstClearedAt) return false
    if (x.bestTimeSeconds !== y.bestTimeSeconds) return false
    // 「有没有半局」是从 board 推出来的：board 本身不比，这个结论要比
    if (isInProgress(x) !== isInProgress(y)) return false
  }
  return true
}
