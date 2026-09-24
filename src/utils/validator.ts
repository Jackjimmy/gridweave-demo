import type { PuzzleData } from '../types'
import { DIFFICULTIES, PUZZLE_SIZES, PUZZLE_THEMES } from '../types'
import { deriveClues } from './clues'
import { solve } from './solver'
import { countSolutions } from './exact-solver'

export interface ValidationResult {
  ok: boolean
  errors: string[]
}

const REQUIRED_KEYS = ['id', 'name', 'size', 'difficulty', 'solution', 'tags', 'author', 'createdAt']
// palette + art 为可选的彩色图案字段，成对出现，见 validateArt
const ALLOWED_KEYS = new Set([...REQUIRED_KEYS, 'palette', 'art'])

const COLOR_PATTERN = /^#[0-9a-f]{6}$/i

// 正式库：序号 2 位起步，库规模超过 99 后允许 3 位（排序在 data/index.ts 按数值比较）
const ID_PATTERN = /^(easy|medium|hard)-\d{2,3}-[a-z0-9]+(-[a-z0-9]+)*$/
// 每日挑战池：全局单调序号，4 位补零起步（位数无上限），难度不进 id，见 content/daily/README.md
const DAILY_ID_PATTERN = /^d\d{4,}-[a-z0-9]+(-[a-z0-9]+)*$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** 池内 id（d0001-kite）与正式库 id（medium-12-heart）走不同的命名规则 */
export function isDailyPoolId(id: string): boolean {
  return DAILY_ID_PATTERN.test(id)
}

export function serializeMatrix(matrix: number[][]): string {
  return matrix.map((row) => row.join('')).join('|')
}

function rotate90(matrix: number[][]): number[][] {
  const n = matrix.length
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => matrix[n - 1 - c][r]))
}

function flipHorizontal(matrix: number[][]): number[][] {
  return matrix.map((row) => [...row].reverse())
}

/** 原图 + 三个旋转 + 水平镜像及其三个旋转，共 8 个对称变换 */
export function allTransforms(matrix: number[][]): number[][][] {
  const result: number[][][] = []
  let m = matrix
  for (let i = 0; i < 4; i++) {
    result.push(m)
    m = rotate90(m)
  }
  m = flipHorizontal(matrix)
  for (let i = 0; i < 4; i++) {
    result.push(m)
    m = rotate90(m)
  }
  return result
}

function validateSchema(raw: unknown, existing: PuzzleData[], errors: string[]): raw is PuzzleData {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    errors.push('[schema] 关卡必须是 JSON 对象')
    return false
  }
  const p = raw as Record<string, unknown>

  for (const key of REQUIRED_KEYS) {
    if (!(key in p)) errors.push(`[schema] 缺少字段 ${key}`)
  }
  for (const key of Object.keys(p)) {
    if (!ALLOWED_KEYS.has(key)) errors.push(`[schema] 不允许的字段 ${key}`)
  }
  if (errors.length > 0) return false

  if (typeof p.id !== 'string' || !(ID_PATTERN.test(p.id) || DAILY_ID_PATTERN.test(p.id))) {
    errors.push(`[schema] id 不符合命名规范 {difficulty}-{序号}-{slug} 或 d{序号}-{slug}: ${String(p.id)}`)
  }
  if (existing.some((e) => e.id === p.id)) {
    errors.push(`[schema] id 重复: ${String(p.id)}`)
  }

  const name = p.name as Record<string, unknown> | null
  if (
    typeof name !== 'object' ||
    name === null ||
    typeof name.zh !== 'string' ||
    name.zh.length === 0 ||
    typeof name.en !== 'string' ||
    name.en.length === 0 ||
    Object.keys(name).length !== 2
  ) {
    errors.push('[schema] name 必须为 { zh, en } 且均非空')
  } else if (
    existing.some(
      (item) => item.name.en.toLocaleLowerCase('en-US') === (name.en as string).toLocaleLowerCase('en-US'),
    )
  ) {
    const conflict = existing.find(
      (item) => item.name.en.toLocaleLowerCase('en-US') === (name.en as string).toLocaleLowerCase('en-US'),
    )!
    errors.push(`[schema] 生产区英文名重复: ${String(name.en)}（已存在 ${conflict.id}）`)
  }

  if (typeof p.size !== 'number' || !PUZZLE_SIZES.includes(p.size)) {
    errors.push(`[schema] size 必须为 5 | 10 | 15: ${String(p.size)}`)
  }

  if (typeof p.difficulty !== 'string' || !DIFFICULTIES.includes(p.difficulty as never)) {
    errors.push(`[schema] difficulty 非法: ${String(p.difficulty)}`)
  } else if (typeof p.id === 'string' && !isDailyPoolId(p.id) && !p.id.startsWith(`${p.difficulty}-`)) {
    // 池内 id 不带难度前缀，难度只由 difficulty 字段承载
    errors.push(`[schema] difficulty(${p.difficulty}) 与 id 前缀不一致`)
  }

  const solution = p.solution
  if (
    !Array.isArray(solution) ||
    typeof p.size !== 'number' ||
    solution.length !== p.size ||
    solution.some(
      (row) =>
        !Array.isArray(row) ||
        row.length !== p.size ||
        row.some((v) => v !== 0 && v !== 1),
    )
  ) {
    errors.push('[schema] solution 必须为 size × size 的 0/1 方阵')
  }

  const tags = p.tags
  if (
    !Array.isArray(tags) ||
    tags.length < 1 ||
    tags.length > 3 ||
    tags.some((t) => typeof t !== 'string' || !PUZZLE_THEMES.includes(t))
  ) {
    errors.push('[schema] tags 必须为 1–3 个主题词表内的标签')
  }

  if (typeof p.author !== 'string' || p.author.length === 0) {
    errors.push('[schema] author 必须为非空字符串')
  }
  if (typeof p.createdAt !== 'string' || !DATE_PATTERN.test(p.createdAt)) {
    errors.push('[schema] createdAt 必须为 YYYY-MM-DD')
  }

  return errors.length === 0
}

/** palette + art 成对校验：颜色格式、矩阵尺寸、非零位置与 solution 的 1 一一对应 */
function validateArt(puzzle: PuzzleData, errors: string[]): void {
  const { palette, art, solution, size } = puzzle
  if (palette === undefined && art === undefined) return
  if (palette === undefined || art === undefined) {
    errors.push('[art] palette 与 art 必须成对出现')
    return
  }
  if (
    !Array.isArray(palette) ||
    palette.length === 0 ||
    palette.some((c) => typeof c !== 'string' || !COLOR_PATTERN.test(c))
  ) {
    errors.push('[art] palette 必须为非空 #rrggbb 颜色数组')
    return
  }
  if (
    !Array.isArray(art) ||
    art.length !== size ||
    art.some(
      (row) =>
        !Array.isArray(row) ||
        row.length !== size ||
        row.some((v) => !Number.isInteger(v) || v < 0 || v > palette.length),
    )
  ) {
    errors.push(`[art] art 必须为 size × size 的整数方阵，取值 0–${palette.length}`)
    return
  }
  const mismatch = art.some((row, r) => row.some((v, c) => (v > 0) !== (solution[r][c] === 1)))
  if (mismatch) {
    errors.push('[art] art 的非零位置必须与 solution 的 1 一一对应')
  }
}

function validateNonTrivial(puzzle: PuzzleData, errors: string[]): void {
  const { solution, size } = puzzle
  const filled = solution.flat().filter((v) => v === 1).length
  const ratio = filled / (size * size)
  if (ratio < 0.2 || ratio > 0.8) {
    errors.push(`[non-trivial] 填充率 ${(ratio * 100).toFixed(1)}% 超出 20%–80%`)
  }
}

function validateSolvability(puzzle: PuzzleData, errors: string[]): void {
  const clues = deriveClues(puzzle.solution)
  const exact = countSolutions(clues, puzzle.size, 2)
  if (exact.count === 0) {
    errors.push('[solvability] 精确解计数为 0：线索无解')
    return
  }
  if (exact.count > 1) {
    errors.push('[solvability] 精确解计数达到 2：关卡不是唯一解，逐线逻辑推理无法唯一完成')
    return
  }
  const result = solve(clues, puzzle.size)
  if (result.status === 'contradiction') {
    // 线索派生自 solution，理论上不可能矛盾；出现说明 solver 有 bug
    errors.push('[solvability] solver 返回 contradiction，请检查 solver 实现')
    return
  }
  if (result.status === 'stuck') {
    errors.push('[solvability] 逐线逻辑推理无法完成：关卡多解或需要猜测，请调整图案')
    return
  }
  const matches = puzzle.solution.every((row, r) =>
    row.every((v, c) => (v === 1) === (result.board[r][c] === 'filled')),
  )
  if (!matches) {
    errors.push('[solvability] solver 结果与 solution 不一致，请检查 solver 实现')
  }
}

function validateNoDuplicate(puzzle: PuzzleData, existing: PuzzleData[], errors: string[]): void {
  const candidates = new Set(allTransforms(puzzle.solution).map(serializeMatrix))
  for (const other of existing) {
    if (other.size !== puzzle.size) continue
    if (candidates.has(serializeMatrix(other.solution))) {
      errors.push(`[duplicate] 与关卡 ${other.id} 的图案相同或呈旋转/镜像关系`)
    }
  }
}

/**
 * 按 docs/PUZZLE_SPEC.md 第 7 节校验单个关卡。
 * schema 不通过时跳过后续检查（后续检查依赖字段合法）。
 */
export function validatePuzzle(raw: unknown, existing: PuzzleData[] = []): ValidationResult {
  const errors: string[] = []
  if (validateSchema(raw, existing, errors)) {
    validateArt(raw, errors)
    validateNonTrivial(raw, errors)
    validateSolvability(raw, errors)
    validateNoDuplicate(raw, existing, errors)
  }
  return { ok: errors.length === 0, errors }
}
