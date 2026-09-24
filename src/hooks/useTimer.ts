import { useCallback, useEffect, useState } from 'react'

interface TimerState {
  elapsed: number
  reset: () => void
}

/**
 * 秒级计时器。running 为 false 或页面切到后台时暂停。
 * initialSeconds 用于续玩恢复；组件按关卡 key 重挂载时自动重置。
 */
export function useTimer(running: boolean, initialSeconds = 0): TimerState {
  const [elapsed, setElapsed] = useState(initialSeconds)
  const reset = useCallback(() => setElapsed(0), [])

  useEffect(() => {
    if (!running) return
    let intervalId: ReturnType<typeof setInterval> | null = null

    const start = () => {
      if (intervalId === null) {
        intervalId = setInterval(() => setElapsed((s) => s + 1), 1000)
      }
    }
    const stop = () => {
      if (intervalId !== null) {
        clearInterval(intervalId)
        intervalId = null
      }
    }
    const onVisibilityChange = () => {
      if (document.hidden) stop()
      else start()
    }

    if (!document.hidden) start()
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [running])

  return { elapsed, reset }
}

export function formatSeconds(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
