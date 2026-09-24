/**
 * 「这一摞要买完整版才打得开」的那把锁。
 *
 * 首页主题卡、画册页分区抬头、每日日历上的往期共用一枚，三处必须是同一个形状：
 * 玩家一次会看见其中两处，形状不同就得重新认一遍「这个标记是什么意思」。
 *
 * 与 BackIcon 同一套写法（尺寸落在 CSS 上，理由见那个文件）；aria-hidden，
 * 「锁着」这件事由带它的那个元素用文字说清楚，不靠图标本身传达。
 */
export function LockIcon({ size = 11 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      style={{ width: size, height: size, flexShrink: 0, display: 'block' }}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.4" fill="currentColor" />
      <path
        d="M8 10.5V7.75a4 4 0 0 1 8 0V10.5"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  )
}
