import type { PuzzleData, SceneData } from '../types'

/**
 * 由 scene 的 bgPalette + background 派生每格的背景色矩阵。
 * 只在 solution=0 的格子上取色；主体格与未铺背景的格子为 null，调用方回退白底。
 */
export function sceneColorGrid(
  puzzle: PuzzleData,
  scene: SceneData | undefined,
): (string | null)[][] | null {
  if (!scene) return null
  const { solution, size } = puzzle
  if (scene.size !== size || scene.background.length !== size) return null
  return solution.map((row, r) =>
    row.map((cell, c) => {
      if (cell === 1) return null
      const index = scene.background[r]?.[c] ?? 0
      return index > 0 ? (scene.bgPalette[index - 1] ?? null) : null
    }),
  )
}

/**
 * scene 允许用 subjectPalette 整体替换关卡 palette，与新背景协调。
 * 长度不一致时忽略，回退关卡原 palette（生成器已有同名硬校验，这里只做运行时兜底）。
 */
export function resolveSubjectPalette(
  puzzle: PuzzleData,
  scene: SceneData | undefined,
): string[] | undefined {
  const override = scene?.subjectPalette
  if (!override || !puzzle.palette) return puzzle.palette
  return override.length === puzzle.palette.length ? override : puzzle.palette
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

/**
 * 逐字段校验一份来路不明的 scene（线上文件、本地缓存、发布脚本的输入），
 * 通过后才可以当 SceneData 用。客户端与 scripts/backend 共用这一份实现：
 * 两边各写一份的话，迟早会一边收紧、另一边照旧放行。
 *
 * expectedId 必须显式传入而不是从 puzzle 取——发布时 scene 的 id 要从池内
 * sourceId 改写成 daily-<date>，改写是否漏做正是这里要拦的事。
 */
export function isValidScene(
  value: unknown,
  puzzle: PuzzleData,
  expectedId: string,
): value is SceneData {
  if (typeof value !== 'object' || value === null) return false
  const s = value as Record<string, unknown>
  if (s.id !== expectedId) return false
  if (s.size !== puzzle.size) return false
  if (typeof s.theme !== 'string' || typeof s.createdAt !== 'string') return false

  const bgPalette = s.bgPalette
  if (
    !Array.isArray(bgPalette) ||
    bgPalette.length === 0 ||
    bgPalette.some((c) => typeof c !== 'string' || !HEX_COLOR.test(c))
  ) {
    return false
  }

  // 背景矩阵与 solution 对位：非零下标必须在调色板内，且只能落在 solution 的 0 上——
  // 铺到主体格上的背景会把画盖掉，这条是揭晓效果的底线。
  const background = s.background
  if (!Array.isArray(background) || background.length !== puzzle.size) return false
  for (let r = 0; r < puzzle.size; r++) {
    const row = background[r]
    if (!Array.isArray(row) || row.length !== puzzle.size) return false
    for (let c = 0; c < puzzle.size; c++) {
      const v = row[c]
      if (!Number.isInteger(v) || v < 0 || v > bgPalette.length) return false
      if (v > 0 && puzzle.solution[r]?.[c] === 1) return false
    }
  }

  // subjectPalette 出现就必须与关卡 palette 等长（渲染侧 resolveSubjectPalette 会
  // 在长度不符时静默回退，这里不放行，免得线上错误无声无息）
  if (s.subjectPalette !== undefined) {
    const override = s.subjectPalette
    if (
      !Array.isArray(override) ||
      override.length !== (puzzle.palette?.length ?? 0) ||
      override.some((c) => typeof c !== 'string' || !HEX_COLOR.test(c))
    ) {
      return false
    }
  }
  return true
}
