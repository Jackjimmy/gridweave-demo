import type { Board, CellState, PuzzleProgress } from '../types'

const STATE_TO_CHAR: Record<CellState, string> = {
  empty: '.',
  filled: '#',
  marked: 'x',
}

const CHAR_TO_STATE: Record<string, CellState> = {
  '.': 'empty',
  '#': 'filled',
  x: 'marked',
}

/** 棋盘序列化：每格 1 字符（. # x），行优先无分隔符 */
export function encodeBoard(board: Board): string {
  return board.map((row) => row.map((cell) => STATE_TO_CHAR[cell]).join('')).join('')
}

/** 解码失败（长度不符 / 非法字符）返回 null */
export function decodeBoard(encoded: string, size: number): Board | null {
  if (encoded.length !== size * size) return null
  const board: Board = []
  for (let r = 0; r < size; r++) {
    const row: CellState[] = []
    for (let c = 0; c < size; c++) {
      const state = CHAR_TO_STATE[encoded[r * size + c]]
      if (!state) return null
      row.push(state)
    }
    board.push(row)
  }
  return board
}

export function createEmptyBoard(size: number): Board {
  return Array.from({ length: size }, () => new Array<CellState>(size).fill('empty'))
}

const progressKey = (puzzleId: string) => `nonogram:progress:${puzzleId}`

/** 秒数与时间戳都不该是负的、也不该是 NaN/Infinity——这些值会直接进成绩比较和日期展示 */
function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

/** 可选字段：缺省放行，给了就必须合法；非法的一律当没给（见 parseProgress） */
function optionalNonNegative(value: unknown): value is number | undefined {
  return value === undefined || isFiniteNonNegative(value)
}

/**
 * 存档解析：结构像不等于类型对。
 *
 * localStorage 里的东西可能来自旧版本、别的标签页、手改的控制台，也可能是半截写坏的。
 * 必填项（版本、盘面、用时、完成态）有一项不合法就整条作废——拿 elapsedSeconds:-30
 * 去算用时、拿 bestTimeSeconds:'oops' 去比纪录，产出的是看不出错的假成绩。
 *
 * 可选项（成就、时间戳）坏掉只丢它自己：一条通关记录不该因为多余的一个坏字段
 * 就把"这关通了"也一起扔掉。
 */
function parseProgress(value: unknown): PuzzleProgress | null {
  if (typeof value !== 'object' || value === null) return null
  const p = value as Record<string, unknown>
  if (p.version !== 1) return null
  if (typeof p.board !== 'string') return null
  if (!isFiniteNonNegative(p.elapsedSeconds)) return null
  if (typeof p.completed !== 'boolean') return null

  const progress: PuzzleProgress = {
    version: 1,
    board: p.board,
    elapsedSeconds: p.elapsedSeconds,
    completed: p.completed,
  }
  if (typeof p.everCompleted === 'boolean') progress.everCompleted = p.everCompleted
  if (optionalNonNegative(p.bestTimeSeconds) && p.bestTimeSeconds !== undefined) {
    progress.bestTimeSeconds = p.bestTimeSeconds
  }
  if (optionalNonNegative(p.completedAt) && p.completedAt !== undefined) {
    progress.completedAt = p.completedAt
  }
  if (optionalNonNegative(p.firstClearedAt) && p.firstClearedAt !== undefined) {
    progress.firstClearedAt = p.firstClearedAt
  }
  return progress
}

/** 按完整存储键读进度（每日挑战等非 nonogram:progress:* 键空间使用） */
export function loadProgressByKey(key: string): PuzzleProgress | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return parseProgress(parsed)
  } catch {
    return null
  }
}

/**
 * 写不进去的那几条，按存储键留最新的一份。
 *
 * localStorage 满了、隐私模式、被浏览器策略挡掉——写失败以前只有一句 console.warn，
 * 而内存里的进度照常更新：界面上关卡是通的、荣誉章是亮的，重启之后全没。
 * 玩家花掉的时间不该被一条开发者才看得见的日志打发。
 *
 * 留最新的一份就够：同一关后面每一笔都会覆盖这里，重试写下去的永远是当前盘面。
 */
const failedWrites = new Map<string, PuzzleProgress>()
const saveFailureListeners = new Set<() => void>()

/** 订阅「有没有写不进去的东西」的变化。返回退订函数（配 useSyncExternalStore） */
export function subscribeSaveFailure(listener: () => void): () => void {
  saveFailureListeners.add(listener)
  return () => {
    saveFailureListeners.delete(listener)
  }
}

export function hasFailedSaves(): boolean {
  return failedWrites.size > 0
}

function notifySaveFailure(): void {
  for (const listener of saveFailureListeners) listener()
}

/** 写成功返回 true。失败的那一条记下来，等一次重试或下一笔覆盖 */
export function saveProgressByKey(key: string, progress: PuzzleProgress): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(progress))
    if (failedWrites.delete(key)) notifySaveFailure()
    return true
  } catch (err) {
    console.warn('nonogram: 进度保存失败', err)
    const first = failedWrites.size === 0
    failedWrites.set(key, progress)
    if (first) notifySaveFailure()
    return false
  }
}

/** 把攒下的写重试一遍；全部写进去了返回 true。空间是玩家腾的，这里只负责再试 */
export function retryFailedSaves(): boolean {
  for (const [key, progress] of [...failedWrites]) saveProgressByKey(key, progress)
  return failedWrites.size === 0
}

/** 所有 localStorage 访问收口于此，隐私模式等异常场景静默降级 */
export function loadProgress(puzzleId: string): PuzzleProgress | null {
  return loadProgressByKey(progressKey(puzzleId))
}

export function saveProgress(puzzleId: string, progress: PuzzleProgress): boolean {
  return saveProgressByKey(progressKey(puzzleId), progress)
}

const TUTORIAL_KEY = 'nonogram:tutorial:seen'

/** 新手教学是否已看过：关闭一次即记录，之后不再自动弹出 */
export function loadTutorialSeen(): boolean {
  try {
    return localStorage.getItem(TUTORIAL_KEY) === '1'
  } catch {
    return false
  }
}

export function saveTutorialSeen(): void {
  try {
    localStorage.setItem(TUTORIAL_KEY, '1')
  } catch {
    // 与进度保存一致：隐私模式等异常静默降级
  }
}

const TUTORIAL2_KEY = 'nonogram:tutorial2:seen'

/** 第二步教学（叉子）是否已看过 */
export function loadTutorial2Seen(): boolean {
  try {
    return localStorage.getItem(TUTORIAL2_KEY) === '1'
  } catch {
    return false
  }
}

export function saveTutorial2Seen(): void {
  try {
    localStorage.setItem(TUTORIAL2_KEY, '1')
  } catch {}
}

export function loadAllProgress(puzzleIds: string[]): Record<string, PuzzleProgress> {
  const map: Record<string, PuzzleProgress> = {}
  for (const id of puzzleIds) {
    const progress = loadProgress(id)
    if (progress) map[id] = progress
  }
  return map
}
