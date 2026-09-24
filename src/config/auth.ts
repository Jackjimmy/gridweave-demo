/**
 * 认证 API 基础地址（Cloudflare Worker，见 server/README.md）。
 * 生产填 https://api.<域名>；留空时登录入口整体隐藏，App 保持纯游客模式。
 * 商店渠道（Play / App Store）一律留空：那两条线上没有账号系统。
 * 本地联调用环境变量：VITE_AUTH_BASE_URL=http://localhost:8787 npm run dev
 *
 * 单独成文件（不并入 config/backend.ts）：backend.ts 被 tsx 发布脚本引用，
 * 而 import.meta.env 只在 Vite 构建里存在。
 */
import { isStoreBuild } from './distribution'

const configured: string = ''

export const AUTH_BASE_URL: string = isStoreBuild ? '' : (import.meta.env.VITE_AUTH_BASE_URL ?? configured)

/** 登录功能是否可用；不可用时 UI 不渲染任何账号入口 */
export function authAvailable(): boolean {
  return AUTH_BASE_URL !== ''
}
