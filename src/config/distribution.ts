/**
 * 发行渠道。由专用构建命令选择（`vite build --mode play|appstore`），不接受
 * VITE_* 环境变量覆盖——渠道决定要不要收钱，不能让一个环境变量悄悄改口。
 *
 *  - play：Google Play，付费墙走 Google Play Billing
 *  - appstore：Apple App Store，付费墙走 StoreKit 2
 *  - direct：官网直装 APK 与 Web 预览，全量免费，界面上一处付费痕迹都没有
 *
 * 三条线各自独立：Play 与 App Store 的购买互不相通（没有账号系统，也不做跨平台
 * 互认），direct 从来就没有付费这回事。
 */
export type DistributionChannel = 'play' | 'appstore' | 'direct'

const MODE = import.meta.env.MODE

export const distributionChannel: DistributionChannel =
  MODE === 'play' ? 'play' : MODE === 'appstore' ? 'appstore' : 'direct'

export const isPlayBuild = distributionChannel === 'play'
export const isAppStoreBuild = distributionChannel === 'appstore'

/**
 * 有商店、有付费墙的渠道（Play 或 App Store）。
 *
 * 「这台机器上买得到东西」的判断读这个，不要各自去列 `isPlayBuild || isAppStoreBuild`
 * ——多列一次就多一处将来接新商店时会漏掉的地方。
 */
export const isStoreBuild = isPlayBuild || isAppStoreBuild
