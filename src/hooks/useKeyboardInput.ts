import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { INPUT_MODALITY_CHANGE, isPointerInput } from '../utils/inputModality'
import type { CellIntent } from './useGameState'
import type { CellPosition, InputMode, StrokeAxis } from './usePointerInput'

/**
 * 棋盘的键盘操作。
 *
 * 工具栏那几枚按钮本来就是 button，键盘一直够得着；够不着的恰恰是棋盘本身——
 * 格子是 role="gridcell" 的 div，既没有 tabIndex，也没有落笔的键盘路径，于是
 * 「只用键盘打完一局」是做不到的。
 *
 * ## 不新起一套输入架构
 *
 * 落笔的语义早就定好了，是一串笔画事件：起笔、跨格、收笔（见 usePointerInput
 * 与 useGameState）。指针那一路把手指的位移翻译成这三样，这里把按键翻译成
 * 同样的三样，交给同一个 reducer。于是自动补叉、以一笔为单位的撤销、教练的
 * 逐格判定、触感与音效——全部原样适用，一行都不用为键盘再写一遍。
 *
 * ## 整块棋盘是**一个**焦点
 *
 * 不给 225 个格子各发一个 tabIndex：那样一次 Tab 要按两百多下才能走出棋盘。
 * 焦点落在棋盘容器上，容器内部由方向键移动一个光标（ARIA 的 grid 就是这么用的），
 * 当前落在哪一格靠 aria-activedescendant 交给读屏——格子上本来就有完整的
 * 「第几行第几列，什么状态」标签，一个字都不用新写。
 *
 * ## 键位
 *
 * - 方向键：移动光标（到边即止，不绕回）
 * - Home / End：跳到本行首 / 末；配 Ctrl（macOS 上 Cmd）跳到整盘首 / 末格
 * - 空格 / 回车：按当前模式落笔（与点一下等价，再按一次擦掉）
 * - F：填充一格；X：标叉一格。**不看当前模式**，省掉切换那一步
 * - M：在填充与标记之间切换（与工具栏那两枚按钮同一个状态）
 * - Shift + 方向键：连着涂一条线。整条算一笔，撤销一次全收回——与拖动同义
 * - Z / Backspace / Delete（含 Ctrl/Cmd+Z）：撤销一笔
 *
 * 除 Ctrl/Cmd+Z 外，带修饰键的组合一律不接：那些是浏览器和读屏自己的快捷键。
 */

const ARROWS: Record<string, readonly [number, number]> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
}

interface Options {
  /** 棋盘边长（格数） */
  size: number
  inputMode: InputMode
  setInputMode: (mode: InputMode) => void
  onStrokeStart: (row: number, col: number, intent: CellIntent) => void
  onStrokeMove: (row: number, col: number) => void
  onStrokeEnd: () => void
  /** 光标即十字高亮的落点，与鼠标悬停共用一份：行列线索因此照常亮起来 */
  onHoverChange: (cell: CellPosition | null) => void
  onInteract?: (row: number, col: number, intent: CellIntent) => void
  onUndo: () => void
  disabled: boolean
}

export interface KeyboardInput {
  /** 当前落在哪一格；棋盘没有焦点时为 null（焦点框跟着它出现和消失） */
  cursor: CellPosition | null
  /** 直接并进棋盘容器的 props，与指针那一套并存、互不干扰 */
  keyboardHandlers: {
    tabIndex: number
    onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void
    onKeyUp: (event: ReactKeyboardEvent<HTMLElement>) => void
    onFocus: () => void
    onBlur: () => void
  }
}

function clamp(value: number, max: number): number {
  return Math.min(Math.max(value, 0), max)
}

export function useKeyboardInput({
  size,
  inputMode,
  setInputMode,
  onStrokeStart,
  onStrokeMove,
  onStrokeEnd,
  onHoverChange,
  onInteract,
  onUndo,
  disabled,
}: Options): KeyboardInput {
  const [cursor, setCursor] = useState<CellPosition | null>(null)
  /**
   * 光标此刻真正在哪一格。
   *
   * 走位一律读它，不读上面那个 state：按住方向键连发时，同一拍里的几下按键读到的
   * 是同一份还没重渲染的 state，于是第二下、第三下都从第一下的起点重新算——按三下
   * 只走一格。ref 在 moveTo 里当场就改，连发因此一格不落。state 只管画那一圈框。
   *
   * 它同时也是「上一次停在哪儿」的记忆：焦点离开再回来从这儿接着走，不弹回左上角。
   */
  const lastCursor = useRef<CellPosition>({ row: 0, col: 0 })
  /** Shift 连涂进行中的那一笔；null＝此刻没有笔画挂着。 */
  const strokeAxis = useRef<StrokeAxis | null>(null)
  const strokingRef = useRef(false)

  const endStroke = useCallback(() => {
    if (!strokingRef.current) return
    strokingRef.current = false
    strokeAxis.current = null
    onStrokeEnd()
  }, [onStrokeEnd])

  const moveTo = useCallback(
    (cell: CellPosition) => {
      lastCursor.current = cell
      setCursor(cell)
      onHoverChange(cell)
    },
    [onHoverChange],
  )

  /** 一格一笔：起笔即收笔。空格、F、X 都走这条，与点一下完全同义。 */
  const tapCell = useCallback(
    (cell: CellPosition, intent: CellIntent) => {
      endStroke()
      onInteract?.(cell.row, cell.col, intent)
      onStrokeStart(cell.row, cell.col, intent)
      onStrokeEnd()
    },
    [endStroke, onInteract, onStrokeEnd, onStrokeStart],
  )

  const onFocus = useCallback(() => {
    if (disabled || isPointerInput()) return
    moveTo(lastCursor.current)
  }, [disabled, moveTo])

  // Pointer input can retain DOM focus, so blur alone cannot retire the cursor.
  useEffect(() => {
    const update = () => {
      if (!isPointerInput()) return
      endStroke()
      setCursor(null)
    }
    document.addEventListener(INPUT_MODALITY_CHANGE, update)
    return () => document.removeEventListener(INPUT_MODALITY_CHANGE, update)
  }, [endStroke])

  const onBlur = useCallback(() => {
    endStroke()
    setCursor(null)
    onHoverChange(null)
  }, [endStroke, onHoverChange])

  const onKeyUp = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      // 松开 Shift 就是收笔：这一条线到此为止，撤销时整条一起收回
      if (event.key === 'Shift') endStroke()
    },
    [endStroke],
  )

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (disabled) return
      const key = event.key
      const accel = event.ctrlKey || event.metaKey
      // A retained pointer focus gets no new focus event when keyboard use resumes.
      if (!event.altKey && !accel &&
          (ARROWS[key] || ['Home', 'End', ' ', 'Enter', 'f', 'F', 'x', 'X', 'm', 'M'].includes(key))) {
        moveTo(lastCursor.current)
      }

      // 撤销。裸 Z 与系统习惯的 Ctrl/Cmd+Z 都收，退格与删除同义
      if ((accel && (key === 'z' || key === 'Z')) || (!accel && (key === 'z' || key === 'Z' || key === 'Backspace' || key === 'Delete'))) {
        event.preventDefault()
        endStroke()
        onUndo()
        return
      }
      // Alt 组合是读屏和系统菜单的，一律不接
      if (event.altKey) return

      const current = lastCursor.current
      const max = size - 1

      const delta = ARROWS[key]
      if (delta) {
        /*
         * Cmd/Ctrl + 方向键是浏览器自己的（macOS 上就是前进/后退），不能抢。
         * 这也是这套键位唯一一处「明明是方向键却不动」的地方。
         */
        if (accel) return
        event.preventDefault()
        const next = {
          row: clamp(current.row + delta[0], max),
          col: clamp(current.col + delta[1], max),
        }
        if (next.row === current.row && next.col === current.col) return
        if (!event.shiftKey) {
          endStroke()
          moveTo(next)
          return
        }
        /*
         * Shift 连涂。起笔落在**出发的那一格**上，方向键先把它涂上，再一路
         * 跟着走——与手指按下去再滑出去是同一件事，reducer 也就按同一条
         * 「一笔」的规矩收进撤销栈。
         */
        const axis: StrokeAxis = delta[0] === 0 ? 'row' : 'col'
        if (strokingRef.current && strokeAxis.current !== axis) {
          // 半路拐弯：上一条到此为止，从新方向重新起一笔
          endStroke()
        }
        if (!strokingRef.current) {
          strokingRef.current = true
          strokeAxis.current = axis
          onInteract?.(current.row, current.col, inputMode)
          onStrokeStart(current.row, current.col, inputMode)
        }
        moveTo(next)
        onStrokeMove(next.row, next.col)
        return
      }

      if (key === 'Home' || key === 'End') {
        event.preventDefault()
        endStroke()
        const col = key === 'Home' ? 0 : max
        moveTo({ row: accel ? (key === 'Home' ? 0 : max) : current.row, col })
        return
      }

      if (accel) return

      if (key === ' ' || key === 'Enter') {
        event.preventDefault()
        tapCell(current, inputMode)
        return
      }
      if (key === 'f' || key === 'F') {
        event.preventDefault()
        tapCell(current, 'fill')
        return
      }
      if (key === 'x' || key === 'X') {
        event.preventDefault()
        tapCell(current, 'mark')
        return
      }
      if (key === 'm' || key === 'M') {
        event.preventDefault()
        endStroke()
        setInputMode(inputMode === 'fill' ? 'mark' : 'fill')
      }
    },
    [
      disabled,
      endStroke,
      inputMode,
      moveTo,
      onInteract,
      onStrokeMove,
      onStrokeStart,
      onUndo,
      setInputMode,
      size,
      tapCell,
    ],
  )

  return {
    cursor: disabled ? null : cursor,
    keyboardHandlers: {
      // 整块棋盘一个 Tab 停靠点；不能落笔时（揭晓中、讲解页）连停靠点也撤掉
      tabIndex: disabled ? -1 : 0,
      onKeyDown,
      onKeyUp,
      onFocus,
      onBlur,
    },
  }
}
