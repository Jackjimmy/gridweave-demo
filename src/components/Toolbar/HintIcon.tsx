/**
 * 提示按钮的图标：传统电灯泡。
 *
 * 定它之前比过三个（魔杖星芒、点亮的一行），结论是这里不值得做文章——
 * 灯泡是三个里唯一不需要学的那个，而提示按钮本来就该在玩家卡住、
 * 没心思研究图标的那一刻被一眼认出来。另外两个各有各的问题：魔杖带着
 * 「替我做完」的暗示（这个按钮明确不落子），点亮的一行要学一次。
 *
 * 玻璃泡 + 灯颈两道箍。泡身撑到 24 格的边上（3.9~21.7），与旁边的齿轮取齐——
 * 同一排里一个画满、一个缩在中间，看着就是两套东西，小的那个还显得没画完。
 * 描边宽度与齿轮同为 1.7。
 */
export function HintIcon({ size = 22 }: { size?: number }) {
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
      <path d="M8.5 15.2a6.2 6.2 0 1 1 7 0c-.85.6-1.35 1.35-1.35 2.2v.35h-4.3v-.35c0-.85-.5-1.6-1.35-2.2Z" />
      <path d="M9.8 19.6h4.4" />
      <path d="M10.7 21.7h2.6" />
    </svg>
  )
}
