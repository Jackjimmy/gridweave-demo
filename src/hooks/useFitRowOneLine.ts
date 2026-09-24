import { useCallback, useLayoutEffect, useRef } from 'react'
import { fitRowOneLine } from '../utils/fitFontSize'

/** 这一行里要一起收字号的那几条文字 */
export const FIT_ROW_ATTR = 'data-fit-row'

/**
 * 把一行里并排的几条文字一起收进这一行，收到同一个字号。
 *
 * 用在结算卡底下那两枚按钮上：它们必须待在同一行——卡片一长高就把刚揭晓的
 * 那幅画往上顶，而那幅画才是这一刻的主角。哪种语言的哪一对词会超出去不由
 * 视口决定（德语「Zurück zur Auswahl」＋「Nächstes Kapitel」在 375px 上
 * 正好差一点），CSS 的 clamp() 按视口取值，管不了它。
 *
 * 返回的 ref 挂在**这一行的容器**上，要收的每条文字标 data-fit-row。
 *
 * 三条重算触发与顶栏那一趟同源（见 useFitOneLine）：容器变宽（RO）、
 * 旋屏分屏（resize）、字体换成最终那一套（fonts.ready）。
 */
export function useFitRowOneLine<T extends HTMLElement>(min: number) {
  const ref = useRef<T>(null)

  const fit = useCallback(() => {
    const row = ref.current
    // 没有布局盒子（祖先藏着、还没进文档）时量出来永远是 0，量了也是白量
    if (!row || row.getClientRects().length === 0) return
    fitRowOneLine(row.querySelectorAll<HTMLElement>(`[${FIT_ROW_ATTR}]`), min)
  }, [min])

  useLayoutEffect(() => {
    const row = ref.current
    if (!row) return
    fit()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit)
    observer?.observe(row)
    window.addEventListener('resize', fit)
    let alive = true
    void document.fonts?.ready.then(() => {
      if (alive) fit()
    })
    return () => {
      alive = false
      observer?.disconnect()
      window.removeEventListener('resize', fit)
    }
  }, [fit])

  return ref
}
