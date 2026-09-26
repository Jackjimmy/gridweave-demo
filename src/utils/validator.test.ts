import { describe, expect, it } from 'vitest'
import type { PuzzleData } from '../types'
import { validatePuzzle } from './validator'

/** 合法基准关卡（心形） */
function validPuzzle(overrides: Partial<PuzzleData> = {}): PuzzleData {
  return {
    id: 'festive-tales-01-heart',
    name: { zh: '爱心', en: 'Heart' },
    size: 5,
    difficulty: 'easy',
    solution: [
      [0, 1, 0, 1, 0],
      [1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1],
      [0, 1, 1, 1, 0],
      [0, 0, 1, 0, 0],
    ],
    tags: ['symbol'],
    author: 'original',
    createdAt: '2026-07-06',
    ...overrides,
  }
}

describe('validatePuzzle · schema', () => {
  it('合法关卡通过', () => {
    expect(validatePuzzle(validPuzzle())).toEqual({ ok: true, errors: [] })
  })

  it('拒绝缺字段 / 多余字段', () => {
    const { tags: _tags, ...missing } = validPuzzle()
    expect(validatePuzzle(missing).ok).toBe(false)
    expect(validatePuzzle({ ...validPuzzle(), extra: 1 }).ok).toBe(false)
  })

  it('拒绝 id 命名不规范', () => {
    // 正式库 <画册>-<册内序号 2～3 位>-<slug>，见 docs/content/puzzle-identity.md
    expect(validatePuzzle(validPuzzle({ id: 'deep-blue-37-manta-ray' })).ok).toBe(true)
    expect(validatePuzzle(validPuzzle({ id: 'Festive-Tales-01-Heart' })).ok).toBe(false)
    expect(validatePuzzle(validPuzzle({ id: 'festive-tales-1-heart' })).ok).toBe(false) // 序号不足 2 位
    expect(validatePuzzle(validPuzzle({ id: 'festive-tales-01' })).ok).toBe(false) // 缺 slug
  })

  it('难度只由尺寸决定，不看 id', () => {
    expect(validatePuzzle(validPuzzle({ difficulty: 'medium' })).ok).toBe(false)
  })

  it('接受每日池交接 id 与 daily-<日期>', () => {
    expect(validatePuzzle(validPuzzle({ id: 'd0001-heart' }))).toEqual({ ok: true, errors: [] })
    expect(validatePuzzle(validPuzzle({ id: 'd10234-heart' })).ok).toBe(true)
    expect(validatePuzzle(validPuzzle({ id: 'daily-2026-09-01' })).ok).toBe(true)
  })

  it('拒绝不合规的每日池 id', () => {
    expect(validatePuzzle(validPuzzle({ id: 'd1-heart' })).ok).toBe(false) // 序号不足 4 位
    expect(validatePuzzle(validPuzzle({ id: 'd0001' })).ok).toBe(false) // 缺 slug
    expect(validatePuzzle(validPuzzle({ id: 'daily-2026-5-11' })).ok).toBe(false) // 日期不补零
  })

  it('拒绝重复 id', () => {
    expect(validatePuzzle(validPuzzle(), [validPuzzle()]).ok).toBe(false)
  })

  it('生产区英文名忽略大小写且必须唯一', () => {
    const result = validatePuzzle(
      validPuzzle({ id: 'easy-02-heart-copy', name: { zh: '另一颗心', en: 'heart' } }),
      [validPuzzle()],
    )
    expect(result.errors).toContain('[schema] 生产区英文名重复: heart（已存在 festive-tales-01-heart）')
  })

  it('拒绝非法 size 与非 0/1 矩阵', () => {
    expect(validatePuzzle(validPuzzle({ size: 7 })).ok).toBe(false)
    const bad = validPuzzle()
    bad.solution[0][0] = 2
    expect(validatePuzzle(bad).ok).toBe(false)
  })

  it('拒绝词表外标签', () => {
    expect(validatePuzzle(validPuzzle({ tags: ['dragon'] })).ok).toBe(false)
    expect(validatePuzzle(validPuzzle({ tags: [] })).ok).toBe(false)
  })
})

describe('validatePuzzle · 彩色图案', () => {
  const palette = ['#e0475b', '#f591a2']
  const art = [
    [0, 1, 0, 1, 0],
    [1, 2, 1, 1, 1],
    [1, 1, 1, 1, 1],
    [0, 1, 1, 1, 0],
    [0, 0, 1, 0, 0],
  ]

  it('合法 palette + art 通过', () => {
    expect(validatePuzzle(validPuzzle({ palette, art }))).toEqual({ ok: true, errors: [] })
  })

  it('拒绝 palette 与 art 不成对出现', () => {
    expect(validatePuzzle(validPuzzle({ palette })).ok).toBe(false)
    expect(validatePuzzle(validPuzzle({ art })).ok).toBe(false)
  })

  it('拒绝非法颜色格式与越界索引', () => {
    expect(validatePuzzle(validPuzzle({ palette: ['red'], art })).ok).toBe(false)
    const outOfRange = art.map((row) => [...row])
    outOfRange[0][1] = 3 // palette 只有 2 色
    expect(validatePuzzle(validPuzzle({ palette, art: outOfRange })).ok).toBe(false)
  })

  it('拒绝 art 非零位置与 solution 不一致', () => {
    const mismatch = art.map((row) => [...row])
    mismatch[0][0] = 1 // solution 此处为 0
    const result = validatePuzzle(validPuzzle({ palette, art: mismatch }))
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('一一对应'))).toBe(true)
  })
})

describe('validatePuzzle · 非平凡性', () => {
  it('拒绝填充率越界', () => {
    const solid = validPuzzle({
      solution: Array.from({ length: 5 }, () => [1, 1, 1, 1, 1]),
    })
    const result = validatePuzzle(solid)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('填充率'))).toBe(true)
  })

  it('允许全空行列（对局开局会自动预填叉）', () => {
    const sparse = validPuzzle({
      solution: [
        [0, 1, 1, 1, 1],
        [0, 1, 1, 1, 1],
        [0, 0, 0, 0, 0],
        [0, 1, 1, 1, 1],
        [0, 1, 1, 1, 1],
      ],
    })
    const result = validatePuzzle(sparse)
    expect(result.errors.some((e) => e.includes('全空行列'))).toBe(false)
  })
})

describe('validatePuzzle · 可解性', () => {
  it('拒绝多解 / 需猜测的关卡', () => {
    // 左上角 2×2 对角可交换（(0,0)(1,1) ↔ (0,1)(1,0) 线索不变）→ 必然多解
    const ambiguous = validPuzzle({
      id: 'easy-09-dots',
      name: { zh: '斑点', en: 'Dots' },
      solution: [
        [1, 0, 0, 0, 0],
        [0, 1, 0, 0, 0],
        [0, 0, 1, 1, 1],
        [0, 0, 1, 1, 1],
        [0, 0, 1, 1, 1],
      ],
    })
    const result = validatePuzzle(ambiguous)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('逐线逻辑推理'))).toBe(true)
  })
})

describe('validatePuzzle · 查重', () => {
  it('拒绝与已有关卡呈旋转/镜像关系的图案', () => {
    const base = validPuzzle()
    const rotated = validPuzzle({
      id: 'easy-02-heart2',
      name: { zh: '爱心二', en: 'Heart Two' },
      // 原图旋转 90°
      solution: rotate(base.solution),
    })
    const result = validatePuzzle(rotated, [base])
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('旋转/镜像'))).toBe(true)
  })

  it('不同尺寸不参与查重', () => {
    const big = validPuzzle({
      id: 'medium-01-heart',
      difficulty: 'medium',
      size: 10,
      solution: [
        [0, 1, 1, 0, 0, 0, 1, 1, 0, 0],
        [1, 1, 1, 1, 0, 1, 1, 1, 1, 0],
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
        [0, 1, 1, 1, 1, 1, 1, 1, 0, 0],
        [0, 0, 1, 1, 1, 1, 1, 0, 0, 0],
        [0, 0, 0, 1, 1, 1, 0, 0, 0, 0],
        [0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
        [0, 0, 1, 0, 0, 0, 0, 1, 0, 0],
        [0, 1, 1, 1, 0, 0, 1, 1, 1, 0],
      ],
    })
    // 与 5×5 心形同库不冲突（本用例只关心查重维度，不要求 big 全项通过）
    const result = validatePuzzle(big, [validPuzzle()])
    expect(result.errors.every((e) => !e.includes('旋转/镜像'))).toBe(true)
  })
})

function rotate(matrix: number[][]): number[][] {
  const n = matrix.length
  return Array.from({ length: n }, (_, r) =>
    Array.from({ length: n }, (_, c) => matrix[n - 1 - c][r]),
  )
}
