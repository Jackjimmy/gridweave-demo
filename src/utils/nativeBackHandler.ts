import { Capacitor } from '@capacitor/core'
import { App as CapApp } from '@capacitor/app'

/**
 * 安卓：这一下返回归谁管。
 *
 * Capacitor 一进门就往 OnBackPressedDispatcher 挂了一条常开的回调（见
 * node_modules/@capacitor/app 的 AppPlugin.load），于是系统认为**每一次**返回都被
 * 应用消费掉了。代价在根页：那一下本该交还系统，走正常的 back-to-home——应用回到
 * 后台、留在最近任务里，下次是热启动；系统还会顺手给上它自己的返回预览动画
 * （targetSdk 36，这段动画本来就默认有，只是被那条常开回调挡住了）。挡着它，
 * 根页的返回就只剩 exitApp() 一条路，那是 activity.finish()，硬关，下次冷启。
 *
 * 所以按当前层级开关那条回调：站在根页就把它关掉，让系统自己处理；页面还有得退、
 * 或者身上压着浮层，就开着，返回照旧归网页。
 *
 * 只有安卓有这件事。iOS 的 App 插件没有 backButton 事件，网页端更没有；两处都直接
 * 返回，免得白发一次桥调用再吞一个 unimplemented。
 */
export function setAndroidBackHandled(handled: boolean): void {
  if (Capacitor.getPlatform() !== 'android') return
  void CapApp.toggleBackButtonHandler({ enabled: handled }).catch(() => {})
}
