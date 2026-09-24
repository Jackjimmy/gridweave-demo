import { flushSync } from 'react-dom'
import { prefersReducedMotion } from './motion'

/**
 * 整页回退转场：返回键与各页那枚返回箭头走这条（iOS 左缘手势由原生跟手，不走这里）。
 *
 * 这两样都只给出一个「回退」的结论，页面随即被换掉。没有过渡的那一瞬，玩家分不清
 * 自己是退回了上一层，还是跳去了别处——方向信息全丢在换页里了。这里借浏览器的
 * View Transitions 把这次换页拍成两张，一张退开、一张跟上来，把方向补回去。
 *
 * 具体怎么动按平台分两套，都在 global.css 的 .nav-back 里：iOS 那套是整页横扫，
 * 照着原生左缘手势的收尾做；安卓那套是小位移加淡出，照着系统自己的返回观感做。
 *
 * 快照与合成都交给合成器，React 只负责在回调里同步提交这一次状态变更；
 * 转场期间没有额外的 React 渲染，也没有并存的两棵视图树。
 */
const BACK_CLASS = 'nav-back'

/*
 * 连着退两级时，第二次转场会让第一次被浏览器跳过、提前兑现 finished。用计数而不是
 * 布尔值收尾，才不会在后一次还在放的时候把类名摘掉，把它退化成一次默契的闪现。
 */
let running = 0

/**
 * 用 update 提交一次「回退」的状态变更，并在支持的平台上配上回退转场。
 *
 * 旧 WebView 没有这个 API，系统开了「降低动态效果」时也不该有滑动——两种情况
 * 都直接改状态。没有动画是可以接受的降级，界面卡住不是。
 */
export function runBackTransition(update: () => void): void {
  if (
    typeof document === 'undefined' ||
    typeof document.startViewTransition !== 'function' ||
    prefersReducedMotion()
  ) {
    update()
    return
  }

  const root = document.documentElement
  running += 1
  root.classList.add(BACK_CLASS)
  const transition = document.startViewTransition(() => {
    // 旧页快照此刻已经拍好，这一次提交必须同步落到 DOM，转场才知道新页长什么样
    flushSync(update)
  })
  void transition.finished
    .catch(() => {})
    .finally(() => {
      running -= 1
      if (running === 0) root.classList.remove(BACK_CLASS)
    })
}
