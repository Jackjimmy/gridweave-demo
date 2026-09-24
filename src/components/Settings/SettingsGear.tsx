/**
 * 设置齿轮。八齿的经典轮廓，不做简化——齿轮是这个位置上唯一不需要学的图标，
 * 减齿或者只画一个圈都会让它退回成「某个圆形按钮」。
 * 齿廓由极坐标算出来（外径 9.6、齿根 6.9、每 45° 一齿），圆角接头交给 linejoin。
 */
export function SettingsGear({ size = 22 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      /*
       * 尺寸必须落在 CSS 上，不能只写 width/height 属性。
       *
       * iOS 16 WebKit 把 flex/grid 里的 SVG 按固有尺寸重新量过，属性不作数，
       * 图标于是缩成一小团（真机 iPhone X 上 22pt 的齿轮只画出约 8pt）。
       * 显式给出 CSS 宽高、并禁止收缩，任何引擎都没有重算的余地——
       * ActionBar 的 .glyph 一直是这么写的，那几个图标从来没出过问题。
       */
      style={{ width: size, height: size, flexShrink: 0, display: 'block' }}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M9.8 5.5 L10.2 2.6 L13.8 2.6 L14.2 5.5 L15.1 5.8 L17.4 4.0 L20.0 6.6 L18.2 8.9 L18.5 9.8 L21.4 10.2 L21.4 13.8 L18.5 14.2 L18.2 15.1 L20.0 17.4 L17.4 20.0 L15.1 18.2 L14.2 18.5 L13.8 21.4 L10.2 21.4 L9.8 18.5 L8.9 18.2 L6.6 20.0 L4.0 17.4 L5.8 15.1 L5.5 14.2 L2.6 13.8 L2.6 10.2 L5.5 9.8 L5.8 8.9 L4.0 6.6 L6.6 4.0 L8.9 5.8 Z" />
      <circle cx="12" cy="12" r="3.3" />
    </svg>
  )
}
