/**
 * 游客身份：首次启动本地生成，零网络请求（离线优先，见 docs/references/backend-api.md 第 6 节）。
 * 这个 ID 不上报服务器；将来做进度云同步时，用它把本机进度合并进登录账号。
 */
const GUEST_ID_KEY = 'nonogram:guest:id'

function generateId(): string {
  // 老 WebView 可能没有 randomUUID；退化实现只求唯一性，不承担安全职责
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** 冷启动调用一次：已有则复用，保证游客身份跨会话稳定 */
export function getOrCreateGuestId(): string | null {
  try {
    const existing = localStorage.getItem(GUEST_ID_KEY)
    if (existing) return existing
    const id = generateId()
    localStorage.setItem(GUEST_ID_KEY, id)
    return id
  } catch {
    // 隐私模式等异常静默降级：游客身份缺失不影响游玩
    return null
  }
}
