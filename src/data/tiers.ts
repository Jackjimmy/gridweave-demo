import rounds from './level-tiers.json'

/**
 * 推理难度档，来自 solver 的约束传播轮数（见 scripts/generate-level-tiers.ts）。
 * 它与棋盘尺寸是两个独立的维度：15×15 不等于更烧脑，10×10 里也有 17 轮的关。
 */
export type LevelTier = 'gentle' | 'standard' | 'brainy'

export const TIER_LABEL: Record<LevelTier, string> = {
  gentle: '轻松',
  standard: '标准',
  brainy: '烧脑',
}

/**
 * 切点 ≤3 / 4–5 / ≥6 取自 work/analysis/v1.5.1-solver-reclassification-report.md：
 * 836 关的分布里，这套切点能把高轮数尾部单独拎出来，而 ≤3 与 4–5 各占四成上下。
 */
export function tierOfRounds(iterations: number): LevelTier {
  if (iterations <= 3) return 'gentle'
  if (iterations <= 5) return 'standard'
  return 'brainy'
}

const roundsById = rounds as Record<string, number>

/** 关卡的 solver 轮数；表里没有（如每日挑战关）时返回 undefined */
export function solverRoundsOf(puzzleId: string): number | undefined {
  return roundsById[puzzleId]
}

export function tierOf(puzzleId: string): LevelTier | undefined {
  const iterations = roundsById[puzzleId]
  return iterations === undefined ? undefined : tierOfRounds(iterations)
}
