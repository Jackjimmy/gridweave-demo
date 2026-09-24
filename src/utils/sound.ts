/**
 * 原创合成音效：全部用 Web Audio API 实时生成，不引入任何外部音频素材，
 * 因此不涉及版权问题，也无需额外网络请求。
 * AudioContext 惰性创建于首次播放（用户手势内），符合浏览器自动播放策略。
 */

import { DEFAULT_SETTINGS } from './settings'
import type { IntensityLevel } from './settings'

type WindowWithWebkit = Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }

let ctx: AudioContext | null = null

/*
 * 音效总开关（设置项，默认开）。关掉时不去销毁 AudioContext——
 * 重新打开还要在用户手势里才能再创建一个，而设置面板里的那一下手势早过去了。
 * 上下文留着，只是不再往它上面挂振荡器：一个空闲的 AudioContext 不出声也不耗电。
 */
let enabled = DEFAULT_SETTINGS.sound

export function setSoundEnabled(next: boolean): void {
  enabled = next
  // 关掉音效就没有理由让通道转着；重新打开后第一声会再起
  if (!next) stopKeepAlive()
}

/*
 * 音量三档。合成音的响度就在这里，调它比让玩家去动系统音量合理——
 * 系统音量是全局的，为了这一个应用调完还要调回去。
 *
 * 档位不是线性的：0.45 / 1 / 1.9 听上去才像等距的三级，人耳对响度的感知
 * 接近对数。上限压在 1.9 是因为 fill 的 gain 是 0.16，再往上推会削顶。
 */
const LEVEL_GAIN: Record<IntensityLevel, number> = { low: 0.45, medium: 1, high: 1.9 }

let levelGain = LEVEL_GAIN[DEFAULT_SETTINGS.soundLevel]

export function setSoundLevel(next: IntensityLevel): void {
  levelGain = LEVEL_GAIN[next]
}

function resumeContext(audio: AudioContext): void {
  // WebKit 在系统音频中断或 App 切到后台后会使用非标准 interrupted 状态。
  if (audio.state !== 'suspended' && String(audio.state) !== 'interrupted') return
  try {
    void Promise.resolve(audio.resume()).catch(() => undefined)
  } catch {
    // 恢复失败时保留上下文，下一次真实 pointerdown 会再次尝试。
  }
}

/*
 * 回到前台后的体检。
 *
 * WebKit 应当在 App 回前台时自行结束音频中断，但 iOS 17 起有一个至今未修的毛病
 * （bugs.webkit.org 263627 / 281566）：上下文报 running、currentTime 却不再走；
 * 或者 resume() 的 promise 永远不落。渲染线程已经死了，往上面挂的振荡器一声不响，
 * 而 state 看不出任何异常。触感走原生桥不受影响，所以真机上的症状就是
 * 「退到桌面再回来，落子有振动、没声音」。
 *
 * 唯一可靠的判据是 currentTime 有没有在走：回前台先 resume，隔一小段再看一眼，
 * 没走就把这个上下文判死。死了的不救（suspend/resume 偶尔能救回来，但 resume
 * 本身也可能挂住），直接关掉换新的。换新放到下一次用户手势里做——新上下文
 * 在手势里建才能立刻转起来，pointerdown 上的 sound.prepare() 正是那个入口。
 *
 * 体检两个时机都跑：定时器到点跑一次，兜底；手势来得比定时器早，就在手势里
 * 就地判，少哑一两下。每次回前台至多换一次，正在打电话之类的持续中断不会
 * 让它反复新建上下文。
 */
interface ForegroundProbe {
  /** 回前台那一刻的 currentTime */
  time: number
  /** 回前台那一刻的 performance.now() */
  at: number
}

/** 定时体检的延迟：渲染量子只有几毫秒，这段时间足够 currentTime 走出来 */
const PROBE_DELAY_MS = 300
/** 手势里就地体检要求的最短间隔：太近 currentTime 还没来得及走，判不了 */
const PROBE_SETTLE_MS = 80

let probe: ForegroundProbe | null = null
let probeTimer: ReturnType<typeof setTimeout> | undefined
/** 已判死、等下一次手势换新 */
let stale = false

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function checkProbe(): void {
  if (!probe || !ctx) return
  if (now() - probe.at < PROBE_SETTLE_MS) return
  // 又退回后台了：不走是应当的，这一轮不算数
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    probe = null
    return
  }
  const alive = ctx.state === 'running' && ctx.currentTime > probe.time
  probe = null
  if (!alive) stale = true
}

/** 前台恢复时只唤醒已经由用户手势创建的上下文，不主动绕过自动播放策略。 */
export function resumeSoundContext(): void {
  if (!ctx) return
  resumeContext(ctx)
  probe = { time: ctx.currentTime, at: now() }
  clearTimeout(probeTimer)
  probeTimer = setTimeout(checkProbe, PROBE_DELAY_MS)
}

function discardContext(audio: AudioContext): void {
  // close 也可能挂住，不等它；关不掉的最多留一个空闲上下文
  try {
    void Promise.resolve(audio.close()).catch(() => undefined)
  } catch {
    // 忽略
  }
}

/*
 * 对局期间让输出通道一直转着。
 *
 * 落子声是在输入事件里同步排上去的，可它要经过的输出通道并不总是醒着：
 * Chromium（安卓 WebView）在输出连续 30 秒全零之后会把真实的音频 sink 停掉、换一个
 * 假的顶着（media/base/silent_sink_suspender），currentTime 照走、state 照样是
 * running，JS 看不出任何异常；下一次出现非零样本才重新起真实 sink，起来那一两百毫秒里
 * 渲染出来的帧先攒着、通道通了再一起放。iOS 上没有这个挂起器，但音频会话在无声之后
 * 同样会被系统放下、输出单元重启一样要时间。玩家读题停顿正好常常超过 30 秒，
 * 症状就是「停一会儿再滑，声音到拖动的后半段才挤成一串」。
 *
 * 解法是不让它静音：挂一个循环播放的极小值 buffer（1e-5，约 -100 dBFS，转成 16 位
 * 就是 0，听不见），Chromium 判静音只看样本是不是精确的零，这就够了。
 *
 * 只在对局里转（Game 持有），退出关卡、切后台、关音效都停；三分钟没出过一声也停——
 * 思考停顿盖住了，玩家放下手机走开不用常驻耗电。停了之后下一声照常自动起，
 * 只是那一声要再付一次通道重启。
 */
const KEEP_ALIVE_LEVEL = 0.00001
const KEEP_ALIVE_IDLE_MS = 3 * 60_000

/** 有几处在要求通道保持转动；Game 挂着就是 1 */
let holders = 0
/** DEV 菜单的对照开关：关掉保活，在真机上听「停一会儿再滑」的原始症状 */
let keepAliveAllowed = true
let keepAlive: { ctx: AudioContext; source: AudioBufferSourceNode } | null = null
let keepAliveIdleTimer: ReturnType<typeof setTimeout> | undefined

function stopKeepAlive(): void {
  clearTimeout(keepAliveIdleTimer)
  keepAliveIdleTimer = undefined
  if (!keepAlive) return
  const { source } = keepAlive
  keepAlive = null
  try {
    source.stop()
    source.disconnect()
  } catch {
    // 上下文已经关了：节点随它一起没了
  }
}

function armKeepAliveIdle(): void {
  clearTimeout(keepAliveIdleTimer)
  keepAliveIdleTimer = setTimeout(stopKeepAlive, KEEP_ALIVE_IDLE_MS)
}

function hidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden'
}

/** 每出一声来一下：没转就起，转着就把空闲计时往后推。 */
function touchKeepAlive(audio: AudioContext): void {
  if (holders === 0 || !keepAliveAllowed || hidden()) return
  if (keepAlive?.ctx === audio) {
    armKeepAliveIdle()
    return
  }
  stopKeepAlive()
  if (typeof audio.createBuffer !== 'function' || typeof audio.createBufferSource !== 'function') return
  try {
    const buffer = audio.createBuffer(1, 1024, audio.sampleRate)
    buffer.getChannelData(0).fill(KEEP_ALIVE_LEVEL)
    const source = audio.createBufferSource()
    source.buffer = buffer
    source.loop = true
    source.connect(audio.destination)
    source.start()
    keepAlive = { ctx: audio, source }
  } catch {
    return
  }
  armKeepAliveIdle()
}

/**
 * 要求输出通道在这段时间里保持转动；返回撤销函数。
 *
 * 已有上下文就立刻起（正常路径下进关前 primer 已经把它建好了），没有就等第一声。
 * 页面藏起来停，露出来再起：切后台那段本来就不该出声，也省电。
 */
export function holdSoundOutput(): () => void {
  holders += 1
  if (ctx) touchKeepAlive(ctx)
  const onVisibility = () => {
    if (hidden()) stopKeepAlive()
    else if (ctx) touchKeepAlive(ctx)
  }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility)
  return () => {
    holders -= 1
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility)
    if (holders === 0) stopKeepAlive()
  }
}

/** DEV 菜单用：关掉就当场停，打开就（有上下文时）当场起 */
export function setSoundKeepAliveEnabled(next: boolean): void {
  keepAliveAllowed = next
  if (!next) stopKeepAlive()
  else if (ctx) touchKeepAlive(ctx)
}

export function isSoundKeepAliveEnabled(): boolean {
  return keepAliveAllowed
}

function getCtx(): AudioContext | null {
  if (!enabled) return null
  if (typeof window === 'undefined') return null
  if (ctx && probe) checkProbe()
  if (ctx && stale) {
    stopKeepAlive()
    discardContext(ctx)
    ctx = null
    stale = false
  }
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as WindowWithWebkit).webkitAudioContext
    if (!Ctor) return null
    try {
      ctx = new Ctor()
    } catch {
      return null
    }
  }
  resumeContext(ctx)
  return ctx
}

interface ToneOptions {
  freq: number
  duration: number
  type?: OscillatorType
  gain?: number
  /** 相对当前时间的起始偏移（秒），用于编排琶音 */
  delay?: number
  /** 结束频率，非空时做线性滑音 */
  endFreq?: number
}

function tone({ freq, duration, type = 'sine', gain = 0.15, delay = 0, endFreq }: ToneOptions): void {
  const audio = getCtx()
  if (!audio) return
  /*
   * 上下文停着（切过后台、系统音频中断刚过）就跳过这一声，不排队。
   *
   * 停着的时候 currentTime 不走，排上去的音符全落在同一个时刻；resume 是异步的，
   * 等它真的转起来，攒下的几声一起挤出来。落子声是即时反馈，晚到不如不到。
   * 只认「转过又停了」的上下文（currentTime > 0）：刚 new 出来的那一个在 WebKit 上
   * 也可能先报 suspended，那一声要照常排上——它随 resume 一起响，不会挤。
   */
  if (audio.state !== 'running' && audio.currentTime > 0) return
  const start = audio.currentTime + delay
  const osc = audio.createOscillator()
  const amp = audio.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, start)
  if (endFreq !== undefined) osc.frequency.linearRampToValueAtTime(endFreq, start + duration)
  // 快速起音 + 指数衰减，得到清脆的点击/提示音
  amp.gain.setValueAtTime(0.0001, start)
  amp.gain.exponentialRampToValueAtTime(gain * levelGain, start + 0.008)
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  osc.connect(amp).connect(audio.destination)
  osc.start(start)
  osc.stop(start + duration + 0.02)
  touchKeepAlive(audio)
}

export const sound = {
  /** 在用户手势内提前创建/恢复 AudioContext，避免 WebView 拦截后续 effect 音效。 */
  prepare(): void {
    getCtx()
  },
  /** 填充格：偏低的短促「哒」 */
  fill(): void {
    tone({ freq: 220, duration: 0.09, type: 'triangle', gain: 0.16 })
  },
  /** 标记 ×：偏高的轻点 */
  mark(): void {
    tone({ freq: 440, duration: 0.07, type: 'square', gain: 0.04 })
  },
  /** 清除：柔和的下滑音 */
  clear(): void {
    tone({ freq: 320, endFreq: 180, duration: 0.09, type: 'sine', gain: 0.1 })
  },
  /*
   * 补完整行/整列没有专属音效：它每关要响十几次，频繁到成了噪音，
   * 也把结算的高潮提前用掉。那一下只发落子本身的 fill()，
   * 「补完了」由 haptics.firm 单独说。
   */
  /**
   * 胜利：上行大三和弦琶音 + 顶音点缀。
   *
   * 节奏固定 110ms 一音，不跟随揭晓时长拉伸——把琶音摊到整段动画上听起来是拖的，
   * 快而利落的一串才有「解开了」的劲头。音画的咬合交给收尾触感去做。
   */
  win(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5] // C5 E5 G5 C6
    notes.forEach((freq, i) => {
      tone({ freq, duration: 0.5, type: 'triangle', gain: 0.16, delay: i * 0.11 })
    })
    tone({ freq: 1567.98, duration: 0.6, type: 'sine', gain: 0.1, delay: notes.length * 0.11 })
  },
}

/**
 * App 首次真实交互时建立音频上下文。
 *
 * iOS 上 AudioContext 的第一次构造可能明显占用当前输入任务；如果一直拖到棋盘的
 * pointerdown 才做，落子状态提交和随后发出的触感都会一起变晚。这里让导航点击先
 * 支付冷启动成本。pointerdown 覆盖触屏，keydown 覆盖键盘，click 是辅助功能与
 * WebView 合成点击的兜底；任一种命中后都会移除全部监听器。
 */
export function installSoundPrimer(target: Document): () => void {
  const events: Array<keyof DocumentEventMap> = ['pointerdown', 'keydown', 'click']
  let listening = true
  const remove = () => {
    if (!listening) return
    listening = false
    events.forEach((event) => target.removeEventListener(event, prime, true))
  }
  const prime = () => {
    remove()
    sound.prepare()
  }
  events.forEach((event) => target.addEventListener(event, prime, true))
  return remove
}
