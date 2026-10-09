import { useEffect } from 'react'
import type { RefObject } from 'react'
import { runTopBackHandler } from './useBackHandler'
import { quietFocus } from '../utils/quietFocus'

/*
 * 弹窗的键盘焦点：开时进来、Tab 在里面转、关后回到触发处。
 *
 * 不给背景挂 inert。背景本来就被遮罩挡着点不到，键盘出不去由下面的 Tab 循环管，
 * 读屏有 aria-modal；再去给整条祖先链的兄弟节点写 inert，换来的只是多一层保险，
 * 代价却是每次开关都在入场动画那一帧改一大片 DOM，还要和 App 页面层声明式的
 * inert={!active} 抢同一个属性、把必须点得动的重试提示（见 RetryNotice）一起冻住。
 *
 * Esc 不直接关自己，交给返回栈（见 useBackHandler）：与安卓返回键、iOS 左缘、
 * 浏览器后退同一个出口，只收最上面那一层。弹窗里再叠一层时，Esc 收的是那一层。
 * 所以用这个钩子的弹窗自己要压栈。
 *
 * 脚本挪的焦点（开时进来、关后归还）不滚页面、不画描边，与项目里别处一样（见 quietFocus）。
 * 只有 Tab 循环是人按出来的，那一下照常显示焦点框。
 */
export function useModalFocus(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusable = () => [...dialog.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]')]
      .filter(node => node.tabIndex >= 0 && !node.matches(':disabled') && !node.closest('[hidden], [inert], [aria-hidden="true"]') && getComputedStyle(node).display !== 'none' && getComputedStyle(node).visibility !== 'hidden')
    let release = () => {}
    const first = () => {
      release()
      release = quietFocus(focusable()[0] ?? dialog)
    }
    first()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // 捕获阶段先接住，栈顶那层自己的 Esc 监听就不会再收一次
        if (runTopBackHandler()) { event.preventDefault(); event.stopPropagation() }
        return
      }
      if (event.key !== 'Tab') return
      const nodes = focusable()
      const active = document.activeElement
      if (!nodes.length) { event.preventDefault(); dialog.focus(); return }
      if (!dialog.contains(active) || (event.shiftKey ? active === nodes[0] : active === nodes[nodes.length - 1])) {
        event.preventDefault(); (event.shiftKey ? nodes[nodes.length - 1] : nodes[0]).focus()
      }
    }
    const onFocus = (event: FocusEvent) => { if (!dialog.contains(event.target as Node)) first() }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('focusin', onFocus)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('focusin', onFocus)
      release()
      if (trigger?.isConnected) trigger.focus({ preventScroll: true })
    }
  }, [ref])
}
