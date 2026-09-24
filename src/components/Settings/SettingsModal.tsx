import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { AppLauncher } from '@capacitor/app-launcher'
import { useDevBuild, useNativeAppInfo } from '../../hooks/useDevBuild'
import { useSettings } from '../../hooks/settingsContext'
import { useBackHandler } from '../../hooks/useBackHandler'
import { haptics, setVibrationEnabled, setVibrationStyle } from '../../utils/haptics'
import { prefersReducedMotion } from '../../utils/motion'
import { setSoundEnabled, sound } from '../../utils/sound'
import type { Settings } from '../../utils/settings'
import { currentBuildInstalledAt, webGitRevision } from '../../utils/devBuild'
import { LOCALES, LOCALE_ENDONYM, LOCALE_TAG, detectLocale, localeTag, useT } from '../../i18n'
import { applyLocalePreference, useI18nBootState, useLocalePreference } from '../../i18n/boot'
import type { LocalePreference } from '../../i18n/preference'
import { DevMenu } from './DevMenu'
import { ReviewAccessPanel } from './ReviewAccess'
import { isPlayBuild, isStoreBuild } from '../../config/distribution'
import { isDemoBuild } from '../../config/demo'
import { canOpenStoreReview, openStoreReviewPage } from '../../utils/storeReview'
import { restoreFullGame, useFullGame } from '../../billing/entitlement'
import { fullGameNoticeKey } from '../FullGame/notices'
import { reviewAccessGranted, useReviewAccess } from '../../billing/reviewAccess'
import styles from './SettingsModal.module.css'

/**
 * 设置里的「完整版」那一段：说清现在解锁没有，并留一个**恢复购买**的出口。
 *
 * 这里不卖东西——价格和购买按钮只在购买面板上出现一处（见 FullGameSheet），
 * 那张面板由锁着的内容自己拉起来。这一段回答的是另一个问题：**「我明明买过，
 * 怎么又锁上了」**。重装、换机、清了数据的人第一件事是来设置里找这个按钮，
 * 而开机时那次自动恢复（initFullGameBilling）没成时，他也只有这一条路。
 *
 * 状态整份来自那份唯一的判断，这里一个字段都不自己存。
 */
function FullGameSection() {
  const t = useT()
  const state = useFullGame()
  const busy = state.busy !== 'none'
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{t('fullGame.settingsLabel')}</h3>
      <div className={styles.fullGameRow}>
        <span className={styles.fullGameStatus} data-owned={state.entitled || undefined}>
          {state.entitled ? t('fullGame.settingsOwned') : t('fullGame.settingsLocked')}
        </span>
        {!state.entitled && (
          <button
            className={styles.fullGameRestore}
            type="button"
            disabled={busy}
            onClick={() => void restoreFullGame()}
          >
            {busy ? t('fullGame.working') : t('fullGame.restore')}
          </button>
        )}
      </div>
      {state.notice && (
        <p className={styles.fullGameNotice} role="status">
          {t(fullGameNoticeKey(state.notice))}
        </p>
      )}
    </section>
  )
}

/**
 * 「语言」那一节：平时折起来的一行，点开才是那片选项。
 *
 * 折着的时候只有一行：左边写着眼下选的是什么（跟随系统时连它认成了哪个语言
 * 一起写——「跟随系统」四个字本身说不清系统是什么），右边一枚朝下的箭头。
 * 语言是一辈子改一两次的东西，十张卡常年摊在面板上，把主题、音效那些天天要碰的
 * 行挤到两屏外，不值。
 *
 * 点开是一片小卡：跟随系统独占第一行，其余九个各用自己的说法（English、日本語……）
 * 排成网格。每张卡都标了 lang，读屏按那个语言念它的名字，字体也按那个语言选字形。
 * 选完就自动折回去：折起来的那一行随即换成新选的名字，这就是「选中了」的回执。
 *
 * 点一下当场换：这一节的反馈就是眼前这一屏换了字，攒到关闭就等于没反应。
 * 它不走面板那份草稿——语言不在 utils/settings 那份对象里（见 i18n/preference），
 * 换语言也要先把那个语言的资源拉到手（见 applyLocalePreference），选中态因此
 * 直接订阅 i18n 那边的状态：刚点的那一档立刻亮起来，字随资源到手时换过去。
 */
function LanguageSection() {
  const t = useT()
  const preference = useLocalePreference()
  const boot = useI18nBootState()
  const [open, setOpen] = useState(false)
  const gridId = useId()
  // 系统语言此刻认成哪一个；开面板期间系统语言不会变，算一次就够
  const systemLocale = useMemo(() => detectLocale(), [])
  const choose = useCallback(
    (value: LocalePreference) => {
      setOpen(false)
      if (value === preference) return
      void applyLocalePreference(value)
    },
    [preference],
  )
  const chosen = preference === 'system' ? systemLocale : preference
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{t('settings.sectionLanguage')}</h3>
      <div className={styles.row}>
        <button
          type="button"
          className={styles.disclosure}
          aria-expanded={open}
          aria-controls={gridId}
          onClick={() => setOpen((current) => !current)}
        >
          <span className={styles.languageText}>
            <span className={styles.label} lang={LOCALE_TAG[chosen]}>
              {LOCALE_ENDONYM[chosen]}
            </span>
            {preference === 'system' && (
              <span className={styles.languageSub}>{t('settings.languageSystem')}</span>
            )}
          </span>
          <svg className={styles.chevron} viewBox="0 0 16 16" aria-hidden="true">
            <path d="m4 6 4 4 4-4" />
          </svg>
        </button>
        {open && (
          <div
            id={gridId}
            className={styles.languageGrid}
            role="group"
            aria-label={t('settings.sectionLanguage')}
          >
            <button
              type="button"
              className={styles.languageOption}
              data-system
              aria-pressed={preference === 'system'}
              onClick={() => choose('system')}
            >
              <span className={styles.languageText}>
                <span className={styles.languageName}>{t('settings.languageSystem')}</span>
                <span className={styles.languageSub} lang={LOCALE_TAG[systemLocale]}>
                  {LOCALE_ENDONYM[systemLocale]}
                </span>
              </span>
            </button>
            {LOCALES.map((locale) => (
              <button
                key={locale}
                type="button"
                className={styles.languageOption}
                lang={LOCALE_TAG[locale]}
                aria-pressed={preference === locale}
                /* 资源还在路上：这一档已经选中，字还没换过来，先淡一档说「在拉」 */
                data-busy={(boot.retrying && boot.locale === locale) || undefined}
                onClick={() => choose(locale)}
              >
                <span className={styles.languageName}>{LOCALE_ENDONYM[locale]}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

interface Option<T> {
  value: T
  label: string
}

const PRIVACY_POLICY_URL = 'https://nonogram.com.cn/privacy'
/** 与 App Store Connect 填的 Support URL 同一个地址；页面上有联系邮箱和政策链接 */
const SUPPORT_URL = 'https://nonogram.com.cn/support'

/**
 * 从应用里跳出去：原生端交给系统（Safari / 邮件），失败再退回 window.open。
 * 网页端 AppLauncher 本身就会 reject，所以同一段代码两头都走得通。
 */
function openExternal(url: string) {
  void AppLauncher.openUrl({ url }).catch(() => {
    window.open(url, '_blank', 'noopener,noreferrer')
  })
}

interface RowProps<T> {
  label: string
  options: Option<T>[]
  /** 当前选中的那一档，取自面板的草稿而不是全局设置（见 SettingsModal 的说明） */
  current: T
  /** 依赖的开关关着时整行灰掉——选一个感觉不到的手感只会让人以为坏了 */
  disabled?: boolean
  /** silent=true 是「这一笔不算数，退回去」，不再试听一次 */
  onChoose: (value: T, silent?: boolean) => void
}

/**
 * 一行设置。全部做成分段选择而不是开关：一屏里混着开关、滑杆和分段控件时，
 * 每换一种控件读者就要重新认一次「哪边是开」；统一成一种，扫一眼就够。
 *
 * 这一行不认识 Context：选中态从 props 来，点击也只是把值交回面板。一整屏的
 * 行共用面板那一份草稿，点哪一行都只重渲染面板自己。
 *
 * 指针那一路在 **pointerdown** 就把选中态定了，不等 click。click 要到抬指之后
 * 才派发：手指按着的那段时间里，白色滑块一动不动，而人眼盯着的就是那块滑块——
 * 「点了没反应」说的正是它。压深字色那类按压反馈补不上这一段，它顶多说明
 * 「收到了」，没说「选中了」。
 *
 * 代价是一笔本想滚动、或想把面板拉走的手势会先把值改掉：内容区可以纵向滚，
 * 面板在顶部时往下拉又是关闭手势，而手指常常正落在这几枚按钮上。所以按下之后
 * 只要手指移过 SEGMENT_SLOP，这一下就作废，原样退回按下之前那一档，且不再试听
 * 一次——退回是撤销，不是又一次选择。
 *
 * 判据是**位移**而不是 pointercancel。浏览器自己接管滚动时确实会给 pointercancel，
 * 但下拉关闭是面板用原生 touch 监听 + preventDefault 自己实现的，指针那一路不会
 * 断——只认 pointercancel 的话，从「小」上起手把面板拉走，松手时音量就真的变成了
 * 小。指针按下时顺手 setPointerCapture，手指滑出按钮之后的移动仍然送得到这里，
 * 快速甩动不会因为第一帧就跳出按钮而漏判。
 *
 * click 只留给键盘：Enter / 空格触发的 click detail 是 0，指针点出来的从 1 起步。
 * 两条路都应用一次的话，快速来回点按时上一次的 click 会晚于这一次的 pointerdown
 * 到达，把刚选好的那一档弹回去（操作栏的模式切换踩过这个坑，见 ActionBar）。
 */
/** 按下之后手指移过这么多像素，这一下就不算选择，退回原来那一档 */
const SEGMENT_SLOP = 10

function Row<T extends string | boolean>({
  label,
  options,
  current,
  disabled = false,
  onChoose,
}: RowProps<T>) {
  // 按下时记下落点与这一行原本选的那一档：手指一旦走开，得原样退回去
  const pressRef = useRef<{ pointerId: number; previous: T; x: number; y: number } | null>(null)

  /** 这一下作废：退回按下之前那一档，静默（退回是撤销，不是又一次选择） */
  const abandon = useCallback(
    (pointerId: number) => {
      const press = pressRef.current
      if (!press || press.pointerId !== pointerId) return
      pressRef.current = null
      onChoose(press.previous, true)
    },
    [onChoose],
  )
  return (
    <div className={styles.row} data-disabled={disabled || undefined}>
      <div className={styles.rowHead}>
        <span className={styles.label}>{label}</span>
        {/* 选中时要试听对应的手感，不是通用 selection——退出全站委托 */}
        <div className={styles.segments} role="group" aria-label={label} data-haptic="self">
          {options.map((option) => (
            <button
              key={String(option.value)}
              className={option.value === current ? `${styles.segment} ${styles.on}` : styles.segment}
              aria-pressed={option.value === current}
              disabled={disabled}
              onPointerDown={(event) => {
                pressRef.current = {
                  pointerId: event.pointerId,
                  previous: current,
                  x: event.clientX,
                  y: event.clientY,
                }
                // 手指滑出按钮之后的移动也要送到这里，否则甩得快就漏判
                event.currentTarget.setPointerCapture?.(event.pointerId)
                onChoose(option.value)
              }}
              onPointerMove={(event) => {
                const press = pressRef.current
                if (!press || press.pointerId !== event.pointerId) return
                const moved =
                  Math.abs(event.clientX - press.x) > SEGMENT_SLOP ||
                  Math.abs(event.clientY - press.y) > SEGMENT_SLOP
                // 手指走开了：这一笔是滚动或下拉关闭，不是在选这一档
                if (moved) abandon(event.pointerId)
              }}
              onPointerUp={() => {
                pressRef.current = null
              }}
              /* 浏览器自己接管滚动时给的是 pointercancel，同样按作废处理 */
              onPointerCancel={(event) => abandon(event.pointerId)}
              /* 指针那一路已经在 pointerdown 定过了；这里只服务键盘（detail 为 0） */
              onClick={(event) => {
                if (event.detail === 0) onChoose(option.value)
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * 版本号上连点几下才露出审核通道，以及两下之间最多能隔多久。
 *
 * 7 下是 Android 自己那套「连点版本号开开发者选项」的次数，审核员照着 Play
 * Console 的备注操作时手上是熟的。1.5 秒的间隔上限让「误触」几乎不可能凑齐：
 * 一屏设置上没有人会以这个节奏连敲同一行文字七次。
 */
const REVIEW_TAPS = 7
const REVIEW_TAP_GAP_MS = 1500

/** 往下拖过这么多像素就松手关掉；再短会和滚动到顶时的回弹混淆 */
const DISMISS_PX = 90

/** 退场动画时长，与样式表里的 sinkOut / fadeOut 一致 */
export const CLOSE_MS = 240

function formatLocalDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  // 日期格式跟当前语言走：同一个时刻，中文读者要 2026/09/06，德语读者要 06.09.2026
  return new Intl.DateTimeFormat(localeTag(), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date)
}

/**
 * 设置面板。项目与每一项的默认值取舍见 docs/product/PRODUCT_NOTES.md 第 2 节。
 *
 * 没有「保存」按钮。看得见效果的那一项当场提交，其余攒到面板关掉那一刻。
 *
 * 从前每点一下就往全局设置里写一次。那一下的代价不在写盘，在 Context：
 * settings 一换身份，所有消费者跟着重渲染——其中一个是 Game，它底下是整块棋盘
 * （15×15 就是两百多个格子连同两条线索槽）。iOS 上这一遍重渲染够慢，慢到选中态
 * 要等它跑完才挪，手指已经离开了按钮，光标还停在上一档，就是「不跟手」。同一份
 * 代码在 Chromium 上快得看不出来，所以这个毛病只在 iOS 报出来。
 *
 * 现在面板自带一份草稿：点一下只动草稿（重渲染止步于面板自己）与当场的反馈，
 * 改动攒在 pending 里，等退场动画走完、面板即将卸载时一次性交给全局设置。
 * 那时棋盘那一遍重渲染谁也看不见，主题换底更是正好落在面板消失之后。
 *
 * 「当场」与「延后」的分界是**这一项的反馈从哪儿来**：
 *
 *   音效与触感的档位在选中的同一个手势里直接推给两个模块级单例（它们不在 React
 *   树里，推过去不触发任何重渲染），试听响的永远是刚选的那一档，全局设置晚一点
 *   提交没人看得出来——这几行又正是会被连点的（要来回比两种手感），留着攒。
 *
 *   主题不一样：它的反馈就是全局设置本身（整页换底、状态栏跟着翻），攒起来就等于
 *   点下去什么都没发生。它走 now 那条道，当场提交。没人会连点主题，那一次重渲染
 *   换来「点了当场就变」，划算。
 *
 *   玩法、结算背景要回到棋盘才看得见，早提交一秒没有收益，跟着攒。
 */
interface SettingsModalProps {
  onClose: () => void
  /** 对局里打开时传进来，开发菜单据此多出一条「立刻通关本关」 */
  devWinNow?: () => void
}

export function SettingsModal({ onClose, devWinNow }: SettingsModalProps) {
  /*
   * 草稿：面板开着的时候，所有选中态都读它。
   *
   * pending 是「这次开面板改过哪些项」，一项一条提交闭包（后点的覆盖先点的），
   * 关闭时依次执行。用闭包而不是存值，是为了让每一条各自带着自己那一项的类型，
   * 提交处不必再把 key 与 value 的对应关系强行断言一次。
   *
   * 提交分两条道，按「这一项的效果看不看得见」分：
   *
   *   now  —— 主题。它改的是整页的底色，攒到关闭就等于点下去什么都没发生，
   *            那正是这一屏最需要当场看见的一项；状态栏的深浅也跟着它走
   *            （useStatusBarStyle 读的是全局设置，不是草稿）。
   *   攒着 —— 其余各项。音效、触感那几行的反馈本来就走模块级单例，不靠全局设置；
   *            玩法与结算背景要等回到棋盘才看得见，早提交一秒没有任何收益。
   *
   * 为什么不干脆全部当场提交：一次提交就是一次 Context 变更，Game 底下整块棋盘
   * 跟着重渲染一遍。量过（开发构建、M 系列 Mac、100 格的盘、不含绘制）：
   * 只动草稿是 5.2ms 中位，加上当场提交变成 8.7ms、峰值 15ms——多出来的三四毫秒
   * 在这台机器上无所谓，换成 iPhone X 那一档的 CPU 加上 15×15 的盘就是一整帧上下。
   * 连点最凶的恰恰是音量与落笔手感这几行（要来回比两种手感），protection 就留在
   * 它们身上；主题没人会连点，那一帧换来「点了当场就变」，是划算的。
   */
  const t = useT()
  const { settings, set } = useSettings()
  const [draft, setDraft] = useState(settings)
  const draftRef = useRef(draft)
  const pendingRef = useRef(new Map<keyof Settings, () => void>())

  const choose = useCallback(
    function choose<K extends keyof Settings>(
      name: K,
      value: Settings[K],
      options?: {
        /** 选完立刻让玩家听到 / 感觉到这一档；拿到的是应用了本次改动之后的整份设置 */
        preview?: (next: Settings) => void
        /** 效果全局可见的那几项：当场提交，不攒到关闭 */
        now?: boolean
      },
    ) {
      if (draftRef.current[name] === value) return
      const next = { ...draftRef.current, [name]: value }
      draftRef.current = next
      setDraft(next)
      if (options?.now) {
        // 当场提交的项不进 pending：它已经落地了，关闭时不必再提交一次
        pendingRef.current.delete(name)
        set(name, value)
      } else {
        pendingRef.current.set(name, () => set(name, value))
      }
      // 反馈要用刚选的这一档：它走的是模块级单例，不等这次渲染提交
      options?.preview?.(next)
    },
    [set],
  )

  const flush = useCallback(() => {
    const pending = pendingRef.current
    if (pending.size === 0) return
    const commits = [...pending.values()]
    pending.clear()
    for (const commit of commits) commit()
  }, [])

  /*
   * 关闭要先播完退场再卸载。父组件是 {showSettings && <SettingsModal/>}，
   * 直接把 onClose 交出去面板就当场消失——升起来是一段动画，撤下去却是一刀切，
   * 下拉尤其明显：手指刚推开一点，整块就凭空没了。
   *
   * 所以面板里所有关闭入口都先落到 closing：这一帧起放退场动画，动画走完才把
   * 真正的 onClose 交出去。关掉动态效果时那段等待一并消失（见 utils/motion）。
   */
  const [closing, setClosing] = useState(false)
  const dismiss = useCallback(() => setClosing(true), [])
  const devBuild = useDevBuild()
  const appInfo = useNativeAppInfo()
  const revision = webGitRevision()
  const installedAt = useMemo(() => currentBuildInstalledAt(), [])
  useBackHandler(dismiss)

  /*
   * 审核通道的入口：版本号上连点 7 下。
   *
   * 藏在这里而不是做成一枚看得见的按钮——那枚按钮对玩家没有任何意义，却会让
   * 每一个好奇的人去试着输点什么。连点计数只活在这次开着面板的期间；已经开着
   * 通道的机器不必再点一遍（reviewAccessGranted），否则审核员关掉面板再回来
   * 就找不到自己刚开的那一块了。
   */
  const reviewGranted = useReviewAccess()
  const [reviewRevealed, setReviewRevealed] = useState(() => reviewAccessGranted())
  const tapsRef = useRef({ count: 0, at: 0 })
  const tapVersion = useCallback(() => {
    const now = Date.now()
    const taps = tapsRef.current
    taps.count = now - taps.at > REVIEW_TAP_GAP_MS ? 1 : taps.count + 1
    taps.at = now
    if (taps.count >= REVIEW_TAPS) {
      taps.count = 0
      setReviewRevealed(true)
    }
  }, [])

  // onClose 多半是父组件的行内箭头函数，每次渲染都换一个身份；镜像到 ref，
  // 免得退场途中父组件重渲染就把计时器重置一次。
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    if (!closing) return
    const timer = setTimeout(() => {
      // 提交排在交出 onClose 之前的同一拍：两者在同一次 React 更新里落地，
      // 棋盘那一遍重渲染因此只发生一次，且发生在面板已经撤走之后。
      flush()
      onCloseRef.current()
    }, prefersReducedMotion() ? 0 : CLOSE_MS)
    return () => clearTimeout(timer)
  }, [closing, flush])

  /*
   * 兜底：父组件不等退场动画就把面板摘掉（换页、返回键之外的那些路径）时，
   * 已经点选、尚未提交的改动不能跟着一起消失。flush 会清空 pending，
   * 与上面那条计时器重复调用也只会提交一次。
   */
  useEffect(() => flush, [flush])

  const sheetRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startY: number; offset: number } | null>(null)

  /*
   * 下拉关闭。位移直接写在 DOM 上，不走 state——一次下拉要产生几十帧，
   * 每帧都让整个面板重渲染一次，只为改一个 transform。
   */
  const setOffset = useCallback((px: number) => {
    const sheet = sheetRef.current
    if (!sheet) return
    // 跟手时关掉过渡，松手时交还给 CSS，让它自己弹回去
    sheet.style.transition = px === 0 ? '' : 'none'
    sheet.style.transform = px === 0 ? '' : `translateY(${px}px)`
  }, [])

  /*
   * 下拉关闭在整块面板上都能起手，不只是那道横杠。内容区自己也要能滚，
   * 两个手势靠**落指那一刻内容是否已在顶部**分开：
   *
   *   还没滚到顶时，往下拉只是把内容滚回去，与关闭无关；
   *   滚到顶之后松手、再拉，这一下才是关闭。
   *
   * 判断只在落指时做一次，所以一路从中段滑到顶的那同一次手势不会顺势把面板
   * 也带走。
   *
   * 触摸走原生 touch 事件而不是指针事件，因为这里必须 preventDefault：
   * 内容区的 touch-action 是 pan-y（滚动不能被剥夺，见样式表里的说明），
   * 浏览器因此有权把这一笔当成滚动拿走——一旦拿走，指针事件就断在
   * pointercancel 上，面板一动不动，这正是「顶部下滑退不出去」的成因。
   * React 的 onTouchMove 是被动监听，preventDefault 无效，只能自己挂。
   *
   * 认领的时机是**第一次移动**：此刻内容已在顶部，往下没有任何可滚的东西，
   * 手指向下就只可能是要关面板，当场拦下，浏览器再没机会把它算作滚动；
   * 手指向上则是要看下面的内容，这一笔立刻整体放手，不再插手。
   */
  useEffect(() => {
    const sheet = sheetRef.current
    if (!sheet) return

    let startY: number | null = null
    let offset = 0
    let owned = false

    const start = (event: TouchEvent) => {
      // 多指不是这个手势；内容没滚到顶也不是
      const top = event.touches.length === 1 && (bodyRef.current?.scrollTop ?? 0) <= 0
      startY = top ? event.touches[0].clientY : null
      offset = 0
      owned = false
    }

    const move = (event: TouchEvent) => {
      if (startY === null) return
      const dy = event.touches[0].clientY - startY
      if (!owned) {
        if (dy <= 0) {
          // 往上：这一笔是滚动，整笔交还浏览器
          startY = null
          return
        }
        owned = true
      }
      event.preventDefault()
      // 认领之后手指又拉回去：贴着原位不动，不把面板往上顶
      offset = Math.max(0, dy)
      setOffset(offset)
    }

    const end = () => {
      if (startY === null) return
      startY = null
      if (!owned) return
      owned = false
      /*
       * 够远就直接接退场：面板从手指松开的地方继续往下走。行内那个 transform
       * 留着不动——动画声明在层叠里压得过行内样式，sinkOut 会以它为起点，
       * 于是「推开一点」和「送走」是同一个连续的动作，中间不回弹一下。
       */
      if (offset > DISMISS_PX) dismiss()
      else setOffset(0)
    }

    sheet.addEventListener('touchstart', start, { passive: true })
    sheet.addEventListener('touchmove', move, { passive: false })
    sheet.addEventListener('touchend', end)
    sheet.addEventListener('touchcancel', end)
    return () => {
      sheet.removeEventListener('touchstart', start)
      sheet.removeEventListener('touchmove', move)
      sheet.removeEventListener('touchend', end)
      sheet.removeEventListener('touchcancel', end)
    }
  }, [dismiss, setOffset])

  /* 桌面端的鼠标/触控笔走指针事件；触摸已由上面的原生监听接管，不重复处理 */
  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') return
    if ((bodyRef.current?.scrollTop ?? 0) > 0) return
    dragRef.current = { startY: event.clientY, offset: 0 }
  }, [])

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current
      if (!drag) return
      // 往上拽不跟手：这个手势只能把面板送走，不能把它拉高
      drag.offset = Math.max(0, event.clientY - drag.startY)
      setOffset(drag.offset)
    },
    [setOffset],
  )

  const endDrag = useCallback(() => {
    const drag = dragRef.current
    dragRef.current = null
    if (!drag) return
    // 同触摸那一路：够远就从松手的位置继续往下退场，不够远才弹回原位
    if (drag.offset > DISMISS_PX) dismiss()
    else setOffset(0)
  }, [dismiss, setOffset])

  /*
   * 声音与振动的即时反馈：选完这一下就是这一档的样子。
   *
   * 先把值推给两个模块级单例再发——Provider 的 effect 要等这次渲染提交后才跑，
   * 等它就会用上一档的强度发出反馈，正好是最容易被当成 bug 的那种错位。
   */
  const previewSound = useCallback((next: Settings) => {
    setSoundEnabled(next.sound)
    // AudioContext 必须在用户手势内创建，这里正是那一下
    sound.prepare()
    sound.fill()
  }, [])

  const previewVibration = useCallback((next: Settings) => {
    setVibrationEnabled(next.vibration)
    setVibrationStyle(next.vibrationStyle)
    haptics.fill()
  }, [])

  return (
    <div
      className={styles.overlay}
      data-closing={closing || undefined}
      role="dialog"
      aria-modal="true"
      aria-label={t('settings.title')}
      onClick={dismiss}
    >
      <div
        ref={sheetRef}
        className={styles.sheet}
        data-closing={closing || undefined}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className={styles.grabber} aria-hidden="true" />
        <header className={styles.header}>
          <h2 className={styles.title}>{t('settings.title')}</h2>
          <button className={styles.close} onClick={dismiss} aria-label={t('settings.close')}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </header>

        <div className={styles.body} ref={bodyRef}>
          {/*
            这一屏没有小字说明。

            从前每一行下面都跟着一两句「这一档是什么样」：主题、结算背景、音效、
            音量、触感、涂画规则、自动补齐——七行字，把四组设置撑成要滚两屏的长文。
            那些话说的多半是选项名本身已经说清的事（「关」就是不出声），剩下的少数
            （涂画规则那两档的区别）看一遍字也记不住，动手试一次却立刻明白。
            设置面板要能一眼扫完，读完是另一回事。

            开 / 关 一律左关右开：从左到右是从少到多，与下面「优雅 → 鲜明」
            一个方向。混着排的时候，每换一行人就要重新认一次哪边是开。
          */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{t('settings.sectionAppearance')}</h3>
            <Row
              label={t('settings.theme')}
              current={draft.theme}
              /* 主题当场生效：它改的是整页底色，攒到关闭就等于没有反馈 */
              onChoose={(value) => choose('theme', value, { now: true })}
              options={[
                { value: 'system', label: t('settings.themeSystem') },
                { value: 'light', label: t('settings.themeLight') },
                { value: 'dark', label: t('settings.themeDark') },
              ]}
            />
            {/* 两档：什么都不加，或者让画发光。中间那两档柔光的差别小到分不出，
                四选一里有两个选项没人分得清（见 utils/settings.ts） */}
            <Row
              label={t('settings.settleBackdrop')}
              current={draft.settleBackdrop}
              onChoose={(value) => choose('settleBackdrop', value)}
              options={[
                { value: 'none', label: t('settings.settleBackdropNone') },
                { value: 'rays', label: t('settings.settleBackdropRays') },
              ]}
            />
          </section>

          {/*
            音效、振动、触感合成一节。

            从前是「声音」和「振动」两节，各自一个标题、各自两行。可它们回答的是
            同一个问题——涂下这一格，机器怎么应我——一个用耳朵，一个用手。分成两节
            只是按硬件分类，按人的感受分类就是一节：反馈。
          */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{t('settings.sectionFeedback')}</h3>
            <Row
              label={t('settings.sound')}
              current={draft.sound}
              onChoose={(value, silent) =>
                choose('sound', value, { preview: silent ? undefined : previewSound })
              }
              options={[
                { value: false, label: t('settings.off') },
                { value: true, label: t('settings.on') },
              ]}
            />
            <Row
              label={t('settings.vibration')}
              current={draft.vibration}
              onChoose={(value, silent) =>
                choose('vibration', value, { preview: silent ? undefined : previewVibration })
              }
              options={[
                { value: false, label: t('settings.off') },
                { value: true, label: t('settings.on') },
              ]}
            />
            {/*
              两个选项不是强度的大小，是两种手感——所以文案不能写「轻/重」，
              那会让人以为还有一档更大的没给他。选项本身必须能试听，光看字
              分不出音色差异（见 previewVibration）。
            */}
            <Row
              label={t('settings.vibrationStyle')}
              current={draft.vibrationStyle}
              onChoose={(value, silent) =>
                choose('vibrationStyle', value, { preview: silent ? undefined : previewVibration })
              }
              options={[
                { value: 'elegant', label: t('settings.vibrationElegant') },
                { value: 'vivid', label: t('settings.vibrationVivid') },
              ]}
              disabled={!draft.vibration}
            />
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{t('settings.sectionGameplay')}</h3>
            <Row
              label={t('settings.strokeRule')}
              current={draft.strokeRule}
              onChoose={(value) => choose('strokeRule', value)}
              options={[
                { value: 'easy', label: t('settings.strokeRuleEasy') },
                { value: 'strict', label: t('settings.strokeRuleStrict') },
              ]}
            />
            <Row
              label={t('settings.autoMark')}
              current={draft.autoMark}
              onChoose={(value) => choose('autoMark', value)}
              options={[
                { value: false, label: t('settings.off') },
                { value: true, label: t('settings.on') },
              ]}
            />
          </section>

          {/* 语言排在玩法之下、完整版之上：它改的是整屏的字，比玩法偏好更「设置」一点，
              又不像完整版那样是一桩交易 */}
          <LanguageSection />

          {/* 试玩版不挂开发者菜单：它挂在任何人都打得开的网页上，本地 dev 服务器也一样不挂 */}
          {devBuild && !isDemoBuild && <DevMenu onWinNow={devWinNow} onClose={dismiss} />}

          {/* 完整版只在商店渠道（Play / App Store）上存在；直装包一行都不该多出来（见 billing/entitlement） */}
          {isStoreBuild && <FullGameSection />}

          {/*
            关于：三条外链加一行版本号，同一列普通行，不另起一节。

            去评分排最上面：三条里唯一正向的动作，也是玩家真会主动来找的那条。
            它跳商店的评论页，不是系统邀评层——邀评层只能由系统在补完一章时弹
            （见 utils/storeReview），一枚按钮是弹不出它的。

            这三条只在商店渠道有。Apple 要求应用内就能找到政策链接
            （审核指南 5.1.1(i)）和联系方式（1.5），Play 同样受用。直装包没有这些——
            它不上任何商店，政策页本身也只写了商店版本。

            网页试玩版是例外：它挂在官网上给任何人打开，政策与联系方式该在设置里
            找得到（去评分那条仍然没有——试玩不在任何商店）。

            版本号只给 v2.2.1 这一个数：构建号是发版用的，玩家看不出它是什么，
            也不会拿它来说事（诊断信息只在 DEV 包上多出两行）。
          */}
          <div className={styles.aboutList}>
            {(isStoreBuild || isDemoBuild) && (
              <nav aria-label={t('settings.sectionAbout')}>
                {canOpenStoreReview() && (
                  <button type="button" className={styles.aboutRow} onClick={openStoreReviewPage}>
                    <span>{t('settings.rate')}</span>
                    <span className={styles.aboutArrow} aria-hidden="true">›</span>
                  </button>
                )}
                <a
                  className={styles.aboutRow}
                  href={PRIVACY_POLICY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(event) => {
                    event.preventDefault()
                    openExternal(PRIVACY_POLICY_URL)
                  }}
                >
                  <span>{t('settings.privacy')}</span>
                  <span className={styles.aboutArrow} aria-hidden="true">›</span>
                </a>
                <a
                  className={styles.aboutRow}
                  href={SUPPORT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(event) => {
                    event.preventDefault()
                    openExternal(SUPPORT_URL)
                  }}
                >
                  <span>{t('settings.support')}</span>
                  <span className={styles.aboutArrow} aria-hidden="true">›</span>
                </a>
              </nav>
            )}
            <div className={styles.aboutRow}>
              <span>{t('settings.versionCurrent')}</span>
              {/* Play 包上这一行是审核通道的入口；别的渠道就是一行普通的字 */}
              {isPlayBuild ? (
                <button type="button" className={styles.versionTap} onClick={tapVersion}>
                  {appInfo ? `v${appInfo.version}` : t('settings.versionWeb')}
                </button>
              ) : (
                <span className={styles.aboutValue}>
                  {appInfo ? `v${appInfo.version}` : t(isDemoBuild ? 'settings.versionDemo' : 'settings.versionWeb')}
                </span>
              )}
            </div>
            {devBuild && !isPlayBuild && !isDemoBuild && (
              <dl className={styles.versionList}>
                <div className={styles.versionRow}>
                  <dt>{t('settings.versionCommit')}</dt>
                  <dd>
                    <code>{revision.replace('+dirty', '')}</code>
                    {revision.endsWith('+dirty') && (
                      <span className={styles.dirty}>{t('settings.versionDirty')}</span>
                    )}
                  </dd>
                </div>
                <div className={styles.versionRow}>
                  <dt>{t('settings.versionInstalled')}</dt>
                  <dd>{formatLocalDate(installedAt)}</dd>
                </div>
              </dl>
            )}
            {isPlayBuild && (reviewRevealed || reviewGranted) && <ReviewAccessPanel />}
          </div>
        </div>
      </div>
    </div>
  )
}
