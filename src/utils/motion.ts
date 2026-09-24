/**
 * 系统的「降低动态效果」。
 *
 * CSS 那边各自用 @media (prefers-reduced-motion: reduce) 关掉自己的动画；
 * 这个函数是给 JS 用的——凡是「等动画放完再做下一件事」的时序，在关掉动画之后
 * 那段等待也必须一并消失，否则界面就会白白卡住一段没有画面的时间。
 */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}
