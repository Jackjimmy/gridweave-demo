/**
 * 补给读屏和键盘的那一下焦点：焦点照给，蓝框按下不表。
 *
 * WebKit 把脚本挪的焦点也算进 :focus-visible——页面还没被指针「正式」碰过时尤其如此，
 * 而本作的点击多半走 touch 那一路（click 常被 preventDefault 掉），浏览器更没机会知道
 * 上一步是手点的。于是 iOS 上每次开局后头一回：通关面板升起，「下一关」凭空套一个蓝框；
 * 从关卡退回选关页，那张卡也套一个。手指从没点出过它们。
 *
 * 焦点仍要给——读屏要念出下一步落在哪儿，键盘要接着往下走。所以只收描边：打一个
 * data-quiet-focus，由各自的 CSS 对这一次去掉 outline；焦点一离开、或人真按了键盘，
 * 记号即刻撤掉，键盘走位照样看得见自己在哪儿。
 *
 * 返回值撤销这一次记号并摘掉监听，交给 effect 的清理函数。
 */
export function quietFocus(el: HTMLElement): () => void {
  // Keyboard-triggered navigation must keep its destination visible.
  if (document.documentElement.dataset.inputModality === 'keyboard') {
    el.focus({ preventScroll: true })
    return () => {}
  }
  el.dataset.quietFocus = 'true'
  el.focus({ preventScroll: true })
  const reveal = () => el.removeAttribute('data-quiet-focus')
  el.addEventListener('blur', reveal, { once: true })
  el.addEventListener('keydown', reveal, { once: true })
  return () => {
    el.removeEventListener('blur', reveal)
    el.removeEventListener('keydown', reveal)
    reveal()
  }
}
