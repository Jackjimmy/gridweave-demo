import { App as CapApp } from '@capacitor/app'

/**
 * 这个包是不是「开发包」。开发菜单只在它为真时挂出来。
 *
 * 判据三条，满足其一即可：
 *   1. 原生包名以 .debug 结尾——Android 的 debug 变体（见 android/app/build.gradle）
 *   2. 版本号以 -dev 结尾——Android 的 versionNameSuffix，以及 iOS Debug 配置的
 *      MARKETING_VERSION（见 ios/App/App.xcodeproj）
 *   3. 跑在 vite 开发服务器上——import.meta.env.DEV
 *
 * 第 2 条是 2026-09-01 补的。在那之前 iOS 的 Debug 和 Release 用同一个 bundle id，
 * 第 1 条永远不成立，**开发菜单在 iOS 真机上从来就没出现过**。没有给 iOS 加
 * `.debug` 后缀是因为那会让它变成另一个 app：装成两个图标、本地数据分家、还要
 * 重新过一遍签名。版本后缀能达到同样的目的，且两端用的是同一条判据。
 *
 * 正式包三条都不成立：包名没有后缀，版本号没有后缀，DEV 在打包时是字面量 false。
 * 菜单的代码仍在包里（原生判据是运行时的，摇不掉），但没有任何一条路径能把它挂出来。
 *
 * 不读 BuildConfig.DEBUG 是因为那要开 gradle 的 buildConfig 生成再写一个插件
 * 把值递到 JS 这边；包名与版本后缀本来就有，顺手当判据最省。
 */
const DEBUG_SUFFIX = '.debug'
const DEV_VERSION_SUFFIX = '-dev'

let devBuild: boolean = import.meta.env.DEV
let appInfo: NativeAppInfo | null = null
const listeners = new Set<() => void>()

export interface NativeAppInfo {
  /** 包名，例：jack.nonogram.debug */
  id: string
  /** versionName，例：1.5.1-dev */
  version: string
  /** versionCode */
  build: string
}

export function isDevBuild(): boolean {
  return devBuild
}

/** 原生层报上来的包信息；浏览器里没有原生层，返回 null */
export function nativeAppInfo(): NativeAppInfo | null {
  return appInfo
}

export function subscribeDevBuild(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * 向原生层问一次包信息。App 启动时调用一次即可。
 * 桥调用是异步的，所以 isDevBuild 一开始可能还是 false——订阅者会在这里被叫醒。
 */
export async function primeDevBuild(): Promise<void> {
  try {
    const info = await CapApp.getInfo()
    appInfo = { id: info.id, version: info.version, build: info.build }
    if (!info.id.endsWith(DEBUG_SUFFIX) && !info.version.endsWith(DEV_VERSION_SUFFIX)) return
    devBuild = true
  } catch {
    // 浏览器里 getInfo 未实现，保持 import.meta.env.DEV 的判断
    return
  } finally {
    for (const listener of listeners) listener()
  }
}

/** 打包时钉进去的 web 侧构建戳（commit + 时间），见 vite.config.ts */
export function webBuildStamp(): string {
  return import.meta.env.VITE_BUILD_STAMP ?? '开发服务器'
}

/** 当前 Web 资源所基于的 Git 提交；dirty 表示包里还含有未提交修改。 */
export function webGitRevision(): string {
  return import.meta.env.VITE_GIT_REVISION ?? '开发服务器'
}

/** 这份 Web 资源的打包时间。它也参与“本版本首次启动”记录的隔离。 */
export function webBuildTime(): string {
  return import.meta.env.VITE_BUILD_TIME ?? 'dev-server'
}

const INSTALL_TIME_PREFIX = 'nonogram:build-installed:'

/**
 * Capacitor 没有跨平台的“安装日期”接口。以构建时间区分每一个包，并在这个包第一次
 * 启动时记下时间：更新后会生成新键，旧包不会冒充刚装的新包。
 */
export function currentBuildInstalledAt(): string {
  const key = `${INSTALL_TIME_PREFIX}${webBuildTime()}`
  try {
    const existing = localStorage.getItem(key)
    if (existing) return existing
    const installedAt = new Date().toISOString()
    localStorage.setItem(key, installedAt)
    return installedAt
  } catch {
    return new Date().toISOString()
  }
}
