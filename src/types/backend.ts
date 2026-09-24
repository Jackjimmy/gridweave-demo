/**
 * 内容后端的线上数据格式与对象路径约定。
 * 客户端与 scripts/backend 的发布脚本共用本文件，保证两端不会各自漂移；
 * 字段语义与缓存策略见 docs/references/backend-api.md。
 */

export const BACKEND_SCHEMA_VERSION = 1

/** v1/app/latest.json：Android 版本清单 */
export interface AppLatestManifest {
  schemaVersion: number
  /** 与 android/app/build.gradle 的 versionCode 同源，客户端仅比较此字段 */
  versionCode: number
  versionName: string
  /** 完整公开下载地址（含域名），客户端不做拼接 */
  apkUrl: string
  apkSha256: string
  /** 字节数，用于弹窗展示下载体积 */
  apkSize: number
  releaseNotes: string
  /** 低于此 versionCode 的客户端强制更新（弹窗不提供“稍后”） */
  minSupportedVersionCode: number
  publishedAt: string
}

export const LATEST_MANIFEST_PATH = 'v1/app/latest.json'

/** APK 按版本号命名、永不覆盖，因此可以配置一年期 immutable 缓存 */
export function apkObjectPath(versionName: string): string {
  return `v1/app/Nonogram-v${versionName}.apk`
}
