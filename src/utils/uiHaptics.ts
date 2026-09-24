import { haptics } from './haptics'

/**
 * 全站可点击元素的触感，一处安装，事件委托到 document。
 *
 * 为什么不逐个组件接：改这一版之前，17 个组件里有 60 多个可点击元素，只有 5 处接了
 * 触感。逐个接不只是 60 处改动——以后每加一个按钮都得记得接一次，而漏掉的那个不会
 * 报错，只会安静地少一记，等用户反馈才发现。委托一次，以后新增的按钮自动就有。
 *
 * **按下只记录，松手才发。** 第一版发在 pointerdown 上，结果左右翻页选主题时每一
 * 次滑动的起手都当成了点击。点击和滑动的区别只有松手那一刻才知道，所以判定必须等
 * 到 pointerup：手指移动超过 TAP_SLOP_PX，或者松手时已经不在按下的那个控件上，
 * 这一次就不算点击。代价是反馈比按下去晚了一个抬手的时间，这是分辨手势必须付的。
 *
 * **按下态由这里显式给，不再等 CSS 的 `:active`。** 实测在可横滑的书架里，Chrome 要先
 * 确定这一笔不是滑动才肯提交 `:active`——快点（≤200ms）根本够不着，卡片的按下动画整
 * 个不会出现，而这与本模块装不装无关（单变量对照测过）。所以按下的瞬间直接给命中的
 * 控件打一个 `data-pressed`，CSS 那边与 `:active` 并列即可（见各 module.css）。
 *
 * 于是「按下有视觉、松手才有触感」：翻页时看得见按下动画但不震，正是想要的分工。
 *
 * 自己管触感的地方标 `data-haptic="self"`——**它只退出触感，不退出按下态**。那些地方
 * 有自己的振动语义（撤销、模式滑块、试听），但按下去该有的视觉反馈和别处没有区别。
 *
 *   - 棋盘不需要标：格子是 div，不在选择器里（见 components/Board）
 *   - 操作栏：撤销和模式切换有自己的语义，也有自己的拖动手势
 *   - 设置面板的分段控件：选中时要试听对应的手感，不是通用 selection
 *   - 教学翻页：用 step()
 *   - 触感实验室：它是量具，多一记就测不准了
 */
const INTERACTIVE = [
  'button',
  'a[href]',
  '[role="button"]',
  '[role="tab"]',
  'summary',
  'select',
  'input[type="checkbox"]',
  'input[type="radio"]',
].join(', ')

const SELF_MANAGED = '[data-haptic="self"]'

/**
 * 手指在按下与松手之间允许的位移。超过就判定为滑动，不是点击。
 *
 * 10px 对齐各家的 touch slop（Android 的 ViewConfiguration 约 8dp）。再小会把
 * 「按住时手抖」误判成滑动，再大则拦不住轻轻一划的翻页。
 */
const TAP_SLOP_PX = 10

/*
 * 这里曾有一组自检计数器（seen / matched / fired / last），把「按下去没反应」拆成
 * 事件层没派发、没命中控件、命中了没发出去三种毛病。读它的只有触感实验室，
 * 实验室撤掉之后没有任何人读，剩下的就是每一次 pointerdown / pointerup 都要记一笔
 * 的账。要查同一类问题时在这几处打断点即可，不必让正式包常年背着这本账。
 */

interface PendingTap {
  pointerId: number
  x: number
  y: number
  control: HTMLElement
  /** 松手时该不该发触感。按下态与它无关，两件事分开。 */
  haptic: boolean
}

/** 按下态的标记。CSS 里与 `:active` 并列使用。 */
const PRESSED_ATTR = 'data-pressed'

/** 从事件目标往上找最近的、真的能按的控件；按不动的一律返回 null。 */
function controlFor(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null
  const control = target.closest(INTERACTIVE)
  if (!(control instanceof HTMLElement)) return null
  // 原生 disabled 的控件本来就收不到 pointer 事件，这里拦的是 aria-disabled
  // 那种「看着能点其实不能点」的，按下去不该有反馈。
  if (control.hasAttribute('disabled')) return null
  if (control.getAttribute('aria-disabled') === 'true') return null
  return control
}

/** 这个控件的触感是不是由它自己管。只影响触感，不影响按下态。 */
function selfManaged(control: HTMLElement): boolean {
  return control.closest(SELF_MANAGED) !== null
}

/** 返回卸载函数；App 卸载时解绑，测试里也靠它复位。 */
export function installUiHaptics(): () => void {
  if (typeof document === 'undefined') return () => {}

  let pending: PendingTap | null = null

  /** 收掉按下态并丢弃这一次候选。松手、划走、被接管、以及下一次按下都会走到这里。 */
  const release = () => {
    pending?.control.removeAttribute(PRESSED_ATTR)
    pending = null
  }

  const onPointerDown = (event: PointerEvent) => {
    // 多指时只认第一根：两根手指同时落在两个按钮上不该震两记。
    // 显式比 false——jsdom 合成的事件没有这个字段，不能让它把整条路径判死。
    if (event.isPrimary === false) return
    // 上一次要是没收干净（元素被卸载、pointerup 没到），这里兜住。
    release()
    const control = controlFor(event.target)
    if (!control) return
    const haptic = !selfManaged(control)
    // 按下的瞬间就给视觉，不等 Chrome 决定这一笔是不是滑动。
    control.setAttribute(PRESSED_ATTR, '')
    pending = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, control, haptic }
  }

  const movedTooFar = (tap: PendingTap, event: PointerEvent) =>
    Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > TAP_SLOP_PX

  const onPointerMove = (event: PointerEvent) => {
    // 只在有候选时才算距离；没候选时这个监听器什么都不做。
    if (pending === null || event.pointerId !== pending.pointerId) return
    // 划出去就收掉按下态：手指已经在翻页了，卡片不该还压着。
    if (movedTooFar(pending, event)) release()
  }

  const onPointerUp = (event: PointerEvent) => {
    const tap = pending
    release()
    if (tap === null || event.pointerId !== tap.pointerId) return
    if (!tap.haptic) return
    if (movedTooFar(tap, event)) return
    // 松手时手指已经划到别的控件（或空白）上，这一次不算点在原来那个按钮上。
    if (controlFor(event.target) !== tap.control) return
    haptics.selection()
  }

  const onPointerCancel = () => {
    // 手势被上层接管（滚动、翻页、返回手势）时到达，这一次一定不是点击。
    release()
  }

  /*
   * 键盘激活没有 pointer 事件那一路。Enter / 空格触发的 click 的 detail 是 0，
   * 指针点出来的是 1 起步——用它分辨，免得给同一次点击发两记。
   * 这条与操作栏里 selectMode 用的是同一个判据。
   */
  const onClick = (event: MouseEvent) => {
    if (event.detail !== 0) return
    const control = controlFor(event.target)
    if (!control || selfManaged(control)) return
    haptics.selection()
  }

  /*
   * 捕获阶段：组件自己 stopPropagation 也不影响这一记。
   *
   * **必须 passive。** 这几个监听器只观察、从不 preventDefault，但只要它们是非
   * passive 的，Chrome 就得先把事件派发给 JS、等它返回，才能决定这一笔是滚动还是
   * 点击——这个等待会推迟它提交 :active。症状是点进画册时卡片的按下动画整个不见了
   * （.album:active 见 LibraryPage.module.css）。声明成 passive 就没有这层等待。
   */
  const observe = { capture: true, passive: true } as const
  document.addEventListener('pointerdown', onPointerDown, observe)
  document.addEventListener('pointermove', onPointerMove, observe)
  document.addEventListener('pointerup', onPointerUp, observe)
  document.addEventListener('pointercancel', onPointerCancel, observe)
  document.addEventListener('click', onClick, observe)

  return () => {
    release()
    document.removeEventListener('pointerdown', onPointerDown, true)
    document.removeEventListener('pointermove', onPointerMove, true)
    document.removeEventListener('pointerup', onPointerUp, true)
    document.removeEventListener('pointercancel', onPointerCancel, true)
    document.removeEventListener('click', onClick, true)
  }
}
