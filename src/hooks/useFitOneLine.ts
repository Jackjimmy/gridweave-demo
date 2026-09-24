import { useCallback, useLayoutEffect, useRef } from 'react'
import { fitOneLine } from '../utils/fitFontSize'

/**
 * 把一个「必须待在一行里」的元素收进它自己的盒子。
 *
 * 各页顶栏那行页名用它。顶栏三样是并排的：返回、页名、右端那块计数；页名折成
 * 两行会把整条顶栏顶高，底下整页跟着往下挪一截。中文的「我的收藏」四个字一行
 * 绰绰有余，换成「Meine Sammlung」就正好差一点——而差的那一点随语言变，
 * 不随视口变，所以 CSS 的 clamp() 管不了它（clamp 按视口取值，不按内容）。
 *
 * 元素要先在 CSS 里写死 `white-space: nowrap` 与 `overflow: hidden`，
 * 「超出多少」才量得出来；收到下界仍放不下的由 text-overflow 兜底。
 *
 * 三条重算触发与册页那一趟同源（见 AlbumPage）：容器变宽（RO）、旋屏分屏
 * （resize）、字体换成最终那一套（fonts.ready）——缺一条都出过问题。
 */
export function useFitOneLine<T extends HTMLElement>(min: number) {
  const ref = useRef<T>(null)

  const fit = useCallback(() => {
    const el = ref.current
    // 没有布局盒子（祖先藏着、还没进文档）时量出来永远是 0，量了也是白量
    if (!el || el.getClientRects().length === 0) return
    fitOneLine([el], min)
  }, [min])

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    fit()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit)
    observer?.observe(el)
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
