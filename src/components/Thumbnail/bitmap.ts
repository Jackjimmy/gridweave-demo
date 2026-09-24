import type { PuzzleData, SceneData } from '../../types'
import { artColorGrid } from '../../utils/art'
import { resolveSubjectPalette, sceneColorGrid } from '../../utils/scene'

/**
 * 同一幅画只编一次。
 *
 * 键是关卡对象本身而不是 id：同一个 id 可能先后拿到占位和真关卡两份对象（见
 * data/index.ts），对象换了新的一份正是「这一册到了」的那一刻，缓存自然跟着失效；
 * 册子被丢掉时这一份也跟着走，不必自己管回收。
 */
const bitmaps = new WeakMap<PuzzleData, HTMLCanvasElement>()

/**
 * 把这一关的画编成一张 size×size 的离屏位图（一格一个像素）。
 *
 * 交出去的是 canvas 本身，不是 data URL——挂进页面的那张画布用 drawImage 从它
 * 拷一次，同步、不经过任何加载器。从前这里 toDataURL 交给 CSS 当背景图，
 * WebKit 对 data: URL 是**异步**解码的（DataURLDecoder 排在工作线程上），一面墙
 * 新挂上去的六百张画在第一帧全是空格子，之后几帧才一张张亮起来；已经在别处挂着的
 * 那几张（封面、首页收藏架）走缓存，首帧就有——2026-09-15 真机上收藏页那张
 * 「只亮了一部分」的截图正是这个分界。模拟器上 100 张 data URL 背景图对照 100 张
 * canvas，同一次提交：canvas 首帧全在，背景图晚三帧。
 */
export function bitmapOf(
  puzzle: PuzzleData,
  colors: (string | null)[][] | null,
  sceneColors: (string | null)[][] | null,
): HTMLCanvasElement | null {
  const cached = bitmaps.get(puzzle)
  if (cached) return cached
  const { solution, size } = puzzle
  if (solution.length === 0) return null
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const on = solution[r][c] === 1
      const color = on ? (colors?.[r][c] ?? null) : (sceneColors?.[r][c] ?? null)
      // 无场景关卡的空格不画，透出卡片底色；无 art 的主体格回退棋盘填充色
      if (!color && !on) continue
      ctx.fillStyle = color ?? '#3b4a68'
      ctx.fillRect(c, r, 1, 1)
    }
  }
  bitmaps.set(puzzle, canvas)
  return canvas
}

/**
 * 一幅画连它的场景编成的位图 data URL，给不走 Thumbnail 组件的地方铺底纹用
 * （首页导览的欢迎卡：一张图铺一块底，异步解码晚一帧无妨）。场景由调用方直接给。
 */
export function puzzleBitmap(puzzle: PuzzleData, scene: SceneData | undefined): string | null {
  const colors = artColorGrid(puzzle, resolveSubjectPalette(puzzle, scene))
  const canvas = bitmapOf(puzzle, colors, sceneColorGrid(puzzle, scene))
  if (!canvas) return null
  try {
    return canvas.toDataURL()
  } catch {
    // 极老 WebView 或被隐私设置挡下时静默留白
    return null
  }
}
