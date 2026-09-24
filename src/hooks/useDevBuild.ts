import { useSyncExternalStore } from 'react'
import { isDevBuild, nativeAppInfo, subscribeDevBuild } from '../utils/devBuild'
import type { NativeAppInfo } from '../utils/devBuild'

/** 组件里读「是不是开发包」。原生层异步报上来之后会自动重渲染。 */
export function useDevBuild(): boolean {
  return useSyncExternalStore(subscribeDevBuild, isDevBuild, isDevBuild)
}

/** 原生包信息异步回来时让设置页刷新；正式包也需要看到版本号，不只 DEV 包。 */
export function useNativeAppInfo(): NativeAppInfo | null {
  return useSyncExternalStore(subscribeDevBuild, nativeAppInfo, () => null)
}
