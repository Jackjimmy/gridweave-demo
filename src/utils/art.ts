import type { PuzzleData } from '../types'

/**
 * 由 palette + art 派生每格的展示颜色矩阵（马赛克配色）。
 * 未配置彩色图案的关卡返回 null，调用方回退到单色 --color-fill。
 * paletteOverride 供场景背景的 subjectPalette 使用（见 utils/scene.ts）。
 */
export function artColorGrid(
  puzzle: PuzzleData,
  paletteOverride?: string[],
): (string | null)[][] | null {
  const { art } = puzzle
  const palette = paletteOverride ?? puzzle.palette
  if (!art || !palette) return null
  return art.map((row) => row.map((v) => (v > 0 ? (palette[v - 1] ?? null) : null)))
}
