/**
 * 内容后端基础地址（Cloudflare R2 + 自定义域名，见 docs/references/backend-api.md）。
 *
 * 必须是自有域名：*.workers.dev / *.pages.dev / R2 默认域名在大陆被 SNI 阻断。
 * 域名就绪前保持空串——客户端的更新检查/每日挑战在空值下整体停用，
 * 发布脚本也会拒绝上传，避免把带占位地址的清单发到线上。
 */
export const CONTENT_BASE_URL: string = 'https://cdn.nonogram.com.cn'

/**
 * 动态 API 基础地址（Cloudflare Worker：匿名打点 /t 等）。
 * 与 AUTH_BASE_URL（src/config/auth.ts）分开配置：登录入口有独立的启用开关，
 * 打点则随本值非空即启用。留空时打点整体停用。
 */
export const API_BASE_URL: string = 'https://api.nonogram.com.cn'

/** 拼接线上对象的完整公开地址；base 未配置时返回 null，调用方按功能停用处理 */
export function contentUrl(path: string): string | null {
  if (!CONTENT_BASE_URL) return null
  return `${CONTENT_BASE_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
}
