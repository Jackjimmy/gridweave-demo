import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { hasFailedSaves, retryFailedSaves, subscribeSaveFailure } from '../utils/storage'

export interface SaveFailureState {
  /** 有东西没写进去，而且玩家还没把这条收掉 */
  visible: boolean
  /** 重试次数：给提示条当 key 用，重试没成功时读屏会再念一遍 */
  attempts: number
  retry: () => void
  dismiss: () => void
}

/**
 * 「进度没能保存」这条提示的状态。
 *
 * 订阅存储层而不是从 App 穿参数下来：写进去这件事发生在每一层上（对局、每日挑战、
 * 通关记录），谁失败都该让同一条提示浮出来。
 *
 * 可以收掉——写不进去不等于不能继续解题，一条赖着不走的横幅只会挡住棋盘。
 * 收掉之后再出新的失败会重新浮起来：这条提示的意义是「你现在做的事没被保存」，
 * 不是「历史上曾经失败过一次」。
 */
export function useSaveFailure(): SaveFailureState {
  const failing = useSyncExternalStore(subscribeSaveFailure, hasFailedSaves, () => false)
  const [dismissed, setDismissed] = useState(false)
  const [attempts, setAttempts] = useState(0)

  // 写成功了就把「收掉」这件事一并忘掉，下次再失败照常出声
  useEffect(() => {
    if (!failing) setDismissed(false)
  }, [failing])

  const retry = useCallback(() => {
    setAttempts((n) => n + 1)
    retryFailedSaves()
  }, [])

  const dismiss = useCallback(() => setDismissed(true), [])

  return { visible: failing && !dismissed, attempts, retry, dismiss }
}
