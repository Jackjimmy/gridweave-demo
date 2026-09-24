import { useCallback, useSyncExternalStore } from 'react'
import { demoRoom } from '../config/demo'

/**
 * 视口此刻的「宽裕度」（见 config/demo.ts 的 demoRoom），变了就重画。
 *
 * 读的是 innerWidth / innerHeight——与 CSS 里的 100dvw / 100dvh 同一对数。
 * 没有 window 的环境（SSR、jsdom 的桩）给 0，即手机那一档。
 */
export function useViewportRoom(): number {
  const subscribe = useCallback((listener: () => void) => {
    if (typeof window === 'undefined') return () => {}
    window.addEventListener('resize', listener)
    window.addEventListener('orientationchange', listener)
    // resize 事件有时赶在尺寸落定之前到；根元素的 ResizeObserver 在排版之后才报，两路都接
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => listener())
    observer?.observe(document.documentElement)
    return () => {
      window.removeEventListener('resize', listener)
      window.removeEventListener('orientationchange', listener)
      observer?.disconnect()
    }
  }, [])
  const read = useCallback(
    () => (typeof window === 'undefined' ? 0 : demoRoom(window.innerWidth, window.innerHeight)),
    [],
  )
  return useSyncExternalStore(subscribe, read, () => 0)
}
