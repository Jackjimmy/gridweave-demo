import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Puzzle } from '../../types'
import type { Album } from '../../utils/albums'
import { AlbumAward } from '../AlbumAward/AlbumAward'
import { isDemoBuild } from '../../config/demo'
import type { ChapterRef } from '../../utils/chapters'
import { formatSeconds } from '../../hooks/useTimer'
import { useFitRowOneLine } from '../../hooks/useFitRowOneLine'
import { quietFocus } from '../../utils/quietFocus'
import { t, useT } from '../../i18n'
import { albumTitle, chapterLabel, puzzleDisplayName, puzzleLabel } from '../../i18n/content'
import { Thumbnail } from '../Thumbnail/Thumbnail'
import { NBSP, layoutWord } from './wordLayout'
import type { WordLayout } from './wordLayout'
import styles from './WinModal.module.css'

/*
 * 两枚去处按钮收字号的下界。
 *
 * 9px 只有一处真的会用到：320px 宽的屏上，德语「Zurück zur Auswahl」配着
 * 教学回程那枚「Gewähltes Rätsel spielen」，10px 差半个像素——而半个像素在
 * 屏幕上就是省略号一口吃掉的那两三个字母（见 utils/fitFontSize 里同一笔账）。
 * 按钮上的字缺一截就不知道按下去会去哪儿，小一号仍然读得出来。
 */
const MIN_ACTION_PX = 9

const LETTER_DELAY_MS = 260
const LETTER_STAGGER_MS = 62
const LETTER_DURATION_MS = 380

function wordRevealDurationMs(word: string) {
  return LETTER_DELAY_MS + Math.max(0, word.length - 1) * LETTER_STAGGER_MS + LETTER_DURATION_MS
}

/** CSS `ease`（cubic-bezier(.25,.1,.25,1)）的数值版本。 */
function ease(progress: number) {
  const x = Math.min(1, Math.max(0, progress))
  let t = x
  for (let i = 0; i < 5; i += 1) {
    const inverse = 1 - t
    const currentX = 3 * inverse * inverse * t * 0.25 + 3 * inverse * t * t * 0.25 + t ** 3
    const slope = 3 * inverse * inverse * 0.25 + 3 * t * t * 0.75
    if (slope === 0) break
    t -= (currentX - x) / slope
  }
  const inverse = 1 - t
  return 3 * inverse * inverse * t * 0.1 + 3 * inverse * t * t + t ** 3
}

/** 建表阶段备好的一切；绘制循环只读它，不再回头问 DOM */
interface WordPaint {
  context: CanvasRenderingContext2D
  cssWidth: number
  cssHeight: number
  /** 基线纵坐标。画布上下各有出血，但出血对称，所以按画布高度居中即可 */
  baseline: number
  layout: WordLayout
}

/** 把某一时刻的画面整块画出来。这里只有算术与 fillText，不碰 DOM、不分配 */
function paintWord({ context, cssWidth, cssHeight, baseline, layout }: WordPaint, elapsed: number) {
  context.clearRect(0, 0, cssWidth, cssHeight)

  layout.glyphs.forEach((glyph, index) => {
    const local = (elapsed - LETTER_DELAY_MS - index * LETTER_STAGGER_MS) / LETTER_DURATION_MS
    if (local < 0 || glyph.drawable === NBSP) return

    const progress = Math.min(1, local)
    const opacity = ease(progress)
    let translateY: number
    let scale: number
    if (progress < 0.6) {
      const segment = ease(progress / 0.6)
      translateY = 10 - 12 * segment
      scale = 0.7 + 0.38 * segment
    } else {
      const segment = ease((progress - 0.6) / 0.4)
      translateY = -2 + 2 * segment
      scale = 1.08 - 0.08 * segment
    }

    context.save()
    context.globalAlpha = opacity
    context.translate(glyph.centerX, baseline + translateY)
    context.scale(scale, scale)
    context.fillText(glyph.drawable, 0, 0)
    context.restore()
  })
}

interface WordRevealProps {
  word: string
  entering: boolean
  immediate?: boolean
  /** 拿不到 2d 上下文或名称装不下时，交回可换行 DOM。 */
  onUnavailable: () => void
}

/** 保留原逐字弹跳时间轴，但把所有字形画进同一个合成表面。 */
function WordReveal({ word, entering, immediate = false, onUnavailable }: WordRevealProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const paintRef = useRef<WordPaint | null>(null)
  /** 最后画到的时刻。尺寸变化后按它重画，动画早已结束时也落得回终态 */
  const elapsedRef = useRef(0)
  const unavailableRef = useRef(onUnavailable)
  unavailableRef.current = onUnavailable
  /*
   * <html data-theme> 换了要重新取笔色。字色是建表时从 computed style 里读死的，
   * 而主题不走 props——通关之后从右上角进设置切成深色再回来，这行字会留着浅色
   * 那支笔，在暗底上成了一行灰字。棋盘那张画布踩过同一个坑，解法也一样
   * （见 Board/BoardCanvas.tsx）。
   */
  const [theme, setTheme] = useState<string | undefined>(
    typeof document === 'undefined' ? undefined : document.documentElement.dataset.theme,
  )

  useEffect(() => {
    const root = document.documentElement
    const observer = new MutationObserver(() => setTheme(root.dataset.theme))
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  // 建表：字号收敛、字形量取、上下文状态，全部在卡片还停在屏外时付清
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) {
      // 极老 WebView 拿不到 2d 上下文：单词交回 DOM，不能让卡片上只剩一片空白
      unavailableRef.current()
      return
    }

    const measure = () => {
      const cssWidth = canvas.clientWidth
      const cssHeight = canvas.clientHeight
      const dpr = Math.min(window.devicePixelRatio || 1, 3)
      canvas.width = Math.max(1, Math.round(cssWidth * dpr))
      canvas.height = Math.max(1, Math.round(cssHeight * dpr))
      // 改 canvas.width 会重置 2d 上下文状态，下面这些必须排在它之后
      context.setTransform(dpr, 0, 0, dpr, 0, 0)

      const computed = getComputedStyle(canvas)
      const weight = computed.fontWeight
      const family = computed.fontFamily
      context.fillStyle = computed.color
      context.textAlign = 'center'
      context.textBaseline = 'alphabetic'

      const layout = layoutWord(
        (fontPx, glyph) => {
          context.font = `${weight} ${fontPx}px ${family}`
          return context.measureText(glyph).width
        },
        word,
        {
          basePx: Number.parseFloat(computed.fontSize) || 0,
          baseSpacing: Number.parseFloat(computed.letterSpacing) || 0,
          boxWidth: cssWidth,
        },
      )
      if (layout.needsWrap) {
        paintRef.current = null
        unavailableRef.current()
        return
      }
      context.font = `${weight} ${layout.fontPx}px ${family}`
      const metrics = context.measureText('Hg')
      const baseline =
        (cssHeight + metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2
      paintRef.current = { context, cssWidth, cssHeight, baseline, layout }
    }

    /*
     * 尺寸一变就得重排重画。canvas 不像 DOM 文本会自己重新布局：改 canvas.width
     * 等于清空画面，而动画跑完之后再没有一帧来补——转一次屏，那行字就永远地
     * 又拉伸又偏心。同一个坑与同一种解法见 RevealCanvas 的 ResizeObserver。
     * 再挂一条 window.resize：RO 并非处处可靠（每日挑战那次排查里它一次都没触发）。
     */
    const remeasure = () => {
      measure()
      if (paintRef.current) paintWord(paintRef.current, elapsedRef.current)
    }
    // 建表之后立刻补画一帧：换主题走的也是这条路，重排会清空画布，
    // 而动画早已结束时再没有一帧来补
    remeasure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(remeasure)
    observer?.observe(canvas)
    window.addEventListener('resize', remeasure)

    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', remeasure)
      paintRef.current = null
    }
  }, [word, theme])

  useEffect(() => {
    if (!entering || !paintRef.current) return
    const totalDuration = wordRevealDurationMs(word)
    const reduceMotion = immediate || window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let animationFrame = 0
    let startTimer: number | null = null
    const startedAt = performance.now() - (reduceMotion ? totalDuration : 0)

    const draw = (now: number) => {
      const paint = paintRef.current
      if (!paint) return
      const elapsed = now - startedAt
      elapsedRef.current = elapsed
      paintWord(paint, elapsed)
      if (!reduceMotion && elapsed < totalDuration) animationFrame = requestAnimationFrame(draw)
    }

    if (reduceMotion) {
      draw(performance.now())
    } else {
      // 260ms 之前画面本来就是空白，不要让无效 Canvas 帧和白卡上升争预算。
      // 计时锚仍钉在 entering 那一刻（startedAt），推迟启动不会让整条时间轴后移。
      startTimer = window.setTimeout(() => {
        animationFrame = requestAnimationFrame(draw)
      }, LETTER_DELAY_MS)
    }
    return () => {
      if (startTimer !== null) window.clearTimeout(startTimer)
      cancelAnimationFrame(animationFrame)
    }
  }, [entering, word, immediate])

  return <canvas ref={canvasRef} className={styles.wordCanvas} aria-hidden="true" />
}

interface Props {
  puzzle: Puzzle
  elapsedSeconds: number
  /** 本次之前的最佳用时；从未通关时为 undefined */
  bestSeconds?: number
  /** 本次是否为该关卡的首次通关 */
  firstClear?: boolean
  onNext?: () => void
  nextLabel?: string
  nextDescription?: string
  completedAlbum?: Album
  onChooseAlbum?: () => void
  immediate?: boolean
  onEntered?: () => void
  /**
   * 退出那一枚按钮上永远只写「返回」，不写回到哪儿。
   *
   * 从前它写「返回选关」「返回每日挑战日历」——两枚按钮一长一短，英文里
   * 「Back to puzzles」压着「Next ›」，整排失衡。玩家按下去回的就是刚才来的
   * 地方，那个地方不必再念一遍；去处仍留在顶栏返回键的读屏名里（Toolbar）。
   */
  onExit: () => void
  /** 屏外预挂载到真正入场之间的时间。 */
  enterDelayMs?: number
  /** 结算卡真实高度变化时通知对局页同步棋盘让位量。 */
  onHeightChange?: (height: number) => void
  /** 这一关首次通关后恰好收齐的章；只在该次结算展示。章名由 ref 现解析。 */
  completedChapter?: { ref: ChapterRef; puzzles: Puzzle[] }
  /**
   * 「某某章 · 完成」那块（或集齐整册的那块）已经在屏上稳住了一会儿。
   * 商店邀评挂在这一刻之后（见 utils/storeReview）：系统弹层不能压在揭晓和结算的节奏上。
   */
  onChapterCompleteShown?: () => void
}

/*
 * 成绩那一行：首次通关 / 破纪录 / 未破纪录，三种态给三种说法。
 *
 * 从前这三种态各配一枚荣誉标（首次通关 / 新纪录），标又要顶着一行「NEW WORD」
 * 一起排在卡片最上面。一张 204px 高的卡上于是叠了五层字：栏目名、荣誉标、
 * 英文词、中文名、成绩——真正的主角（棋盘上刚揭晓的那张画）反倒被这堆说明压着。
 * 荣誉标说的事成绩那一行本来就说了（「快了 15 秒」比「新纪录」还具体），
 * 撤掉它只是不重复说话；这一行仍按三种态给三种反馈，破纪录时字自己加重。
 */
function scoreLine(elapsedSeconds: number, bestSeconds?: number, firstClear?: boolean) {
  const time = formatSeconds(elapsedSeconds)
  if (firstClear) return { text: t('win.time', { time }), highlight: true }
  if (bestSeconds !== undefined && elapsedSeconds < bestSeconds) {
    return {
      text: t('win.timeFaster', { time, seconds: bestSeconds - elapsedSeconds }),
      highlight: true,
    }
  }
  if (bestSeconds !== undefined) {
    return {
      text: t('win.timeBest', { time, best: formatSeconds(bestSeconds) }),
      highlight: false,
    }
  }
  return { text: t('win.time', { time }), highlight: false }
}

/**
 * 通关结算 = 单词学习卡，从屏幕底部升起。
 *
 * 刻意不做成全屏模态、也不再放缩略图：棋盘上那张刚揭晓的画就是主角，
 * 结算卡只负责在它下方补上单词、成绩和去处，全程不遮挡它。
 */
/**
 * 章名完成那行字出现到「可以邀评」之间的停顿。系统邀评层一弹就盖住结算卡，
 * 得先让人把「这一章收齐了」看进去；也不能长到玩家已经点了「下一关」。
 */
const CHAPTER_SHOWN_MS = 900

export function WinModal({
  puzzle,
  elapsedSeconds,
  bestSeconds,
  firstClear,
  onNext,
  nextLabel,
  nextDescription,
  completedAlbum,
  onChooseAlbum,
  immediate = false,
  onEntered,
  onExit,
  enterDelayMs = 0,
  onHeightChange,
  completedChapter,
  onChapterCompleteShown,
}: Props) {
  const translate = useT()
  /*
   * 揭晓那一刻的名字。中日韩是英文大字压本地小字（顺手认一个英文单词，
   * 这是产品从第一版起就在做的事），英文只有英文一行，德法西葡只有本地名一行。
   * 规则在 i18n/content 的 puzzleDisplayName，四处展示关卡名的地方共用同一条。
   */
  const name = puzzleDisplayName(puzzle, translate.locale)
  /* 收齐回顾的章名同样由三段稳定键现解析，并且只显示当前语言。 */
  const chapterName = completedChapter
    ? chapterLabel(completedChapter.ref, translate.locale)
    : undefined
  const milestone = completedAlbum !== undefined
  const word = name.primary
  const score = scoreLine(elapsedSeconds, bestSeconds, firstClear)
  const primaryRef = useRef<HTMLButtonElement>(null)
  /*
   * 底下那两枚按钮必须并排站着：卡片一长高就把刚揭晓的那幅画往上顶。
   * 哪种语言会顶出去不由视口决定（德语「Zurück zur Auswahl」＋
   * 「Nächstes Kapitel」在 375px 上正好差一点），所以量着收字号。
   * 下界之下（几乎碰不到）交给 text-overflow。
   */
  const actionRowRef = useFitRowOneLine<HTMLDivElement>(MIN_ACTION_PX)
  const sheetRef = useRef<HTMLDivElement>(null)
  const onHeightChangeRef = useRef(onHeightChange)
  onHeightChangeRef.current = onHeightChange
  const [entering, setEntering] = useState(enterDelayMs === 0)
  const entered = entering || immediate
  const [settled, setSettled] = useState(enterDelayMs === 0)
  // 只为当前名称退回 DOM；换到短名称时仍可使用画布揭晓。
  const [fallbackWord, setFallbackWord] = useState<string | null>(null)
  const wordCanvasUnavailable = fallbackWord === word
  const handleWordUnavailable = useCallback(() => setFallbackWord(word), [word])

  useLayoutEffect(() => {
    const sheet = sheetRef.current
    if (!sheet) return
    let lastHeight = 0
    const measure = () => {
      const height = Math.ceil(sheet.getBoundingClientRect().height)
      if (height <= 0 || height === lastHeight) return
      lastHeight = height
      onHeightChangeRef.current?.(height)
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(sheet)
    window.addEventListener('resize', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  useEffect(() => {
    if (entered) onEntered?.()
  }, [entered, onEntered])

  useEffect(() => {
    if (enterDelayMs === 0 || immediate) return
    let frame: number | null = null
    const timer = window.setTimeout(() => {
      frame = requestAnimationFrame(() => setEntering(true))
    }, enterDelayMs)
    return () => {
      window.clearTimeout(timer)
      if (frame !== null) cancelAnimationFrame(frame)
    }
  }, [enterDelayMs, immediate])

  // 卡片升起结束后才交出焦点，避免 focus() 在动画首帧强制布局。
  // 这一下焦点是替读屏和键盘补的，不画描边——不然每次开局头一回通关，
  // 「下一关」会凭空套一个蓝框（见 quietFocus）。
  useEffect(() => {
    if (!entered) return
    let release: (() => void) | null = null
    const focus = () => {
      if (primaryRef.current) release = quietFocus(primaryRef.current)
    }
    const focusTimer = enterDelayMs === 0 || immediate ? null : window.setTimeout(focus, 620)
    if (enterDelayMs === 0 || immediate) focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onExit()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      if (focusTimer !== null) window.clearTimeout(focusTimer)
      window.removeEventListener('keydown', onKeyDown)
      release?.()
    }
  }, [entered, enterDelayMs, immediate, onExit])

  useEffect(() => {
    if (!entering || enterDelayMs === 0) return
    const timer = window.setTimeout(() => setSettled(true), wordRevealDurationMs(word))
    return () => window.clearTimeout(timer)
  }, [entering, enterDelayMs, word])

  /*
   * 收齐一章（或集齐整册）的那块字稳住之后再过一拍，才通知外面「可以邀评了」。
   * 只报一次：这段 effect 的依赖在卡片站稳之后不会再变。
   */
  const chapterShown = (settled || immediate) && (completedChapter !== undefined || milestone)
  const onChapterCompleteShownRef = useRef(onChapterCompleteShown)
  onChapterCompleteShownRef.current = onChapterCompleteShown
  useEffect(() => {
    if (!chapterShown) return
    const timer = window.setTimeout(() => onChapterCompleteShownRef.current?.(), CHAPTER_SHOWN_MS)
    return () => window.clearTimeout(timer)
  }, [chapterShown])

  return (
    <div
      ref={sheetRef}
      className={`${styles.sheet} ${entered ? styles.entering : ''} ${settled ? styles.settled : ''} ${immediate ? styles.immediate : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={translate('win.aria')}
      aria-hidden={!entered}
      inert={!entered}
    >
      {completedAlbum && !isDemoBuild && (
        <section className={styles.albumComplete} aria-label={translate('win.albumComplete')}>
          <div className={styles.albumCover}>
            <Thumbnail puzzle={completedAlbum.emblem} />
            <AlbumAward className={styles.albumAward} plain />
          </div>
          <div className={styles.albumCopy}>
            <p className={styles.milestoneLabel}>{translate('win.albumComplete')}</p>
            <h2>{albumTitle(completedAlbum.id, translate.locale)}</h2>
            <p className={styles.albumTally}>
              {translate('win.albumTally', { total: completedAlbum.puzzles.length })}
            </p>
          </div>
        </section>
      )}
      {/*
        试玩版集齐一本合集：不用「整本画册 6 / 6」那套——试玩里的一本只有六关，
        照正式版的口径写会让人以为正式版的一本也就这么点。这里只说三样：六幅画
        摆成一条（刚解开的那幅圈出来）、「合集已收齐」、书名。收齐了几幅、
        完整版有多少不再另写；但刚解开的那幅仍要在下面的「藏品已解锁」行里点名，
        否则最后一关会丢掉中英文名称。
      */}
      {completedAlbum && isDemoBuild && (
        <section
          className={styles.collectionComplete}
          aria-label={translate('win.demoCollectionComplete')}
        >
          <ul className={styles.collectionStrip}>
            {completedAlbum.puzzles.map((entry) => (
              <li
                key={entry.id}
                title={puzzleLabel(entry, translate.locale)}
                data-just={entry.id === puzzle.id || undefined}
              >
                <Thumbnail puzzle={entry} />
              </li>
            ))}
          </ul>
          <p className={styles.milestoneLabel}>
            <AlbumAward className={styles.collectionAward} plain />
            {translate('win.demoCollectionComplete')}
          </p>
          <h2 className={styles.collectionTitle}>{albumTitle(completedAlbum.id, translate.locale)}</h2>
        </section>
      )}
      {milestone ? (
        <p className={styles.lastPicture}>
          {translate('win.pictureCollected', { picture: puzzleLabel(puzzle, translate.locale) })}
        </p>
      ) : (
        <>
          <h2 className={`${styles.word} ${wordCanvasUnavailable ? styles.wordWrapped : ''}`} lang={translate.locale === 'en' ? 'en' : undefined}>
            {/* 单词的无障碍名一直由这个 span 提供；画布只负责好看，对读屏是隐形的 */}
            <span className={wordCanvasUnavailable ? styles.wordText : styles.wordAccessible}>
              {word}
            </span>
            {!wordCanvasUnavailable && (
              <WordReveal word={word} entering={entered} immediate={immediate} onUnavailable={handleWordUnavailable} />
            )}
          </h2>
          {name.secondary !== undefined && <p className={styles.nameZh}>{name.secondary}</p>}
        </>
      )}
      <p className={score.highlight ? styles.timeHighlight : styles.time}>{score.text}</p>
      {!milestone && completedChapter && chapterName && (
        <section
          className={styles.chapterComplete}
          aria-label={translate('win.chapterComplete', { chapter: chapterName })}
        >
          <div className={styles.chapterCompleteHead}>
            <strong>{translate('win.chapterComplete', { chapter: chapterName })}</strong>
          </div>
          <ul className={styles.chapterThumbs}>
            {completedChapter.puzzles.map((chapterPuzzle) => (
              <li key={chapterPuzzle.id} title={puzzleLabel(chapterPuzzle, translate.locale)}>
                <Thumbnail puzzle={chapterPuzzle} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {milestone ? (
        <>
          <div className={styles.albumActions} ref={actionRowRef}>
            <button type="button" className={styles.primary} ref={primaryRef} onClick={onChooseAlbum}>
              <span className={styles.actionLabel} data-fit-row="">
                {translate(isDemoBuild ? 'win.demoChooseAlbum' : 'win.chooseAlbum')}
              </span>
            </button>
          </div>
          <button type="button" className={styles.exitLink} onClick={onExit}>
            {translate('common.back')}
          </button>
        </>
      ) : (
        <>
          {nextDescription && <p className={styles.nextDescription}>{nextDescription}</p>}
          <div className={styles.actions} ref={actionRowRef}>
            <button className={styles.secondary} onClick={onExit} ref={onNext ? undefined : primaryRef}>
              <span className={styles.actionLabel} data-fit-row="">
                {translate('common.back')}
              </span>
            </button>
            {onNext && (
              <button className={styles.primary} onClick={onNext} ref={primaryRef}>
                <span className={styles.actionLabel} data-fit-row="">
                  {nextLabel ?? translate('win.next')}
                </span>
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
