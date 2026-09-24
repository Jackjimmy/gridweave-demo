interface BackIconProps {
  size?: number
}

/**
 * 统一的返回箭头。顶栏、画册页、我的收藏、每日挑战四处共用。
 *
 * 不使用旋转后的 CSS 边框：从前每页各拼一个 11×11 的 span，只留左、下两条 2px
 * 边框再 rotate(45deg)。转出来的不是箭头，是两条被转过来的边——尖角是直角方头
 * 对接，笔画末端斜切，粗细还跟着旋转后的像素网格摆。WKWebView 的像素对齐与
 * Chromium 不同，在部分 iPhone 上会直接退化成一条斜线。
 *
 * 尺寸必须落在 CSS 上，不能只写 width/height 属性：iOS 16 WebKit 把 flex/grid
 * 里的 SVG 按固有尺寸重新量过，属性不作数，图标于是缩成一小团（真机 iPhone X
 * 上 22pt 的图标只画出约 8pt）。显式给出 CSS 宽高并禁止收缩，任何引擎都没有
 * 重算的余地——ActionBar 的 .glyph 一直是这么写的，那几个图标从没出过问题。
 */
export function BackIcon({ size = 24 }: BackIconProps) {
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
      <path
        d="M14.5 5.5 8 12l6.5 6.5"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
