/**
 * 每日挑战的线上数据格式与客户端约定。
 * 与 scripts/backend/publish-daily.ts 共用；语义见 docs/references/backend-api.md 第 2.2 节。
 */
import type { PuzzleData, SceneData } from './index'

import { BACKEND_SCHEMA_VERSION } from './backend'

/** v1/daily/<YYYY-MM-DD>.json：某一天的挑战关卡 */
export interface DailyPuzzleFile {
  schemaVersion: number
  /** Asia/Shanghai 口径的日期，同时是文件名与关卡 ID 的一部分 */
  date: string
  /** 第几期（从 1 递增），用于将来展示“每日挑战 #N” */
  number: number
  /** puzzle.id 固定为 daily-<date>，与正式库 ID 空间隔离 */
  puzzle: PuzzleData
  /**
   * 完成图的场景背景，可选：scene.id 与 puzzle.id 同为 daily-<date>，
   * 客户端收到后注册进场景表（正式库场景随包分发，每日的只能随当日文件下发）。
   *
   * 可选是为了向后兼容——2026-08 之前发布的日关没有这个字段，老版本 App 也不认它，
   * 两个方向都必须能照常游玩，只是回退白底。
   */
  scene?: SceneData
}

/** v1/daily/index.json：已发布日期索引，客户端用于回退到最近一期 */
export interface DailyIndex {
  schemaVersion: number
  /** 已发布的最大日期 */
  latest: string
  /** 升序排列的全部已发布日期 */
  dates: string[]
}

export const DAILY_INDEX_PATH = 'v1/daily/index.json'

export function dailyObjectPath(date: string): string {
  return `v1/daily/${date}.json`
}

/** 每日挑战关卡 ID：独立于正式库，不占用现有存档键，已发布后同样不复用 */
export function dailyPuzzleId(date: string): string {
  return `daily-${date}`
}

/**
 * 每日挑战存档键。与正式关卡的 nonogram:progress:<id> 平行，
 * 按日期而非关卡 ID 组织，方便将来做连续打卡统计。
 */
export function dailyProgressKey(date: string): string {
  return `nonogram:daily:${date}`
}

export { BACKEND_SCHEMA_VERSION }
