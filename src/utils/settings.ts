/**
 * 玩家设置。
 *
 * 每一项的产品取舍见 docs/product/PRODUCT_NOTES.md 第 2 节；这里只负责「是什么、
 * 默认是什么、怎么存」。设置模块落地之前，这些值散落在各处钉成常量，
 * 相关注释里都标着「产品默认是什么、当前钉的是什么」——它们现在都读这里。
 *
 * 存储做逐字段校验而不是整体信任：设置项会随版本增减，读到旧结构、缺字段、
 * 或将来被降级安装的包写坏的值时，坏的那一项回落默认，其余照常生效。
 */

/**
 * 音量 / 振动强度的三档。
 *
 * 两者共用一套档位不只是省一个类型：设置面板里它们是并排的两块，
 * 选项对不上会让人以为两边说的不是一回事。
 *
 * 振动三档是无障碍适配而非装饰——马达强度因机型差异极大，同一档在不同手机上
 * 从「感觉不到」到「震手」都有。音量三档则是为了不必为了这一个应用去调系统音量。
 */
export type IntensityLevel = 'low' | 'medium' | 'high'

export type ThemePreference = 'system' | 'light' | 'dark'

/** 画册浏览方式：分章保留内容关系，总览按改版前的紧凑网格平铺。 */
export type AlbumViewMode = 'chapters' | 'overview'

/**
 * 振动手感的两种口味。**这不是音量，是两副面孔。**
 *
 * 原来是低/中/高三档。2026-09-01 在 PLJ110 上实测把它推翻了：这台机器的
 * `capabilities` 里没有 AMPLITUDE_CONTROL，HAL 物理上就没有「把同一记振动调轻」
 * 的能力，只有一个固定波形库。所谓强度三档在这台机器上实际是
 * waveform1 → waveform2 → waveform1——高档和低档是同一个东西，中档反而最重。
 *
 * 而且 git 历史早就在说同一件事：十版方案里中档和高档反复塌成同一个值，低档
 * 却几乎每版都真的不同。中和高从来就不是两个不同的用户需求。
 *
 * 所以档位改成沿设备真实存在的那个轴——音色——来分：
 *   elegant 优雅  更短更脆的一记
 *   vivid   鲜明  更饱满、存在感更强的一记
 *
 * 「想要振动但要更小」这个需求归到「触感关闭」；要爽感的多数玩家在两种口味里选。
 */
export type VibrationStyle = 'elegant' | 'vivid'

/** 涂画规则：easy=已有内容的格子点一下就改（只改一格），strict=方块与叉互不干扰 */
export type StrokeRule = 'easy' | 'strict'

/**
 * 结算背景：棋盘外那片空白加不加特效。
 *
 * 原来是四档：无 / 蓝光晕 / 主色晕 / 光芒。中间那两档（同一团柔光，一档取主题蓝、
 * 一档取画的主色）在设置面板里是两行几乎一样的字，而它们的差别小到要把两关的
 * 结算画面并排放才看得出来——四选一里有两个选项没人分得清，那就不是四档，
 * 是两档加两条噪音。留下的两档是真的两件事：什么都不加，或者让画发光。
 *
 * 旧存档里的 'theme' / 'art' 不必单独迁移：pick 认不出就回落默认（'rays'），
 * 而它们本来就是「要一点光」的那一类人选的。
 */
export type SettleBackdrop = 'none' | 'rays'

export interface Settings {
  /** 音效总开关 */
  sound: boolean
  /**
   * 音效响度。**不再可选**：面板上撤掉了音量那一行，这一项一律是 'high'
   * （见 normalizeSettings）。留着字段是因为 sound.ts 的增益表按它取值，
   * 哪天要把选择权还回去，改的还是这里。
   */
  soundLevel: IntensityLevel
  /** 振动总开关 */
  vibration: boolean
  vibrationStyle: VibrationStyle
  /** 补完整行整列时自动把该行列剩余空格标成叉 */
  autoMark: boolean
  theme: ThemePreference
  strokeRule: StrokeRule
  settleBackdrop: SettleBackdrop
  /** 所有画册共用同一种浏览方式，并随其余设置一起保存在本机。 */
  albumView: AlbumViewMode
}

export const VIBRATION_STYLES = ['elegant', 'vivid'] as const
export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const
export const STROKE_RULES = ['easy', 'strict'] as const
export const SETTLE_BACKDROPS = ['none', 'rays'] as const
export const ALBUM_VIEW_MODES = ['chapters', 'overview'] as const

/*
 * 结算背景的默认值是 'rays'：光芒对所有用户开放（2026-08-19 所有者定的）。
 * 这一项往后怎么定，见 PRODUCT_NOTES 第 5 节。
 */
export const DEFAULT_SETTINGS: Settings = {
  sound: true,
  /*
   * 一律最大档。三档音量是「不必为这一个应用去动系统音量」的补丁，可代价是
   * 面板上多一行、多三个按钮，而想小声的人手边就有系统音量键和静音键。
   * 撤掉那一行之后，剩下的这一个值该是听得清的那一档。
   */
  soundLevel: 'high',
  vibration: true,
  /*
   * 默认「鲜明」而不是「优雅」：改档之前的默认是中档，中档在安卓上就是
   * KEYBOARD_TAP，也正是现在的鲜明。默认保持不变，绝大多数人升级后手感一致。
   */
  vibrationStyle: 'vivid',
  autoMark: true,
  theme: 'system',
  strokeRule: 'easy',
  settleBackdrop: 'rays',
  albumView: 'chapters',
}

const KEY = 'nonogram:settings'

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

/**
 * 老的 vibrationLevel 迁到新的 vibrationStyle。
 *
 * medium/high → vivid：中档原本就是安卓的 KEYBOARD_TAP，也就是现在的鲜明，
 * 这批人（绝大多数）升级后一下都不会变。
 * low → elegant：他们要的是「小一点」，两种口味里优雅最接近；直接归到「关振动」
 * 会静默拿走他们没要求关掉的东西，包括行列扣合这种功能性反馈。
 */
function migrateVibrationStyle(v: Record<string, unknown>): VibrationStyle {
  if (typeof v.vibrationStyle === 'string') {
    return pick(v.vibrationStyle, VIBRATION_STYLES, DEFAULT_SETTINGS.vibrationStyle)
  }
  if (v.vibrationLevel === 'low') return 'elegant'
  if (v.vibrationLevel === 'medium' || v.vibrationLevel === 'high') return 'vivid'
  return DEFAULT_SETTINGS.vibrationStyle
}

/** 任意输入 → 一份完整可用的设置；坏字段逐个回落默认 */
export function normalizeSettings(raw: unknown): Settings {
  const v = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  return {
    sound: bool(v.sound, DEFAULT_SETTINGS.sound),
    // 音量不再可选：存档里那一档（含老版本选过的小 / 中）一律拉回默认
    soundLevel: DEFAULT_SETTINGS.soundLevel,
    vibration: bool(v.vibration, DEFAULT_SETTINGS.vibration),
    vibrationStyle: migrateVibrationStyle(v),
    autoMark: bool(v.autoMark, DEFAULT_SETTINGS.autoMark),
    theme: pick(v.theme, THEME_PREFERENCES, DEFAULT_SETTINGS.theme),
    strokeRule: pick(v.strokeRule, STROKE_RULES, DEFAULT_SETTINGS.strokeRule),
    settleBackdrop: pick(v.settleBackdrop, SETTLE_BACKDROPS, DEFAULT_SETTINGS.settleBackdrop),
    albumView: pick(v.albumView, ALBUM_VIEW_MODES, DEFAULT_SETTINGS.albumView),
  }
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    return normalizeSettings(raw ? (JSON.parse(raw) as unknown) : null)
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings))
  } catch {
    // 隐私模式等写入失败：设置只是体验偏好，丢了不影响对局
  }
}

/**
 * 'system' 解析成实际主题。
 *
 * 主题一律以 data-theme 的形式写死在 <html> 上，不靠 CSS 的
 * prefers-color-scheme 分支——那样每个变量都要在媒体查询和 [data-theme] 里
 * 各写一遍，两份迟早会分岔。跟随系统由这里读一次 matchMedia 解决。
 */
export function resolveTheme(pref: ThemePreference): 'light' | 'dark' {
  if (pref !== 'system') return pref
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyTheme(pref: ThemePreference): void {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = resolveTheme(pref)
}

/**
 * 订阅系统深浅色的变化。给 useSyncExternalStore 用，也可以裸用。
 *
 * resolveTheme 只是读一次 matchMedia，读完就完了；「跟随系统」下系统那侧
 * 后来变了，谁读过它谁就得自己知道。CSS 那侧由 SettingsProvider 盯着
 * （见 hooks/useSettings.tsx），React 树里要跟着变的则走这里。
 */
export function subscribeSystemTheme(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
  const query = window.matchMedia('(prefers-color-scheme: dark)')
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}
