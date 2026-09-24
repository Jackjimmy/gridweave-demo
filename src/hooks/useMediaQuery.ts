import { useCallback, useSyncExternalStore } from 'react'

/**
 * 一条媒体查询此刻成不成立，变了就重画。
 *
 * 只给那些**结构**要按视口换、光靠 CSS 换不了的地方用（试玩版首页在宽屏上把一本
 * 的六关直接摊在四本合集下面，竖屏却是翻开一页——两种是不同的 DOM，不是同一棵树的
 * 两套样式）。纯样式的差异照旧写在 @media 里，别拿它替 CSS 干活。
 *
 * 没有 matchMedia 的环境（jsdom）一律当不成立。
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (listener: () => void) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
      const media = window.matchMedia(query)
      if (typeof media.addEventListener === 'function') {
        media.addEventListener('change', listener)
        return () => media.removeEventListener('change', listener)
      }
      // iOS 13 之前的 Safari 只有 addListener 这一对；再没有就只读一次、不跟着变
      if (typeof media.addListener === 'function') {
        media.addListener(listener)
        return () => media.removeListener(listener)
      }
      return () => {}
    },
    [query],
  )
  const read = useCallback(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia(query).matches,
    [query],
  )
  return useSyncExternalStore(subscribe, read, () => false)
}
