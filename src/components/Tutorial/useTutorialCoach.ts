import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Board, GameStatus } from '../../types'
import type { CellIntent } from '../../hooks/useGameState'
import type { InputMode } from '../../hooks/usePointerInput'
import type { HintView } from '../Board/hintView'
import { haptics } from '../../utils/haptics'
import { isHandsOn, isStepDone, stepAllows, stepRemaining, stepView } from './coachScript'
import type { CoachSpot, CoachStep } from './coachScript'

/**
 * 一步涂完之后停这么久再翻页。
 *
 * 这段停顿不是留白：自动补的叉正好在这里冒出来，翻得太快玩家就会错过
 * 「我涂完这一行，那六个叉是自己出现的」——而下一页讲的就是这件事。
 */
const ADVANCE_MS = 640

export interface Coach {
  active: boolean
  index: number
  total: number
  step: CoachStep | null
  /** 这一轮的整套步骤。教学层拿它把卡片留白按最高的那一页定死（见 Spotlight） */
  steps: CoachStep[]
  /** 压暗四周、只留这一块；null 表示这一步不压暗，界面照常 */
  dim: CoachSpot | null
  /** 棋盘高亮，直接走实战提示那套画法 */
  view: HintView | null
  /** 额外点亮的列数字（「这两列已经够了」那一步） */
  cols: number[]
  /** 这一步还差几格 */
  remaining: number
  /** 只讲不做的页：这几秒玩家在读字，不在解题，计时该停 */
  reading: boolean
  /** 这一笔现在落不落得下；教学没在进行时一律放行 */
  allowCell: (row: number, col: number, intent: CellIntent) => boolean
  next: () => void
  skip: () => void
}

interface Options {
  active: boolean
  board: Board
  status: GameStatus
  /** 滑块现在停在哪一档。只用来判断教学这一次到底动没动它 */
  inputMode: InputMode
  setInputMode: (mode: InputMode) => void
  /** 教学结束（走完、跳过、通关）时收尾：记下看过，并撤掉教学层 */
  onFinish: () => void
  /** 这套教学用哪组步骤 */
  steps: CoachStep[]
}

const NO_COLS: number[] = []

/**
 * 新手教学的进度中枢。
 *
 * 它不接管对局，只在旁边看着：玩家把这一步该涂的格子涂上了，就翻页；
 * 只讲不做的页要他点一下屏幕才走。棋盘、撤销、清空、自动补叉、通关判定
 * 全部还是实战那一套，教学层随时撤掉都不会留下痕迹——这也是通关那一刻
 * 能干净退场的原因。
 *
 * 进度不是一个只会往前走的计数器：玩家撤销或清空之后，前面某一步的格子
 * 会重新变空，那时教学**自己退回那一步**（见下面那条 effect）。少了这一手，
 * 他清一次盘就会拿着一份对不上盘面的说明书往下走，最后怎么也通不了关。
 */
export function useTutorialCoach({
  active,
  board,
  status,
  inputMode,
  setInputMode,
  onFinish,
  steps,
}: Options): Coach {
  const [index, setIndex] = useState(0)
  const step = active ? (steps[index] ?? null) : null

  // 重新打开教学要从头讲起（顶栏那个按钮会把盘面一并清空，见 Game）
  useEffect(() => {
    if (active) setIndex(0)
  }, [active])

  /*
   * 轮到动手的步骤设置对应的输入模式。
   *
   * 涂色步骤切到涂色，打叉步骤切到叉子。
   * 滑块停在错误的模式时，玩家照着做只会画出错误的东西，
   * 而这一步永远不算完成——教程不能把第一次玩的人放进这种死角。
   *
   * 真拨动了就跟一记 selection——与玩家自己拨那个滑块是同一记（见 ActionBar）。
   * 手上的工具被别人换掉而手上没有任何感觉，是这一层唯一会让人措手不及的地方：
   * 下一笔画出来的东西和上一笔不是一回事，而他并不知道中间发生过一次切换。
   *
   * 只在**真的换档**时响：读的是滑块此刻的位置（ref，不进依赖），
   * 所以已经停在对的一档时安静，玩家自己中途拨回去也不会被这条 effect 拨回来。
   */
  const inputModeRef = useRef(inputMode)
  inputModeRef.current = inputMode
  useEffect(() => {
    if (!step) return
    const want: InputMode | null =
      step.fill.length > 0 ? 'fill' : step.mark && step.mark.length > 0 ? 'mark' : null
    if (want === null || want === inputModeRef.current) return
    haptics.selection()
    setInputMode(want)
  }, [step, setInputMode])

  // 涂完这一步就翻页（最后一步的「翻页」是通关，交给下面那条）
  const done = step !== null && isStepDone(step, board)
  const isLast = index === steps.length - 1
  useEffect(() => {
    if (!done || isLast) return
    const timer = setTimeout(
      () => setIndex((i) => Math.min(i + 1, steps.length - 1)),
      ADVANCE_MS,
    )
    return () => clearTimeout(timer)
  }, [done, isLast, steps.length])

  // 前面某一步的格子又空了（撤销 / 清空），退回那一步重讲
  useEffect(() => {
    if (!active) return
    const undone = steps.findIndex(
      (s, i) => i < index && isHandsOn(s) && !isStepDone(s, board),
    )
    if (undone >= 0) setIndex(undone)
  }, [active, board, index, steps])

  /*
   * 通关即收摊。最后一格落下的那一刻起，屏幕上只该剩下那幅画：教学层必须在
   * 揭晓开始之前整个消失，不留淡出——那一帧是全程最挤的一帧（canvas 首帧、
   * 结算背景挂载、音效触感一起发生），此时再叠一层过渡就是从前那个抽搐。
   */
  const finishRef = useRef(onFinish)
  finishRef.current = onFinish
  useEffect(() => {
    if (active && status !== 'playing') finishRef.current()
  }, [active, status])

  const view = useMemo(() => (step ? stepView(step, index) : null), [step, index])
  const allowCell = useCallback(
    (row: number, col: number, intent: CellIntent) =>
      step === null || stepAllows(step, row, col, intent),
    [step],
  )
  /** 点屏幕继续。带一记轻拍：翻页在手上也该成立，不然像点了个空 */
  const next = useCallback(() => {
    haptics.step()
    if (isLast) {
      finishRef.current()
    } else {
      setIndex((i) => (i + 1 < steps.length ? i + 1 : i))
    }
  }, [isLast, steps.length])
  const skip = useCallback(() => finishRef.current(), [])

  return {
    active: step !== null,
    index,
    total: steps.length,
    step,
    steps,
    dim: step?.dim ?? null,
    view,
    cols: step?.cols ?? NO_COLS,
    remaining: step ? stepRemaining(step, board) : 0,
    reading: step !== null && !isHandsOn(step),
    allowCell,
    next,
    skip,
  }
}
