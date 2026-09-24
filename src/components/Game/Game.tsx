import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { App as CapApp } from '@capacitor/app'
import type { Board, Puzzle, PuzzleProgress } from '../../types'
import type { ChapterRef } from '../../utils/chapters'
import { artColorGrid } from '../../utils/art'
import { resolveSubjectPalette, sceneColorGrid } from '../../utils/scene'
import { getSceneById } from '../../data/scenes'
import { deriveLineState } from '../../utils/lineState'
import type { LineStateCache } from '../../utils/lineState'
import { createPuzzleBoard, isPuzzleBoardPristine } from '../../utils/presetMarks'
import { findHint, hintCrossMessage } from '../../utils/hint'
import type { Hint } from '../../utils/hint'
import {
  encodeBoard,
  loadTutorialSeen,
  saveTutorialSeen,
  loadTutorial2Seen,
  saveTutorial2Seen,
} from '../../utils/storage'
import { holdSoundOutput, sound } from '../../utils/sound'
import { requestReviewAfterChapter } from '../../utils/storeReview'
import { haptics } from '../../utils/haptics'
import { prefersReducedMotion } from '../../utils/motion'
import { useT } from '../../i18n'
import type { TextKey } from '../../i18n'
import { useGameState } from '../../hooks/useGameState'
import type { CellIntent, CellMutation } from '../../hooks/useGameState'
import { useSettings } from '../../hooks/settingsContext'
import { usePointerInput } from '../../hooks/usePointerInput'
import { useKeyboardInput } from '../../hooks/useKeyboardInput'
import { useSnappedCellSize } from '../../hooks/useSnappedCellSize'
import type { CellPosition } from '../../hooks/usePointerInput'
import { formatSeconds, useTimer } from '../../hooks/useTimer'
import { GameBoard } from '../Board/GameBoard'
import { buildHintView } from '../Board/hintView'
import type { HintView } from '../Board/hintView'
import { ClueLine } from '../Clues/ClueLine'
import { getPuzzleClueLayout } from '../Clues/clueLayout'
import { DEMO_CLUE_SCALE_SPAN, isDemoBuild } from '../../config/demo'
import { useViewportRoom } from '../../hooks/useViewportRoom'
import { ActionBar } from '../ActionBar/ActionBar'
import { ConfirmSheet } from '../ConfirmSheet/ConfirmSheet'
import { Toolbar } from '../Toolbar/Toolbar'
import { SettingsModal } from '../Settings/SettingsModal'
import { journeySeen, rememberJourney } from '../../utils/journey'
import { HintIntro } from '../Tutorial/HintIntro'
import { SizeIntro } from '../Tutorial/SizeIntro'
import { useLearningTip } from '../Tutorial/useLearningTip'
import { TutorialCoach } from '../Tutorial/TutorialCoach'
import { useTutorialCoach } from '../Tutorial/useTutorialCoach'
import type { Coach } from '../Tutorial/useTutorialCoach'
import {
  HINT_INTRO_LEVEL_ID,
  TUTORIAL_LEVEL_ID,
  TUTORIAL2_LEVEL_ID,
  COACH_STEPS,
  COACH_STEPS_STAR,
} from '../Tutorial/coachScript'
import type { Album } from '../../utils/albums'
import { WinModal } from '../WinModal/WinModal'
import {
  REVEAL_BUFFER_MS,
  getBoardRevealDurationMs,
  getWinModalDelayMs,
} from './winTiming'
import styles from './Game.module.css'

const SAVE_DEBOUNCE_MS = 500

/**
 * 两条清空入口共用同一张确认面板：确认之后失去的东西是同一份，只有措辞不同。
 * 底部那一下问的是「还重开吗」，顶栏那一下问的是「教学要从空盘讲起，清吗」。
 */
const RESTART_TEXTS: Record<'restart' | 'tutorial', Record<'title' | 'description' | 'confirm', TextKey>> = {
  restart: {
    title: 'game.restartTitle',
    description: 'game.restartDescription',
    confirm: 'game.restartConfirm',
  },
  tutorial: {
    title: 'game.tutorialRestartTitle',
    description: 'game.tutorialRestartDescription',
    confirm: 'game.tutorialRestartConfirm',
  },
}

/**
 * 提示那句话在计数槽里停留多久。
 *
 * 到点只收文案，行列高亮留着——话说完了就该把计数还给玩家，但「该看哪一行」
 * 得一直摆在那儿，直到他真的动手（落子会把整条提示清掉）。
 */
const HINT_NOTE_MS = 6000

/**
 * 通关正反馈拆成单字，逐字渐入（见 Game.module.css 的 unlockIn）。
 *
 * 中文五个字，德语「Bild freigeschaltet!」是二十个字符——按字符错开的话
 * 最后一个字要等到 19 × 每字的间隔才出场，那不是渐入，是在等。所以每字的
 * 间隔按字数摊：字越多每字越短，整句浮现的总时长与中文那五个字一样。
 * 摊出来的比例交给 CSS（--unlock-stagger），这里只数字数。
 */
function unlockChars(text: string): string[] {
  return [...text]
}

/**
 * 揭晓落幕到「关卡解锁！」浮现之间的起拍（结算四拍的第二拍，见 winTiming.ts）。
 * 这里同时是挂载时刻与动画起点——改它等于改这一拍的时序。
 */
const UNLOCK_DELAY_MS = 300

/**
 * 一格只能产生一种即时棋盘触感。通关格保留自身语义、跳过 firm；普通完成格用
 * firm 取代落子；同一笔画里的后续格用同工具、更轻的一记刻度。
 */
function fireCellHaptic(mutation: CellMutation, firstChangedCell: boolean): void {
  if (!mutation.won && mutation.completedLine) {
    haptics.firm()
    return
  }
  if (!firstChangedCell && !mutation.won) {
    haptics.strokeStep(mutation.kind)
    return
  }
  haptics[mutation.kind]()
}

/**
 * 一格一声，和触感发自同一处：reducer 刚返回「这格确实改变」的那一刻。
 *
 * 从前声音挂在渲染之后的 board diff 上（被动 effect），一次 commit 只发一声。
 * pointermove 是 continuous 优先级，同一帧里的几次移动会合并成一次渲染，掉一帧
 * 就几格并成一声；音符的时间戳又取自 effect 跑到的那一刻，晚多少、抖多少全看
 * 那一帧有多挤。安卓冷启动第一关正是最挤的一段（JIT 没热、棋盘第一次排版、
 * 桥第一次走触感），听感就是「声音卡」。触感早就搬到这条同步路上了，声音跟上。
 *
 * 通关那一格不发落子声：只由 sound.win 收束（见揭晓那一段）。
 */
function playCellSound(mutation: CellMutation): void {
  if (mutation.won) return
  if (mutation.kind === 'fill') sound.fill()
  else if (mutation.kind === 'mark') sound.mark()
  else sound.clear()
}

interface Props {
  tutorialRequested?: boolean
  onTutorialRequestHandled?: () => void
  learningTools?: boolean
  sizeExperienced?: boolean
  puzzle: Puzzle
  /** 进入关卡时的存档快照；对局中的更新不回流（组件按关卡 key 重挂载） */
  initialProgress?: PuzzleProgress
  /** 顶栏标题覆盖（每日挑战等库外关卡用）；缺省显示棋盘尺寸 */
  titleOverride?: string
  /** 顶栏返回键的读屏名（每日挑战、藏品页说清回到哪儿）；结算卡上那枚只写「返回」 */
  exitLabel?: string
  onPersist: (puzzleId: string, progress: PuzzleProgress) => void
  onCompleted: (puzzleId: string, timeSeconds: number) => void
  onExit: () => void
  onNext?: () => void
  /** 当前章；首次补齐最后一幅时交给结算卡做整组回看。章名由 ref 现解析，不预先取名。 */
  chapter?: { ref: ChapterRef; puzzles: Puzzle[] }
  completesChapterOnFirstClear?: boolean
  nextLabel?: string
  nextDescription?: string
  completedAlbum?: Album
  onChooseAlbum?: () => void
}

export function Game({
  puzzle,
  initialProgress,
  titleOverride,
  exitLabel,
  onPersist,
  onCompleted,
  onExit,
  onNext,
  chapter,
  completesChapterOnFirstClear,
  nextLabel,
  nextDescription,
  completedAlbum,
  onChooseAlbum,
  tutorialRequested = false,
  onTutorialRequestHandled,
  learningTools = false,
  sizeExperienced = false,
}: Props) {
  const t = useT()
  // 父组件在通关落盘后会立刻把当前关改成 everCompleted；是否“补齐最后一幅”
  // 必须取进场时的快照，不能被这次写入反过来抹掉。
  const completesChapterRef = useRef(completesChapterOnFirstClear)
  const completedAlbumRef = useRef(completedAlbum)
  // 已完成的关卡重进时从空盘开始（重玩），未完成则续玩
  const resume = initialProgress && !initialProgress.completed ? initialProgress : undefined

  const [showTutorial, setShowTutorial] = useState(() => {
    const first = puzzle.id === TUTORIAL_LEVEL_ID && !loadTutorialSeen()
    const second = puzzle.id === TUTORIAL2_LEVEL_ID && loadTutorialSeen() && !loadTutorial2Seen()
    return (first || second) && !resume?.board && !initialProgress?.completed && !initialProgress?.everCompleted
  })
  const [showSizeIntro, setShowSizeIntro] = useState(() =>
    (puzzle.size === 10 || puzzle.size === 15) && !sizeExperienced &&
    !initialProgress?.board && !initialProgress?.completed && !initialProgress?.everCompleted &&
    !journeySeen(`size-${puzzle.size}`))
  const closeSizeIntro = useCallback(() => {
    rememberJourney(`size-${puzzle.size}`)
    setShowSizeIntro(false)
  }, [puzzle.size])
  /*
   * 第二关开局那一页提示介绍（见 Tutorial/HintIntro）。只给这一关的第一次：
   * 有半局、打过的都不再讲——那时候他早就见过这枚按钮了。
   */
  const [showHintIntro, setShowHintIntro] = useState(() =>
    puzzle.id === HINT_INTRO_LEVEL_ID &&
    !initialProgress?.board && !initialProgress?.completed && !initialProgress?.everCompleted &&
    !journeySeen('hint-intro'))
  const closeHintIntro = useCallback(() => {
    rememberJourney('hint-intro')
    // 提示已经当面介绍过，入门阶段那条「卡住了？点灯泡」的停顿提醒就不必再来
    rememberJourney('tool-hint')
    setShowHintIntro(false)
  }, [])
  /** 有一层说明压在盘上：不落笔、不计时、不出学习提醒 */
  const reading = showSizeIntro || showHintIntro
  const { settings } = useSettings()
  const game = useGameState(puzzle, resume?.board, {
    strokeRule: settings.strokeRule,
    autoMark: showTutorial || settings.autoMark,
  })
  const resetGameState = game.reset
  const [showSettings, setShowSettings] = useState(false)
  /*
   * 确认面板开着没有，以及**谁把它叫起来的**：底部的「重新开始」，还是顶栏的
   * 「新手教学」。两条路都要清空盘面，确认之后的收尾不一样——教学那条清完还要
   * 把教学层拉起来。空盘按下时两条都不开，见 askRestart / openTutorial。
   */
  const [restartAsked, setRestartAsked] = useState<'restart' | 'tutorial' | null>(null)
  /*
   * 当前提示。board 记的是算这条提示时的盘面——玩家一落子它就过期了，
   * 由下面那条 effect 整条清掉，绝不拿旧盘面上的结论继续高亮。
   *
   * level 是同一条提示被追问的次数：1 只点亮一条线，2 才叠上另一条轴、
   * 锁死交点那一格。第一次不做行列叠加是有意的——两条线一交叉，
   * 那一格就等于直接给了答案，玩家该自己走的那一步被人替他走了。
   */
  const [hint, setHint] = useState<{
    hint: Hint | null
    board: Board
    level: 1 | 2
    /** 按下提示的次数，用来让重叠法那段动画每次都重放（见 HintOverlay 的 token） */
    token: number
  } | null>(null)
  const [hintNoteVisible, setHintNoteVisible] = useState(false)
  const closeTutorial = useCallback(() => {
    if (puzzle.id === TUTORIAL2_LEVEL_ID) saveTutorial2Seen()
    else saveTutorialSeen()
    setShowTutorial(false)
  }, [puzzle.id])
  /*
   * 提示。第一次点给一条线，卡在原地再点一次才叠上另一条轴。
   *
   * 盘面没变才算「再点一次」：中间但凡落了一子，玩家就不是卡在同一个地方了，
   * 这时候该重新找一条最基础的线给他，而不是继续把上一条讲深。
   */
  const requestHint = useCallback(() => {
    if (game.status !== 'playing') return
    const board = game.board
    setHint((current) => {
      const token = (current?.token ?? 0) + 1
      if (current && current.board === board && current.hint) {
        return { ...current, level: 2, token }
      }
      return { hint: findHint(board, puzzle.clues, puzzle.solution), board, level: 1, token }
    })
  }, [game.board, game.status, puzzle.clues, puzzle.solution])

  // 玩家一动盘面，提示即刻作废——它是对某个具体盘面说的话
  useEffect(() => {
    setHint((current) => (current && current.board !== game.board ? null : current))
  }, [game.board])

  // 提示文案只停留一会儿，高亮留着（理由见 HINT_NOTE_MS）
  useEffect(() => {
    if (!hint) {
      setHintNoteVisible(false)
      return
    }
    setHintNoteVisible(true)
    const timer = setTimeout(() => setHintNoteVisible(false), HINT_NOTE_MS)
    return () => clearTimeout(timer)
  }, [hint])

  const [hovered, setHovered] = useState<CellPosition | null>(null)
  // 胜利后先播棋盘揭晓动画，再弹出结算框
  const [winCardMounted, setWinCardMounted] = useState(false)
  // 揭晓动画放完（或因降低动态效果被跳过）后棋盘转为静态终态，canvas 随之卸载
  const [revealed, setRevealed] = useState(false)
  /*
   * 通关动画期间是否把参与合成的几层钉住（见 Game.module.css 的 data-holding-layers）。
   *
   * 从胜利那一刻起一直钉到离开这一局为止——没有更早的时机可撤，理由见
   * Game.module.css 里那段实测记录。离开时 DOM 整个卸载，图层随之销毁，
   * 降级重光栅根本不会发生，这是唯一不要钱的撤法。
   */
  const [holdingLayers, setHoldingLayers] = useState(false)
  /*
   * 「关卡解锁！」是否已挂载。它比 revealed 晚 UNLOCK_DELAY_MS。
   *
   * 这段起拍从前写在 CSS 的 animation-delay 里，但延迟只推迟动画、推迟不了
   * DOM 挂载：揭晓落幕那一帧本来就要跑 canvas 的定妆全量重画、React 提交、
   * 棋盘挂投影并起缩放动画，字样的挂载再往上叠一层纯属自找。
   * 改成晚挂载，观感与从前一致（那 0.3s 里它本来也是全透明的）。
   */
  const [unlockVisible, setUnlockVisible] = useState(false)
  /*
   * 解锁字样一旦出现，位置基准就不能再跟着结算卡的实测高度变化。
   *
   * WinModal 会在屏外预挂载，并在 layout effect 中回报真实高度；有安全区的 iPhone
   * 上它通常会比 --win-card-min-height 高。若字样仍直接读取 --win-card-height，
   * 它已经入场后会被这次回报再推一次，看起来就是「关卡解锁！」自己换了位置。
   * 这里存的是 CSS 值而非重复一份 228px 常量：首次显示前卡片尚未量到时，仍由
   * --win-card-min-height 作唯一的默认值来源。
   */
  const [unlockCardHeight, setUnlockCardHeight] = useState<string | null>(null)
  /*
   * 「关卡解锁！」的竖直位置：它该落在顶栏标题与画的上沿之间，而不是计数槽的正中。
   * 计数槽紧贴顶栏，画却在 .boardScroll 里居中、下方还给结算卡留着位置，
   * 槽的正中因此离画很远，字样待在那里明显贴着顶栏。
   *
   * 这两条边只有布局知道，且随屏幕高度变化——写死一个下移量在矮屏上会压到画上
   * （360×640 实测越过画的上沿 18.7px）。所以量一次：量的是**上移前**的位置，
   * 结算时画会上移的那段（gutter/2 + celebrate-lift）由 CSS 自己补，
   * 免得把 --win-card-height 这类常量再在 JS 里抄一份。
   *
   * 只在进关卡与改尺寸时量。对局中这两条边不动，结算那几帧上一次读取都没有。
   */
  const pageRef = useRef<HTMLDivElement>(null)
  const statusSlotRef = useRef<HTMLDivElement>(null)
  /*
   * 格边长对齐到整数物理像素后再写回 --cell-size，盘面才不会出现「有的行高一
   * 物理像素」以及填色块边沿与网格线错位（成因见 useSnappedCellSize）。
   */
  const cellProbeRef = useRef<HTMLDivElement>(null)
  const cellSize = useSnappedCellSize(cellProbeRef)
  const [unlockGaps, setUnlockGaps] = useState<{ title: number; board: number } | null>(null)
  const [winCardHeight, setWinCardHeight] = useState<number | null>(null)
  const [compactWin, setCompactWin] = useState<{ shift: number; scale: number; copyTop: number } | null>(null)
  useLayoutEffect(() => {
    if (game.status !== 'won' || winCardHeight === null) {
      setCompactWin(null)
      return
    }
    const fit = () => {
      const page = pageRef.current
      const board = page?.querySelector<HTMLElement>('[role="grid"]')
      const layout = board?.parentElement
      const heading = page?.querySelector('h1')
      const slot = statusSlotRef.current
      if (!page || !board || !layout || !heading || !slot || board.offsetHeight === 0) return
      const headingBottom = heading.getBoundingClientRect().bottom
      const top = headingBottom + 60
      const bottom = page.getBoundingClientRect().bottom - winCardHeight - 14
      const available = Math.max(1, bottom - top)
      if (available >= board.offsetHeight) {
        setCompactWin(null)
        return
      }
      // Scaling is about the artwork's center, so subtracting the current translation
      // recovers its resting center even during a transition or after rotating the screen.
      const matrix = new DOMMatrix(getComputedStyle(layout).transform)
      const rect = board.getBoundingClientRect()
      const restingCenter = (rect.top + rect.bottom) / 2 - matrix.m42
      const next = {
        shift: (top + bottom) / 2 - restingCenter,
        scale: available / board.offsetHeight,
        copyTop: headingBottom + 28 - slot.getBoundingClientRect().top,
      }
      setCompactWin(prev => prev && Math.abs(prev.shift - next.shift) < .1 && Math.abs(prev.scale - next.scale) < .001 && Math.abs(prev.copyTop - next.copyTop) < .1 ? prev : next)
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [game.status, winCardHeight, cellSize])
  const winCardHeightRef = useRef<number | null>(null)
  winCardHeightRef.current = winCardHeight
  // undefined = 起点尚未确定；确定后才允许挂 canvas，避免时间线被换掉重放
  const [revealOrigin, setRevealOrigin] = useState<CellPosition | null | undefined>(undefined)
  // 胜利那一刻扣下的「本局之前」的成绩，供结算卡判断首次通关 / 新纪录
  const [winStats, setWinStats] = useState<{ firstClear: boolean; bestSeconds?: number } | null>(
    null,
  )
  const completedRef = useRef(false)
  // 父组件落盘会立即重渲染；回调镜像到 ref，避免函数身份变化触发 effect 清理，
  // 进而取消结算定时器或在清理中再次落盘形成更新循环。
  const onPersistRef = useRef(onPersist)
  const onCompletedRef = useRef(onCompleted)
  onPersistRef.current = onPersist
  onCompletedRef.current = onCompleted

  // 揭晓从「填上最后一格」的位置荡开。记的是盘面上真正变成 filled 的那一格
  // （reducer 返回的 mutation，见 feedbackCell），而不是指针最后经过的格子——
  // 拖拽收尾时指针常停在已填格甚至标记格上，从那里起波就和玩家刚做的动作对不上了。
  const lastFilledRef = useRef<CellPosition | null>(null)
  /** 这一格确实改变了：记下揭晓起点，发声，发触感。指针与键盘两条路共用 */
  const feedbackCell = useCallback((mutation: CellMutation, firstChangedCell: boolean) => {
    if (mutation.kind === 'fill') lastFilledRef.current = { row: mutation.row, col: mutation.col }
    playCellSound(mutation)
    fireCellHaptic(mutation, firstChangedCell)
  }, [])
  /*
   * 拖动进行中在 .page 上挂 data-dragging，让格子与线索摘掉背景过渡
   * （规则在 Board.module.css 与 Clues.module.css，理由也写在那里）。
   *
   * 直接写 DOM 属性，不走 state：一次落笔只影响一条 CSS 规则，走 state 却要让
   * 225 个格子和 30 条线索各自跑一次协调——为了省重绘反而先付一次重渲染。
   */
  const setDragging = useCallback((on: boolean) => {
    const page = pageRef.current
    if (!page) return
    if (on) page.dataset.dragging = 'true'
    else delete page.dataset.dragging
  }, [])
  /*
   * 教学进行中，落笔前先问一句：这一格是这一步该涂的吗。
   *
   * 走 ref 而不是把 coach 直接传进来，是为了避开一个环——教练要用
   * usePointerInput 给出的 setInputMode，而这里又要用教练的判断。
   * 判断只在手指落下的那一刻读一次，ref 里永远是当前那一帧的教练。
   */
  const coachRef = useRef<Coach | null>(null)
  const allowCell = useCallback(
    (row: number, col: number, intent: CellIntent) =>
      coachRef.current?.allowCell(row, col, intent) ?? true,
    [],
  )
  // 拖动途中每一格都要再问一次教练，而 usePointerInput 只在落笔时告诉我们意图
  const inputModeRef = useRef<CellIntent>('fill')
  const strokeChangedRef = useRef(false)
  const { inputMode, setInputMode, boardHandlers } = usePointerInput({
    size: puzzle.size,
    onStrokeStart: (row, col, intent) => {
      if (!allowCell(row, col, intent)) return
      const expected = game.previewStroke(row, col, intent)
      if (!expected) return
      setDragging(true)
      strokeChangedRef.current = false
      const mutation = game.beginStroke(row, col, intent)
      if (!mutation) return
      feedbackCell(mutation, true)
      strokeChangedRef.current = true
    },
    onStrokeMove: (row, col) => {
      if (!allowCell(row, col, inputModeRef.current)) return
      const mutation = game.continueStroke(row, col)
      if (!mutation) return
      feedbackCell(mutation, !strokeChangedRef.current)
      strokeChangedRef.current = true
    },
    onStrokeEnd: () => {
      setDragging(false)
      strokeChangedRef.current = false
      game.endStroke()
    },
    onHoverChange: setHovered,
    onInteract: (row, col, intent) => {
      const expected = allowCell(row, col, intent) ? game.previewStroke(row, col, intent) : null
      if (expected) haptics.prepare(expected)
      // 音频正常已在进入关卡前建好，这里只负责恢复。
      sound.prepare()
    },
    disabled: game.status !== 'playing' || reading,
  })
  /*
   * 键盘走的是同一串笔画事件（见 useKeyboardInput 的头注释）：同一个 reducer、
   * 同一套教练判定、同一份触感。指针那一套一个字节都没动，两条路并存。
   */
  const { cursor, keyboardHandlers } = useKeyboardInput({
    size: puzzle.size,
    inputMode,
    setInputMode,
    onStrokeStart: (row, col, intent) => {
      if (!allowCell(row, col, intent)) return
      const expected = game.previewStroke(row, col, intent)
      if (!expected) return
      strokeChangedRef.current = false
      const mutation = game.beginStroke(row, col, intent)
      if (!mutation) return
      feedbackCell(mutation, true)
      strokeChangedRef.current = true
    },
    onStrokeMove: (row, col) => {
      if (!allowCell(row, col, inputModeRef.current)) return
      const mutation = game.continueStroke(row, col)
      if (!mutation) return
      feedbackCell(mutation, !strokeChangedRef.current)
      strokeChangedRef.current = true
    },
    onStrokeEnd: () => {
      strokeChangedRef.current = false
      game.endStroke()
    },
    onHoverChange: setHovered,
    onInteract: (row, col, intent) => {
      const expected = allowCell(row, col, intent) ? game.previewStroke(row, col, intent) : null
      if (expected) haptics.prepare(expected)
      sound.prepare()
    },
    onUndo: game.undo,
    disabled: game.status !== 'playing' || reading,
  })
  const tutorialSteps = puzzle.id === TUTORIAL2_LEVEL_ID ? COACH_STEPS_STAR : COACH_STEPS
  const coach = useTutorialCoach({
    active: showTutorial,
    board: game.board,
    status: game.status,
    inputMode,
    setInputMode,
    onFinish: closeTutorial,
    steps: tutorialSteps,
  })
  const learningTip = useLearningTip(puzzle, game.board,
    learningTools && game.status === 'playing' && !reading && !showSettings && !restartAsked &&
    (!coach.active || Boolean(coach.step?.independent)), game.canUndo, Boolean(hint))
  const learningNote = learningTip === 'undo' ? t('journey.undoTip')
    : learningTip === 'hint' ? t('journey.hintTip') : null
  coachRef.current = coach
  inputModeRef.current = inputMode

  /*
   * 讲解页（不用动手的那几页）暂停计时：那几秒玩家在读字，不在解题。
   * 轮到他涂格子时计时照常走——他确实在解这一局，成绩就该算数。
   */
  const { elapsed, reset: resetElapsed } = useTimer(
    game.status === 'playing' && !coach.reading && !reading,
    resume?.elapsedSeconds ?? 0,
  )

  // 依赖是整个 puzzle 而不是 puzzle.id：占位换成真关卡的那一刻场景才登记进表，
  // 只认 id 会把「查不到场景」记死在占位那一帧（见 Thumbnail 的长注释）
  const scene = useMemo(() => getSceneById(puzzle.id), [puzzle])
  const artColors = useMemo(
    () => artColorGrid(puzzle, resolveSubjectPalette(puzzle, scene)),
    [puzzle, scene],
  )
  const sceneColors = useMemo(() => sceneColorGrid(puzzle, scene), [puzzle, scene])
  const hasScene = sceneColors !== null
  /*
   * DOM 兜底配色：只在 canvas 没能把画画完时才挂上（见 Board.module.css 的 .domFallback）。
   *
   * 正常路径下不挂，是因为它会在落幕那一帧改写 size² 个格子的背景，而那些格子
   * 全被不透明的 canvas 盖着——重算与重绘纯属白做，却正好落在最挤的一帧上。
   *
   * 但「canvas 没画完」不止「拿不到 2d 上下文」一种：切后台、rAF 被节流、掉帧
   * 严重到时间线跑不完，都会让画停在半路。那种情况下 DOM 这套颜色是唯一能把
   * 完成图呈现出来的东西，缺了它画面会僵在对局态。所以下面的兜底定时器一旦
   * 真的开火（说明 canvas 没有自行完成），就把它挂上。
   */
  const [canvasUnavailable, setCanvasUnavailable] = useState(false)
  const revealedRef = useRef(false)
  const handleRevealComplete = useCallback(() => {
    revealedRef.current = true
    setRevealed(true)
  }, [])
  const handleCanvasUnavailable = useCallback(() => setCanvasUnavailable(true), [])
  /*
   * 网页试玩按视口的宽裕度把线索连续放大到桌面尺度（config/demo.ts 的 demoRoom）。
   * 正式版永远是 0——hook 照样调用，只是结果不参与。
   */
  const viewportRoom = useViewportRoom()
  const room = isDemoBuild ? viewportRoom : 0
  const clueScale = 1 + DEMO_CLUE_SCALE_SPAN * room
  const clueLayout = useMemo(
    () => getPuzzleClueLayout(puzzle.clues, puzzle.size, { scale: clueScale }),
    [puzzle.clues, puzzle.size, clueScale],
  )
  // 填充进度：目标数来自行线索总和（[0] 空行贡献 0），当前数为盘面 filled 计数
  const totalFillCount = useMemo(
    () => puzzle.clues.rows.flat().reduce((sum, n) => sum + n, 0),
    [puzzle.clues],
  )
  /*
   * 计数、行列满足与各段线索完成，统一走增量派生（见 utils/lineState）。
   *
   * 从前是五个各自遍历全盘的 useMemo，其中 getCompletedClueSegments 要枚举
   * 每条线的所有合法排布——15×15 上每落一子跑 30 次枚举，而拖动时每跨一格
   * 就是一次落子。现在只重算被这一步改到的那一行与那一列，通常是 2 条线。
   *
   * 缓存挂在 ref 上、在 memo 里更新：它只是上一次的输出，无论何时被丢弃重算，
   * 传进去的都是与所存盘面配套的一份，结果不受影响（已在 lineState.test 里
   * 用全量参照实现逐字段钉住）。
   */
  const lineStateCache = useRef<LineStateCache | null>(null)
  const lineState = useMemo(() => {
    const next = deriveLineState(game.board, puzzle.clues, lineStateCache.current)
    lineStateCache.current = { board: game.board, clues: puzzle.clues, state: next }
    return next
  }, [game.board, puzzle.clues])
  const {
    filledCount,
    satisfiedRows,
    satisfiedCols,
    completedRowSegments,
    completedColSegments,
  } = lineState

  /*
   * 线索的显示状态在胜利那一帧冻住。
   *
   * 赢的那一步会让所有还没满足的线索同时成立——最多 30 条 ClueLine 一起重渲染，
   * 每条还要跑 color / opacity 过渡。而它恰好落在全程最挤的一帧上：sound.win、
   * 结算背景挂载、揭晓 canvas 首帧都在这里。
   *
   * 这笔开销买不到任何东西：胜利即进入庆祝态，整个线索区本来就要淡出
   * （见 Game.module.css 的 data-celebrating）。玩家不会去看划线，他在看那幅画。
   *
   * 所以只在对局中更新这份快照，胜利后继续用最后一次对局态的值。重开一局
   * （restartGame）状态回到 playing，快照随之恢复跟随。
   */
  const clueViewRef = useRef({
    satisfiedRows,
    satisfiedCols,
    completedRowSegments,
    completedColSegments,
  })
  if (game.status === 'playing') {
    clueViewRef.current = {
      satisfiedRows,
      satisfiedCols,
      completedRowSegments,
      completedColSegments,
    }
  }
  const clueView = clueViewRef.current

  // 最新状态镜像到 ref，供防抖落盘 / 卸载 flush 读取
  const latestRef = useRef({ board: game.board, elapsed, status: game.status })
  latestRef.current = { board: game.board, elapsed, status: game.status }
  const bestTime = initialProgress?.bestTimeSeconds
  const everCompleted = initialProgress?.everCompleted ?? initialProgress?.completed ?? false
  // 这一关是什么时候解开的：本局一笔不改它，只是原样抄进每一次落盘（见 buildSnapshot）
  const completedAt = initialProgress?.completedAt
  const firstClearedAt = initialProgress?.firstClearedAt
  // initialProgress 是父组件的实时存档：onCompleted 一落盘，everCompleted / bestTime
  // 就会在结算卡渲染之前被本局成绩改写，「首次通关」和「新纪录」因而永远判不出来。
  // 所以在胜利那一刻先把上一局之前的成绩扣下来，结算卡只认这份快照。
  const preWinRef = useRef({ everCompleted, bestTime })
  preWinRef.current = { everCompleted, bestTime }

  /*
   * 对局中途的存档快照。重玩已通关的关卡时若棋盘仍为空（只进来看了一眼），
   * 恢复为已完成态，不把选关页卡片降级成进行中。
   *
   * completedAt / firstClearedAt 原样抄过来，一笔不改：本局还没打完，这一关
   * 「什么时候解开的」就还是上一次那个答案。从前这里不抄，重玩落第一笔盘就把
   * 两个时刻一起抹掉——首页收藏架按 completedAt 倒序取前四行，没有时间戳的一律
   * 算「更早」（见 utils/unlocked.ts），于是那幅画当场被挤到解锁库的最末，
   * 从架上凭空消失；藏品详情里那行「首次完成」也跟着一起没了。
   */
  const buildSnapshot = useCallback(
    (board: Board, elapsedSeconds: number): PuzzleProgress => {
      const encoded = encodeBoard(board)
      if (isPuzzleBoardPristine(puzzle, board)) {
        return {
          version: 1,
          board: '',
          elapsedSeconds: 0,
          completed: everCompleted,
          everCompleted,
          bestTimeSeconds: bestTime,
          completedAt,
          firstClearedAt,
        }
      }
      return {
        version: 1,
        board: encoded,
        elapsedSeconds,
        completed: false,
        everCompleted,
        bestTimeSeconds: bestTime,
        completedAt,
        firstClearedAt,
      }
    },
    [everCompleted, bestTime, completedAt, firstClearedAt, puzzle],
  )

  const restartGame = useCallback(() => {
    const board = createPuzzleBoard(puzzle)
    resetGameState()
    resetElapsed()
    setWinCardMounted(false)
    setRevealed(false)
    setHoldingLayers(false)
    setUnlockVisible(false)
    setUnlockCardHeight(null)
    setWinCardHeight(null)
    revealedRef.current = false
    setCanvasUnavailable(false)
    setRevealOrigin(undefined)
    setWinStats(null)
    setHint(null)
    lastFilledRef.current = null
    completedRef.current = false
    latestRef.current = { board, elapsed: 0, status: 'playing' }
    onPersistRef.current(puzzle.id, buildSnapshot(board, 0))
  }, [puzzle, resetGameState, resetElapsed, buildSnapshot])

  /*
   * 底部左手位那一下：只是**提出**重新开始，不当场执行。
   *
   * 它从前叫「清空」，一点就把盘面、计时和整条撤销栈一起抹掉，而且撤不回来——
   * 15×15 推了二十分钟，一次误触全没。同一个 App 里，收藏页重玩一幅已经解开的画
   * （零损失）反倒要二次确认：护栏配在了代价小的那一头。现在两处走同一张面板。
   *
   * 空盘不问：那时「重新开始」只是把计时归零，没有任何东西会失去，
   * 弹一张面板去确认一件不会发生的损失只是多一次点击。
   */
  const askRestart = useCallback(() => {
    if (game.isPristine) {
      restartGame()
      return
    }
    setRestartAsked('restart')
  }, [game.isPristine, restartGame])

  const confirmRestart = useCallback(() => {
    const reason = restartAsked
    setRestartAsked(null)
    // clear 那一记触感跟着真正的清空走，不跟着按钮走（见 PRODUCT_NOTES 第 1 节）
    haptics.clear()
    restartGame()
    if (reason === 'tutorial') setShowTutorial(true)
  }, [restartAsked, restartGame])

  const cancelRestart = useCallback(() => setRestartAsked(null), [])

  /* 面板的骨架、成绩行和默认落在取消上的焦点都一样，只有这三句话跟着入口换 */
  const restartTexts = RESTART_TEXTS[restartAsked ?? 'restart']

  /*
   * 顶栏「新手教学」：重看之前先把盘清空。
   *
   * 教学第一步就是「把第 2 行涂满」，盘上已经有东西时这句话是空的，
   * 后面几步「两头已经是叉」之类的推理也全都对不上——这套教学讲的是
   * 从空盘开始的那一条路径。
   *
   * 但清空就是清空：这条入口从前直接调 restartGame()，推了一半的盘、走了两分钟的
   * 计时和整条撤销栈当场没，一句话都不问。同一件事在底部「重新开始」那儿是要
   * 二次确认的——护栏不能只配在其中一个按钮上，那等于没配。空盘照旧不问：
   * 那时点开教学什么都不会失去。
   */
  const openTutorial = useCallback(() => {
    if (game.isPristine) {
      restartGame()
      setShowTutorial(true)
      return
    }
    setRestartAsked('tutorial')
  }, [game.isPristine, restartGame])

  // 从其他页面主动重看也走同一条保护路径，仅处理一次入场请求。
  const requestHandled = useRef(false)
  useEffect(() => {
    if (!tutorialRequested || requestHandled.current) return
    requestHandled.current = true
    openTutorial()
    onTutorialRequestHandled?.()
  }, [tutorialRequested, openTutorial, onTutorialRequestHandled])

  // 棋盘变更后防抖落盘
  useEffect(() => {
    if (game.status !== 'playing') return
    const timer = setTimeout(() => {
      onPersistRef.current(
        puzzle.id,
        buildSnapshot(latestRef.current.board, latestRef.current.elapsed),
      )
    }, SAVE_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [game.board, game.status, puzzle.id, buildSnapshot])

  /** 把 latestRef 里最新的那一份立刻写进去，不等防抖；胜利态已另行处理，这里不碰 */
  const persistNow = useCallback(() => {
    const { board, elapsed: seconds, status } = latestRef.current
    if (status !== 'playing') return
    onPersistRef.current(puzzle.id, buildSnapshot(board, seconds))
  }, [puzzle.id, buildSnapshot])

  // 离开关卡时立即落盘（胜利已单独处理）
  useEffect(() => persistNow, [persistNow])

  /*
   * 对局期间让音频输出通道保持转动（见 utils/sound 里 holdSoundOutput 的长注释）。
   * 读题停顿三四十秒之后再滑，落子声不该到拖动后半段才挤成一串出来。
   * 通关之后撤掉：揭晓那一串由 sound.win 一次排完，之后没有即时反馈要保。
   */
  useEffect(() => (game.status === 'playing' ? holdSoundOutput() : undefined), [game.status])

  /*
   * 页面被收走之前补一次落盘。
   *
   * 落子后要等 500ms 才写，而关标签页、切后台、系统回收进程都不保证 React
   * 跑得到组件的 cleanup——在那 500ms 里离开，最后一笔就没了；停手思考很久之后
   * 直接关掉，多出来的用时同样没写进去（防抖只由落子触发，不由时间流逝触发）。
   *
   * pagehide 与 visibilitychange 是移动浏览器上仅有的两个可靠信号（iOS Safari
   * 不保证发 beforeunload/unload），原生壳里另有 appStateChange。三处做的是同一件事，
   * 重复触发也无害：写的都是同一份快照。
   */
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === 'hidden') persistNow()
    }
    window.addEventListener('pagehide', persistNow)
    document.addEventListener('visibilitychange', onHidden)
    const subscription = CapApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) persistNow()
    })
    return () => {
      window.removeEventListener('pagehide', persistNow)
      document.removeEventListener('visibilitychange', onHidden)
      void subscription.then((listener) => listener.remove())
    }
  }, [persistNow])

  // 胜利：记录完成态（一次性）
  useEffect(() => {
    if (game.status === 'won' && !completedRef.current) {
      completedRef.current = true
      // 先扣下本局之前的成绩，再落盘——顺序反了就拿不到旧纪录了
      setWinStats({
        firstClear: !preWinRef.current.everCompleted,
        bestSeconds: preWinRef.current.bestTime,
      })
      onCompletedRef.current(puzzle.id, latestRef.current.elapsed)

      const origin = lastFilledRef.current
      setRevealOrigin(origin)
      /*
       * 结算卡需要尽早量出真实高度。若等到揭晓落幕后才挂载，棋盘会先按最小高度
       * 上移一次，随后被 iPhone 安全区下的实测高度再推一次，肉眼就是图片二次移动。
       * 卡片仍保持屏外且 inert，真正入场时刻由下面传入的完整 delay 保持不变。
       */
      setWinCardMounted(true)

      sound.win()

      // 降低动态效果：跳过整段揭晓，直接落终态
      if (prefersReducedMotion()) {
        // 整段揭晓被跳过，canvas 不会画任何东西，完成图只能由 DOM 呈现
        setCanvasUnavailable(true)
        revealedRef.current = true
        setRevealed(true)
        return
      }

      // 钉住图层：这一整段有动画在跑，期间不能让任何一层被降级重光栅。
      setHoldingLayers(true)

      const revealMs = getBoardRevealDurationMs(puzzle.solution, hasScene, origin)

      // 正常情况下 canvas 播完会自己回调 onRevealComplete；
      // 这个定时器兜底 rAF 不推进的情况（例如切到后台），保证一定会落终态。
      // 它真的开火就意味着 canvas 没画完，此时必须让 DOM 顶上完成图的配色。
      const settle = setTimeout(() => {
        if (revealedRef.current) return
        setCanvasUnavailable(true)
        setRevealed(true)
      }, revealMs + REVEAL_BUFFER_MS)
      return () => {
        clearTimeout(settle)
      }
    }
  }, [game.status, puzzle.id, puzzle.solution, hasScene])

  useEffect(() => {
    const measure = () => {
      // 只在对局中量。庆祝态里画正被 transform 抬着，此时量到的上沿已经含了
      // 那段抬升，再按下面的公式减一次就会重复扣掉。
      if (latestRef.current.status !== 'playing') return
      const slot = statusSlotRef.current
      const heading = pageRef.current?.querySelector('h1')
      const board = pageRef.current?.querySelector('[role="grid"]')
      if (!slot || !heading || !board) return
      const slotBox = slot.getBoundingClientRect()
      const slotCenter = (slotBox.top + slotBox.bottom) / 2
      // 都记成「相对槽中心」的偏移量，容器如何定位、有没有安全区都不影响结果
      setUnlockGaps({
        title: heading.getBoundingClientRect().bottom - slotCenter,
        board: board.getBoundingClientRect().top - slotCenter,
      })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [puzzle.id])

  // 「关卡解锁！」错开落幕那一帧再挂载（理由见 unlockVisible 的声明处）。
  // 降低动态效果时这一拍不成立——整段结算都被跳过了，字样立刻就位。
  useEffect(() => {
    if (!revealed || game.status !== 'won') return
    const showUnlock = () => {
      // 此刻的基准只取一次；之后 WinModal 的实测高度只应驱动棋盘让位，不能挪动字样。
      setUnlockCardHeight(
        winCardHeightRef.current === null
          ? 'var(--win-card-min-height)'
          : `${winCardHeightRef.current}px`,
      )
      setUnlockVisible(true)
    }
    if (prefersReducedMotion()) {
      showUnlock()
      return
    }
    const timer = setTimeout(showUnlock, UNLOCK_DELAY_MS)
    return () => clearTimeout(timer)
  }, [revealed, game.status])

  /*
   * 揭晓正式落幕时发一段渐强收束，与棋盘的 boardSettle 同时落地。推迟一帧避开
   * revealed 的 React 提交；三拍的排程在原生端，这里只过一次桥、只挂一个 rAF，
   * 因此整局至多触发一次。
   */
  useEffect(() => {
    if (!revealed || game.status !== 'won' || game.boardChangeSource !== 'stroke') return
    const frame = requestAnimationFrame(() => haptics.finale())
    return () => cancelAnimationFrame(frame)
  }, [revealed, game.status, game.boardChangeSource])

  /*
   * 一条提示落到界面上：点亮哪一条线索、棋盘上照亮哪一片、要不要放重叠法那段动画。
   *
   * level 1 只点一条线。level 2 才把另一条轴叠上来，交点那一格画个框——
   * 到这一步等于把「下一个能涂的地方」直接指出来了，所以它必须是玩家再问一次
   * 才给的东西，不是第一次点提示就送到手上的。
   */
  const hintView = useMemo<HintView | null>(() => {
    const current = hint?.hint
    // 纠错提示没有可推的格子（cells 为空），但同样要把那一行点出来
    if (!current) return null
    return buildHintView(current, { token: hint.token, crossed: hint.level === 2 })
  }, [hint])

  /*
   * 提示那句话。找不到可推的线时也要说点什么——按下去没反应的按钮会被当成坏了。
   * 这一句同时是个诚实的交代：单看一行一列确实推不动了。
   */
  /*
   * 棋盘上亮着的东西：教学进行中由教练给，其余时候是提示按钮给的。
   * 两者共用同一套画法（HintOverlay），所以这里只需要挑一个交出去。
   */
  const boardHint = coach.view ?? hintView

  /*
   * 顶栏那枚「新手教学」只挂在两关教材上：第一关（heart，涂色）与第四关
   * （star，叉子）。它写的是「新手教学」，按下去讲的也只有这两张盘的解法——
   * 摆在别的关卡上，玩家按下去看到的是另一关，那不是帮助，是把人送走。
   */
  const showHelp = puzzle.id === TUTORIAL_LEVEL_ID || puzzle.id === TUTORIAL2_LEVEL_ID

  const hintNote = !hintNoteVisible || !hint
    ? (!coach.active ? learningNote : null)
    : !hint.hint
      ? t('game.hintStuck')
      : hint.level === 2
        ? hintCrossMessage(hint.hint)
        : hint.hint.message

  return (
    <div
      ref={pageRef}
      className={styles.page}
      style={
        {
          '--size': puzzle.size,
          '--clue-gutter-row': `${clueLayout.rowGutterPx}px`,
          '--clue-gutter-col': `${clueLayout.colGutterPx}px`,
          // 试玩版：操作条、格子封顶、线索字号上限在 CSS 里按同一个宽裕度连续走
          ...(isDemoBuild && { '--demo-room': room, '--clue-scale': clueScale }),
          ...(winCardHeight !== null && { '--win-card-height': `${winCardHeight}px` }),
          ...(compactWin && {
            '--win-fit-shift': `${compactWin.shift}px`,
            '--win-fit-scale': compactWin.scale,
            '--win-fit-copy-top': `${compactWin.copyTop}px`,
          }),
          /*
           * 教学期间那条引导一直演下去（实战是走两趟就散）：它演的是
           * 「手指按住拖过去」，而玩家可能盯着卡片读完两行字才回到盘上。
           */
          ...(coach.active && { '--hint-ghost-repeat': 'infinite' }),
          ...(unlockGaps && {
            '--unlock-title-gap': `${unlockGaps.title}px`,
            '--unlock-board-gap': `${unlockGaps.board}px`,
          }),
          ...(unlockCardHeight && { '--unlock-card-height': unlockCardHeight }),
        } as CSSProperties
      }
    >
      {/*
        celebrating：胜利那一刻起线索/计数/模式条淡出，界面从「解题态」切到「欣赏态」。
        settled：揭晓落幕后棋盘上移居中，给底部升起的结算卡让出位置。
      */}
      <div
        className={styles.game}
        data-size={puzzle.size}
        data-celebrating={game.status === 'won'}
        data-settled={revealed}
        data-compact-win={compactWin !== null || undefined}
        data-holding-layers={holdingLayers}
        style={
          cellSize === null
            ? undefined
            : ({ '--cell-size': `${cellSize}px` } as CSSProperties)
        }
      >
        {/* 量 --cell-size-raw 的探针，理由见 useSnappedCellSize */}
        <div ref={cellProbeRef} className={styles.cellProbe} aria-hidden="true" />
        <Toolbar
          onExit={onExit}
          backLabel={exitLabel}
          /*
           * 顶栏居中标题的兜底：正式库关卡由 App 传入章名／册名，这里只接住漏网的。
           * 从前兜的是难度名（入门 / 进阶 / 挑战）——那是给库分档用的说法，摆在
           * 玩家眼前只会被读成「这局有多难」，而难不难要他自己推过才知道。
           * 现在兜的是这一局客观有多大。
           */
          title={titleOverride ?? `${puzzle.size}×${puzzle.size}`}
          onSettings={() => setShowSettings(true)}
          onHint={requestHint}
        />
        {/*
          顶栏与棋盘之间的槽位：对局中是填充计数，通关后计数淡出、
          「关卡解锁！」在原地浮现。等揭晓真正落幕（revealed）才出现，
          不与揭晓的高潮抢戏；逐字渐入的时序见 Game.module.css。

          教学那两关右端还多一枚「新手教学」：它从前并排在顶栏左端，可它写的是字，
          德语「Anleitung」、法语「Comment jouer」一长，居中的册名就与它叠在一起。
          挪到这一行的右端（齿轮正下方）之后，两者分居两行，谁也不挡谁。
        */}
        <div className={styles.statusSlot} ref={statusSlotRef} data-has-help={showHelp || undefined}>
          <div
            className={styles.progress}
            data-dimmed={hintNote ? 'true' : undefined}
            aria-label={t('game.filled', { done: filledCount, total: totalFillCount })}
          >
            <span className={styles.progressSwatch} aria-hidden="true" />
            <span aria-hidden="true">
              {filledCount}/{totalFillCount}
            </span>
          </div>
          {hintNote && (
            <p className={styles.hintNote} role="status">
              {hintNote}
            </p>
          )}
          {/*
            写「新手教学」四个字，不用问号：实测问号有两个毛病——不够醒目，
            第一次进游戏的人注意不到；问号谁都认得，但它在这里指什么全靠猜。
            造型是全站那套可按压的圆角矩形 + 下沿实色厚边。
          */}
          {showHelp && (
            <button
              className={styles.help}
              data-dimmed={hintNote ? 'true' : undefined}
              onClick={openTutorial}
            >
              {t('toolbar.tutorial')}
            </button>
          )}
          {game.status === 'won' && unlockVisible && (
            <p className={styles.unlock} role="status">
              {unlockChars(t('game.unlock')).map((char, i, all) => (
                <span
                  key={i}
                  className={styles.unlockChar}
                  style={
                    {
                      '--char-index': i,
                      '--char-count': all.length,
                    } as CSSProperties
                  }
                >
                  {char === ' ' ? '\u00a0' : char}
                </span>
              ))}
            </p>
          )}
        </div>
        <div className={styles.boardScroll}>
          <div className={styles.layout}>
            {/*
              结算背景。挂在 .layout 里而不是页面上，是为了跟着棋盘那道上移一起走——
              光晕的中心必须始终压在画的中心，否则棋盘升到位时光晕会留在原地，
              露馅成一块贴在背景上的色斑。

              'none' 时整个不渲染，而不是渲染一个没有背景的空 div：那个 div 有画的
              1.9 倍那么大，且基类上挂着 backdropIn 的 opacity 动画，等于每局白白
              制造一对合成层的升降级——看不见，但要付钱。
            */}
            {game.status === 'won' && settings.settleBackdrop !== 'none' && (
              <div
                className={styles.backdrop}
                data-backdrop={settings.settleBackdrop}
                aria-hidden="true"
              />
            )}
            <div />
            <div className={styles.colClues}>
              {puzzle.clues.cols.map((clue, c) => (
                <ClueLine
                  key={c}
                  clue={clue}
                  orientation="col"
                  availableAxisPx={clueLayout.colGutterPx}
                  satisfied={clueView.satisfiedCols[c]}
                  completedSegments={clueView.completedColSegments[c]}
                  highlighted={hovered?.col === c}
                  hinted={boardHint?.col === c || coach.cols.includes(c)}
                />
              ))}
            </div>
            <div className={styles.rowClues}>
              {puzzle.clues.rows.map((clue, r) => (
                <ClueLine
                  key={r}
                  clue={clue}
                  orientation="row"
                  availableAxisPx={clueLayout.rowGutterPx}
                  satisfied={clueView.satisfiedRows[r]}
                  completedSegments={clueView.completedRowSegments[r]}
                  highlighted={hovered?.row === r}
                  hinted={boardHint?.row === r}
                />
              ))}
            </div>
            <GameBoard
              board={game.board}
              hovered={hovered}
              won={game.status === 'won'}
              artColors={artColors}
              sceneColors={sceneColors}
              solution={puzzle.solution}
              revealed={revealed}
              finishRevealImmediately={prefersReducedMotion()}
              revealOrigin={revealOrigin ?? null}
              revealArmed={revealOrigin !== undefined}
              hint={boardHint}
              cellSize={cellSize}
              canvasUnavailable={canvasUnavailable}
              onCanvasUnavailable={handleCanvasUnavailable}
              onRevealComplete={handleRevealComplete}
              handlers={{ ...boardHandlers, ...keyboardHandlers }}
              cursor={cursor}
            />
          </div>
        </div>
        <ActionBar
          mode={inputMode}
          onChange={setInputMode}
          onUndo={game.undo}
          canUndo={game.canUndo}
          onRestart={askRestart}
          hidden={game.status === 'won'}
        />
      </div>
      {/*
        新手教学的教练层：压暗这一步用不上的地方，剩下的交给玩家自己涂。
        它挂在页面这一级、通关那一刻整个撤下（见 useTutorialCoach），
        揭晓与结算因此还是实战那一段，不受任何影响。
      */}
      {coach.active && <TutorialCoach coach={coach} rootRef={pageRef} learningNote={learningNote} />}
      {/*
        第一次见到 10×10 / 15×15：走教学同一套压暗，把这张盘亮出来，话摆在上面。
        从前是一张居中的对话框，玩家读完「格子更多了」，眼前仍然只有那张对话框。
      */}
      {showSizeIntro && (
        <SizeIntro size={puzzle.size} rootRef={pageRef} onStart={closeSizeIntro} />
      )}
      {/*
        第二关开局先认提示：前五秒关着门只能读，之后点哪儿都是继续。
        它只出现这一次，往后不留入口——读过的人已经知道提示在哪儿、是干什么的。
      */}
      {showHintIntro && <HintIntro rootRef={pageRef} onDone={closeHintIntro} />}
      {restartAsked && (
        <ConfirmSheet
          label={t(restartTexts.title)}
          description={t(restartTexts.description)}
          confirmLabel={t(restartTexts.confirm)}
          onConfirm={confirmRestart}
          cancelLabel={t('game.restartCancel')}
          onCancel={cancelRestart}
        >
          <h2 className={styles.restartTitle}>{t(restartTexts.title)}</h2>
          {/* 写清此刻要放弃的是多少东西：确认面板不该只是一道速度障碍 */}
          <p className={styles.restartMeta}>
            {t('game.restartMeta', { cells: filledCount, time: formatSeconds(elapsed) })}
          </p>
        </ConfirmSheet>
      )}
      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} devWinNow={game.solve} />
      )}
      {game.status === 'won' && winCardMounted && (
        <WinModal
          puzzle={puzzle}
          elapsedSeconds={elapsed}
          bestSeconds={winStats?.bestSeconds}
          firstClear={winStats?.firstClear}
          onNext={onNext}
          nextLabel={nextLabel}
          nextDescription={nextDescription}
          completedAlbum={winStats?.firstClear ? completedAlbumRef.current : undefined}
          onChooseAlbum={onChooseAlbum}
          onExit={onExit}
          completedChapter={
            winStats?.firstClear && completesChapterRef.current ? chapter : undefined
          }
          /* 章内关卡尺寸一致，这一关的尺寸就是这一章的尺寸（5×5 是上手章，见 storeReview） */
          onChapterCompleteShown={() => requestReviewAfterChapter({ size: puzzle.size })}
          /*
           * 卡片已经在胜利时挂载以测量高度；这里把完整延迟交给它，维持原先
           * 「揭晓 → 欣赏窗口 → 结算卡升起」的视觉节奏，同时让棋盘只移动一次。
           */
          enterDelayMs={
            prefersReducedMotion()
              ? 0
              : getWinModalDelayMs(puzzle.solution, hasScene, revealOrigin ?? null)
          }
          onHeightChange={setWinCardHeight}
        />
      )}
    </div>
  )
}
