/**
 * 每日挑战客户端逻辑：拉取当日关卡、结构校验、离线缓存。
 * 线上格式与 ID/存档键约定见 src/types/daily.ts 与 docs/references/backend-api.md 第 5 节。
 * 拉取失败一律静默降级（返回当日缓存或 null）：
 * 每日挑战缺席不能影响正常游玩，入口由界面固定展示。
 */
import { Capacitor } from '@capacitor/core'
import { contentUrl } from '../config/backend'
import { DAILY_INDEX_PATH, dailyObjectPath, dailyPuzzleId } from '../types/daily'
import type { DailyIndex, DailyPuzzleFile } from '../types/daily'
import type { PuzzleData } from '../types'
import { PUZZLE_SIZES } from '../types'
import { isValidScene } from './scene'
import { localeTag, t } from '../i18n'
import { registerScene } from '../data/scenes'

const CACHE_PREFIX = 'nonogram:daily:cache:'
const INDEX_CACHE_KEY = 'nonogram:daily:index'
const CACHE_EPOCH_KEY = 'nonogram:daily:cache-epoch'
const FETCH_TIMEOUT_MS = 5000

/**
 * 每日缓存纪元。缓存一旦写入就只在"打开那一期"时才会被刷新，
 * 线上重新排期（同一天换了另一张图）无法自然收敛到已缓存的设备。
 * 排期调整后把这里 +1，客户端下次启动整体清空每日缓存并重新预取。
 * 只清 nonogram:daily:cache:* 与索引缓存，玩家存档（nonogram:daily:<date>）不受影响。
 *
 * 3（2026-08-19）：全部 688 期都补上了 scene。老客户端缓存的是没有 scene 的旧版本，
 * 而 ALWAYS_REFRESH_RECENT 只回源最近两期——不清一次，历史各期的背景永远补不上。
 * 4（2026-09-06）：2026-09-01 之前的 658 期已从线上撤下（内容与新版正式库重合）。
 * 日历只认索引，所以撤下当时就看不见了；但已经预取过的设备本地还压着六百多份
 * 关卡 JSON，不清一次就一直占着 localStorage，且哪天索引再变也无从对账。
 */
const CACHE_EPOCH = '4'

/** 最近几期每次启动都强制回源，避免"当天补发/修正"卡在旧缓存上 */
const ALWAYS_REFRESH_RECENT = 2

/** 每日挑战日期一律按 Asia/Shanghai 口径（与发布脚本一致） */
export function shanghaiToday(now: Date = new Date()): string {
  // en-CA 的日期格式恰好是 YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(now)
}

/**
 * 月份名交给 Intl，不自己列十二个月。
 *
 * 九个语言各写一张十二条的表是二百多条只为拼一个抬头的字符串，而每一台
 * WebView 里都躺着一份 ICU，它给出的名字比手写的更准（法语月份不大写、
 * 西语要接 "de"、日韩直接是数字＋月）。语序留给消息包里的模板去管——
 * 中文是「2026 年 7 月」，英文是「July 2026」，这一层 Intl 管不了。
 */
function intlMonthName(month: number, width: 'long' | 'short'): string {
  return new Intl.DateTimeFormat(localeTag(), { month: width, timeZone: 'UTC' }).format(
    Date.UTC(2021, month - 1, 1),
  )
}

/** "YYYY-MM" → 当前语言里那一个月的写法；日历页与首页入口共用同一份格式化逻辑。 */
export function monthLabel(month: string): string {
  const [year, value] = month.split('-')
  const index = Number(value)
  return t('daily.monthLabel', {
    year,
    month: index,
    monthName: intlMonthName(index, 'long'),
  })
}

/** 月份选择器上那一枚按钮：中日韩是「7 月」，拉丁语系是缩写月名 */
export function monthChip(month: number): string {
  return t('daily.month', { month, monthShort: intlMonthName(month, 'short') })
}

/** 首页日历块上的星期缩写：固定英文三字母，从周日起，与 Date.getUTCDay() 同序。 */
const WEEKDAY_ABBR_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

/**
 * "YYYY-MM-DD" → 星期名。日期串本身就是上海日历日，按 UTC 取星期不会跨日。
 *
 * 这一枚只给首页那块日历图标用，写死英文三字母、不随界面语言变：图标上是
 * 「Sun 6」这样一块固定造型，星期那行的宽度是照三个拉丁字母调的。跟着语言换成
 * 中文一个字、法语 "Dim"、韩语 "일"，同一块图标在九个语言里就是九种疏密。
 * 日历页里那一行星期仍然本地化（见消息包 daily.weekdays）——那里是要读的表头，
 * 这里是一枚认形状的图标。
 */
export function weekdayLabel(date: string): string {
  return WEEKDAY_ABBR_EN[new Date(`${date}T00:00:00Z`).getUTCDay()]
}

/** 某月最后一天，如 "2026-02" → "2026-02-29" */
export function lastDayOfMonth(month: string): string {
  const [year, index] = month.split('-').map(Number)
  const day = new Date(Date.UTC(year, index, 0)).getUTCDate()
  return `${month}-${String(day).padStart(2, '0')}`
}

/**
 * 当月那张画：取这个月**最后**一期，而且只有整月已经走完才有画。
 *
 * 从前取的是 1 号那一期，于是打完头一天就等于看过底图了，剩下三十天只是把
 * 已经见过的画一格格补齐。改成末日之后，画的主体要到最后一关才露出来。
 *
 * 「整月已经走完」这条不能省。客户端不许提前读未来日期，所以当月的末日还没
 * 发布时根本拿不到那张画；此时若退而求其次拿最近一期，就是每天换一张画——
 * 已经露出来的那几格昨天是这张、今天是那张，而且拿到的还正是玩家刚打完、
 * 已经看过的那一张，悬念一点不剩。宁可整月没画（退回没有画的老样子），
 * 也不摆一张明天就会变的。
 *
 * 挑法与进度无关，所以拼图不会因为多打了一关就换成另一张画。整月走完之后
 * 各期都已发布并预取，末日万一还没缓存到本地就依次往前找。
 */
export function pickMonthArtPuzzle(
  releasedDates: string[],
  month: string,
  today: string,
  getPuzzle?: (date: string) => PuzzleData | undefined,
): PuzzleData | undefined {
  if (!getPuzzle) return undefined
  if (lastDayOfMonth(month) > today) return undefined
  const inMonth = releasedDates.filter((date) => date.slice(0, 7) === month).sort()
  for (let index = inMonth.length - 1; index >= 0; index -= 1) {
    const puzzle = getPuzzle(inMonth[index])
    if (puzzle) return puzzle
  }
  return undefined
}

/** 客户端只认上海时区今天及以前的日期；未来排期不能提前暴露给玩家。 */
export function releasedDailyDates(dates: string[], today = shanghaiToday()): string[] {
  return dates.filter((date) => date <= today)
}

/**
 * 功能开关：原生环境启用；浏览器联调用 VITE_DAILY_DEV=1 打开
 * （测试环境两者皆无 → 不发起网络请求）。
 */
export function dailyEnabled(): boolean {
  return Capacitor.isNativePlatform() || import.meta.env.VITE_DAILY_DEV === '1'
}

function isSolutionMatrix(value: unknown, size: number): value is number[][] {
  return (
    Array.isArray(value) &&
    value.length === size &&
    value.every(
      (row) => Array.isArray(row) && row.length === size && row.every((v) => v === 0 || v === 1),
    )
  )
}

function isValidPuzzle(value: unknown, date: string): value is PuzzleData {
  if (typeof value !== 'object' || value === null) return false
  const p = value as Record<string, unknown>
  if (p.id !== dailyPuzzleId(date)) return false
  if (typeof p.size !== 'number' || !PUZZLE_SIZES.includes(p.size)) return false
  if (!isSolutionMatrix(p.solution, p.size)) return false
  const name = p.name as Record<string, unknown> | null
  if (typeof name !== 'object' || name === null || typeof name.zh !== 'string' || typeof name.en !== 'string') {
    return false
  }
  // palette/art 可选，但出现就必须成对且与 solution 对位（防线上坏文件送进对局崩溃）
  if (p.palette !== undefined || p.art !== undefined) {
    const palette = p.palette
    const art = p.art
    if (!Array.isArray(palette) || palette.length === 0 || palette.some((c) => typeof c !== 'string')) return false
    if (
      !Array.isArray(art) ||
      art.length !== p.size ||
      (art as unknown[]).some(
        (row) =>
          !Array.isArray(row) ||
          row.length !== p.size ||
          row.some((v) => !Number.isInteger(v) || v < 0 || v > palette.length),
      )
    ) {
      return false
    }
    const solution = p.solution as number[][]
    if ((art as number[][]).some((row, r) => row.some((v, c) => (v > 0) !== (solution[r][c] === 1)))) {
      return false
    }
  }
  return true
}

/**
 * 线上/缓存数据逐字段校验；结构不符返回 null 静默放弃。
 *
 * scene 是例外：它不合格时只把它摘掉，关卡照常返回。背景是锦上添花，
 * 一份坏背景不该让这一期玩不了——与"每日挑战缺席不影响正常游玩"同一条原则。
 */
export function parseDailyFile(value: unknown, date: string): DailyPuzzleFile | null {
  if (typeof value !== 'object' || value === null) return null
  const f = value as Record<string, unknown>
  const valid =
    f.schemaVersion === 1 &&
    f.date === date &&
    typeof f.number === 'number' &&
    Number.isInteger(f.number) &&
    f.number >= 1 &&
    isValidPuzzle(f.puzzle, date)
  if (!valid) return null
  const file = value as DailyPuzzleFile
  if (file.scene && !isValidScene(file.scene, file.puzzle, dailyPuzzleId(date))) {
    const { scene: _dropped, ...rest } = file
    return rest
  }
  return file
}

/**
 * 认领一份已校验的日关：把它带的场景登记进场景表，之后 getSceneById(daily-<date>)
 * 就能查到——正式库场景随包 glob 进表，每日的只能这样在运行时补。
 *
 * 登记点放在这里而不是各个组件里：拿到日关的路径有三条（回源、缓存命中、日历预览），
 * 全都经过 readCache 或 fetchDailyByDate 的成功分支。挂在组件上迟早漏一条，
 * 而漏掉的那条表现为"某个入口进去背景是白的"，很难查。
 */
function adopt(file: DailyPuzzleFile | null): DailyPuzzleFile | null {
  if (file?.scene) registerScene(file.scene)
  return file
}

function readCache(date: string): DailyPuzzleFile | null {
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${date}`)
    if (!raw) return null
    return adopt(parseDailyFile(JSON.parse(raw), date))
  } catch {
    return null
  }
}

function writeCache(file: DailyPuzzleFile): void {
  try {
    localStorage.setItem(`${CACHE_PREFIX}${file.date}`, JSON.stringify(file))
  } catch {
    // 缓存写不进只影响离线兜底，静默
  }
}

function isDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  return !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
}

export function parseDailyIndex(value: unknown): DailyIndex | null {
  if (typeof value !== 'object' || value === null) return null
  const index = value as Record<string, unknown>
  if (
    index.schemaVersion !== 1 ||
    !isDate(index.latest) ||
    !Array.isArray(index.dates) ||
    index.dates.length === 0 ||
    index.dates.some((date) => !isDate(date))
  ) {
    return null
  }
  const dates = index.dates as string[]
  if (new Set(dates).size !== dates.length) return null
  if (dates.some((date, i) => i > 0 && date <= dates[i - 1])) return null
  if (dates.at(-1) !== index.latest) return null
  return value as DailyIndex
}

function readIndexCache(): DailyIndex | null {
  try {
    const raw = localStorage.getItem(INDEX_CACHE_KEY)
    return raw ? parseDailyIndex(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

function writeIndexCache(index: DailyIndex): void {
  try {
    localStorage.setItem(INDEX_CACHE_KEY, JSON.stringify(index))
  } catch {
    // 索引缓存失败只影响离线日历，静默
  }
}

async function fetchJson(url: string): Promise<Response | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { cache: 'no-store', signal: controller.signal })
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** 拉取已发布日期索引；失败时使用上次成功缓存。 */
export async function fetchDailyIndex(): Promise<DailyIndex | null> {
  const url = contentUrl(DAILY_INDEX_PATH)
  if (!url) return null
  const res = await fetchJson(url)
  if (res?.ok) {
    const parsed = parseDailyIndex(await res.json())
    if (parsed) {
      writeIndexCache(parsed)
      return parsed
    }
  }
  return readIndexCache()
}

/** 拉取任意已发布日期；每一天独立缓存，支持从日历离线续玩。 */
export async function fetchDailyByDate(
  date: string,
  now: Date = new Date(),
): Promise<DailyPuzzleFile | null> {
  if (!isDate(date) || date > shanghaiToday(now)) return null
  const url = contentUrl(dailyObjectPath(date))
  if (!url) return null
  const res = await fetchJson(url)
  if (res?.ok) {
    const parsed = parseDailyFile(await res.json(), date)
    if (parsed) {
      writeCache(parsed)
      return adopt(parsed)
    }
  }
  return readCache(date)
}

/**
 * 拉取今天的每日挑战；网络/结构异常时回退到当日缓存（离线可续玩已拉到的题），
 * 仍拿不到则返回 null（UI 不显示每日挑战入口）。
 */
export async function fetchTodayDaily(now: Date = new Date()): Promise<DailyPuzzleFile | null> {
  return fetchDailyByDate(shanghaiToday(now), now)
}

/** 读取某一天的本地缓存，不发起网络请求；用于打开前判断是否已经"秒开"。 */
export function getCachedDaily(date: string): DailyPuzzleFile | null {
  return readCache(date)
}

/**
 * 纪元不匹配时清空全部每日关卡缓存与索引缓存，返回是否真的清理过。
 * 必须在 fetchDailyIndex / prefetchDailyPuzzles 之前调用，否则刚写入的缓存会被误删。
 */
export function purgeStaleDailyCache(): boolean {
  try {
    if (localStorage.getItem(CACHE_EPOCH_KEY) === CACHE_EPOCH) return false
    // 用 key(i) 枚举而不是 Object.keys：Storage 的键并非自有属性，各实现枚举结果不一致
    const stale: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && (key.startsWith(CACHE_PREFIX) || key === INDEX_CACHE_KEY)) stale.push(key)
    }
    stale.forEach((key) => localStorage.removeItem(key))
    localStorage.setItem(CACHE_EPOCH_KEY, CACHE_EPOCH)
    return stale.length > 0
  } catch {
    // 隐私模式等异常场景静默降级，与其余 localStorage 访问一致
    return false
  }
}

/**
 * 冷启动时静默预取全部已发布但本地还没有缓存的每日关卡，逐个顺序拉取。
 * 稳态下每次启动只有"昨天到今天"新增的一两期需要补拉，量很小；失败静默跳过，
 * 不影响正常游玩，也不阻塞启动流程（调用方应 `void` 掉这个 Promise）。
 * 最近 ALWAYS_REFRESH_RECENT 期即使已缓存也回源一次，接住线上的补发与修正。
 */
export async function prefetchDailyPuzzles(dates: string[], now: Date = new Date()): Promise<void> {
  const released = releasedDailyDates(dates, shanghaiToday(now))
  const refreshFrom = released.length - ALWAYS_REFRESH_RECENT
  for (const [i, date] of released.entries()) {
    if (readCache(date) && i < refreshFrom) continue
    await fetchDailyByDate(date, now)
  }
}

/**
 * 完成一期每日挑战后，选中光标的下一步落点：优先跳到下一天；
 * 若下一天（或之后）都已完成，则落到离今天最近的未完成一期
 * （released 日期均 ≤ 今天，因此从后往前找到的第一个未完成日期即最近）；
 * 全部完成则原地不动。
 */
export function nextDailyCursor(
  dates: string[],
  completedDates: ReadonlySet<string>,
  completedDate: string,
): string {
  const index = dates.indexOf(completedDate)
  const next = dates[index + 1]
  if (next && !completedDates.has(next)) return next
  for (let i = dates.length - 1; i >= 0; i--) {
    if (!completedDates.has(dates[i])) return dates[i]
  }
  return completedDate
}
