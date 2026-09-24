import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from 'react'
import type { CellIntent } from './useGameState'

export type InputMode = 'fill' | 'mark'

export interface CellPosition {
  row: number
  col: number
}

export type StrokeAxis = 'row' | 'col'

/** 首次跨格确定横/纵方向；后续坐标始终投影回起点所在轴。 */
export function resolveLockedCell(
  start: CellPosition,
  current: CellPosition,
  axis: StrokeAxis | null,
): { cell: CellPosition; axis: StrokeAxis | null } {
  let resolvedAxis = axis
  if (!resolvedAxis && (start.row !== current.row || start.col !== current.col)) {
    const rowDistance = Math.abs(current.row - start.row)
    const colDistance = Math.abs(current.col - start.col)
    resolvedAxis = colDistance >= rowDistance ? 'row' : 'col'
  }
  if (resolvedAxis === 'row') {
    return { cell: { row: start.row, col: current.col }, axis: resolvedAxis }
  }
  if (resolvedAxis === 'col') {
    return { cell: { row: current.row, col: start.col }, axis: resolvedAxis }
  }
  return { cell: current, axis: null }
}

/** 补齐低频 pointermove 跳过的中间格；不包含起点，包含终点。 */
export function cellsAlongAxis(
  from: CellPosition,
  to: CellPosition,
  axis: StrokeAxis | null,
): CellPosition[] {
  if (!axis) return from.row === to.row && from.col === to.col ? [] : [to]
  const fromValue = axis === 'row' ? from.col : from.row
  const toValue = axis === 'row' ? to.col : to.row
  if (fromValue === toValue) return []
  const step = toValue > fromValue ? 1 : -1
  const cells: CellPosition[] = []
  for (let value = fromValue + step; value !== toValue + step; value += step) {
    cells.push(axis === 'row' ? { row: from.row, col: value } : { row: value, col: from.col })
  }
  return cells
}

interface Options {
  /** 棋盘边长（格数），用于把坐标换算成行列 */
  size: number
  onStrokeStart: (row: number, col: number, intent: CellIntent) => void
  onStrokeMove: (row: number, col: number) => void
  onStrokeEnd: () => void
  onHoverChange: (cell: CellPosition | null) => void
  onInteract?: (row: number, col: number, intent: CellIntent) => void
  disabled: boolean
}

/** 从事件目标向上找带 data-row/data-col 的格子元素 */
function cellFromElement(element: Element | null): CellPosition | null {
  const cellEl = element?.closest<HTMLElement>('[data-row]')
  if (!cellEl) return null
  return { row: Number(cellEl.dataset.row), col: Number(cellEl.dataset.col) }
}

/** 夹回棋盘时向内缩进的像素，越过 2px 外框落到最边上那一格 */
const BOARD_EDGE_INSET_PX = 3

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** 把界外坐标夹到棋盘矩形内（含缩进），界内坐标原样返回。 */
export function clampPointToBoard(
  rect: { left: number; right: number; top: number; bottom: number },
  x: number,
  y: number,
): { x: number; y: number } {
  const inset = BOARD_EDGE_INSET_PX
  return {
    x: clamp(x, rect.left + inset, rect.right - inset),
    y: clamp(y, rect.top + inset, rect.bottom - inset),
  }
}

/** 一次笔画开始时量下来的棋盘几何，笔画期间不再碰 DOM */
export interface BoardGeometry {
  left: number
  top: number
  right: number
  bottom: number
  cellSize: number
  size: number
}

/**
 * 量一次棋盘几何。用 clientLeft/clientWidth 而不是硬编码外框宽度：
 * 胜利态会把 border 撤成 0，写死就会整体偏 2px。
 */
export function measureBoard(board: HTMLElement, size: number): BoardGeometry | null {
  if (size <= 0) return null
  const rect = board.getBoundingClientRect()
  const inner = board.clientWidth
  if (inner <= 0 || rect.width <= 0) return null
  // getBoundingClientRect 含变换后的缩放，clientWidth 不含；按比例还原到屏幕坐标
  const scale = rect.width / board.offsetWidth
  const borderX = board.clientLeft * scale
  const borderY = board.clientTop * scale
  return {
    left: rect.left + borderX,
    top: rect.top + borderY,
    right: rect.left + borderX + inner * scale,
    bottom: rect.top + borderY + board.clientHeight * scale,
    cellSize: (inner * scale) / size,
    size,
  }
}

/**
 * 由坐标算出格子，不查 DOM。界外返回 null。
 *
 * 从前每个 pointermove 都调 document.elementFromPoint（越界时还追加一次
 * getBoundingClientRect），两者都强制样式与布局刷新——在高频指针事件里
 * 就是典型的 layout thrashing，拖动越快掉帧越明显。
 * 格子是等宽等高的规则网格，位置本来就是算得出来的。
 */
export function cellFromGeometry(
  geometry: BoardGeometry,
  clientX: number,
  clientY: number,
): CellPosition | null {
  if (
    clientX < geometry.left ||
    clientX >= geometry.right ||
    clientY < geometry.top ||
    clientY >= geometry.bottom
  ) {
    return null
  }
  const col = Math.floor((clientX - geometry.left) / geometry.cellSize)
  const row = Math.floor((clientY - geometry.top) / geometry.cellSize)
  return {
    row: clamp(row, 0, geometry.size - 1),
    col: clamp(col, 0, geometry.size - 1),
  }
}

/**
 * 拖动中手指滑出棋盘时，把落点夹回棋盘内最近的格子。
 * 锁轴之后垂直于笔画方向的偏移本就会被 resolveLockedCell 丢弃，
 * 不该成为中断笔画的理由——沿最后一行横划时手指自然下压，越界只需半格。
 */
export function draggedCellFromGeometry(
  geometry: BoardGeometry,
  clientX: number,
  clientY: number,
): CellPosition | null {
  const direct = cellFromGeometry(geometry, clientX, clientY)
  if (direct) return direct
  const { x, y } = clampPointToBoard(geometry, clientX, clientY)
  return cellFromGeometry(geometry, x, y)
}

/**
 * 统一鼠标/触摸输入为语义化笔画事件。
 * 以当前 inputMode 为准（填充 ⭘ / 标记 ×）；鼠标右键始终是标记快捷键。
 * 拖动经 pointer capture + 按下时量好的棋盘几何追踪，跨格去重。
 */
export function usePointerInput({
  size,
  onStrokeStart,
  onStrokeMove,
  onStrokeEnd,
  onHoverChange,
  onInteract,
  disabled,
}: Options) {
  const [inputMode, setInputMode] = useState<InputMode>('fill')
  const draggingRef = useRef(false)
  const lastCellRef = useRef<string | null>(null)
  const lastPositionRef = useRef<CellPosition | null>(null)
  const startCellRef = useRef<CellPosition | null>(null)
  const axisRef = useRef<StrokeAxis | null>(null)
  // 棋盘几何在按下时量一次，笔画期间只做算术，不再每次移动都查 DOM
  const geometryRef = useRef<BoardGeometry | null>(null)
  // iOS 16 的 WKWebView 不能只靠 pointerdown 的 preventDefault 阻止滚动竞争：
  // 快速拖动时它仍可能由原生 scroll view 接走后续手势并产生橡皮筋位移。
  // 落笔期间在棋盘容器上挂一条非被动 touchmove，持续认领这一笔；收笔/卸载立刻撤掉，
  // 其它页面与棋盘外的滚动不受影响。
  const touchScrollTargetRef = useRef<HTMLElement | null>(null)
  const preventTouchScroll = useCallback((event: TouchEvent) => event.preventDefault(), [])
  const releaseTouchScrollLock = useCallback(() => {
    const target = touchScrollTargetRef.current
    if (!target) return
    target.removeEventListener('touchmove', preventTouchScroll)
    touchScrollTargetRef.current = null
  }, [preventTouchScroll])

  useEffect(() => releaseTouchScrollLock, [releaseTouchScrollLock])

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (disabled) return
      const cell = cellFromElement(event.target as Element)
      if (!cell) return
      // 只响应左键 / 右键 / 触摸主触点
      if (event.pointerType === 'mouse' && event.button !== 0 && event.button !== 2) return
      event.preventDefault()
      const intent: CellIntent =
        event.pointerType === 'mouse' && event.button === 2 ? 'mark' : inputMode
      // 必须留在原始用户手势内，Android WebView 才允许解锁音频和触觉反馈。
      onInteract?.(cell.row, cell.col, intent)
      draggingRef.current = true
      geometryRef.current = measureBoard(event.currentTarget, size)
      startCellRef.current = cell
      axisRef.current = null
      lastCellRef.current = `${cell.row},${cell.col}`
      lastPositionRef.current = cell
      if (event.pointerType !== 'mouse') {
        // 多指/系统重新分发事件时先撤掉旧目标，避免遗留一条 touchmove 锁。
        releaseTouchScrollLock()
        const board = event.currentTarget
        touchScrollTargetRef.current = board
        board.addEventListener('touchmove', preventTouchScroll, { passive: false })
      }
      // jsdom 等环境无 setPointerCapture
      event.currentTarget.setPointerCapture?.(event.pointerId)
      onStrokeStart(cell.row, cell.col, intent)
    },
    [disabled, inputMode, onInteract, onStrokeStart, preventTouchScroll, releaseTouchScrollLock, size],
  )

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      // pointer capture 后 event.target 固定，需按坐标反查格子
      const dragging = draggingRef.current && !disabled && startCellRef.current !== null
      if (dragging && event.pointerType !== 'mouse') event.preventDefault()
      // 非拖动的悬停只发生在桌面端，此时没有按下过、几何还没量，就地量一次
      const geometry =
        geometryRef.current ?? (dragging ? null : measureBoard(event.currentTarget, size))
      if (!geometry) {
        if (!dragging) onHoverChange(null)
        return
      }
      const rawCell = dragging
        ? draggedCellFromGeometry(geometry, event.clientX, event.clientY)
        : cellFromGeometry(geometry, event.clientX, event.clientY)
      if (!dragging || !rawCell || !startCellRef.current) {
        onHoverChange(rawCell)
        return
      }
      const locked = resolveLockedCell(startCellRef.current, rawCell, axisRef.current)
      axisRef.current = locked.axis
      onHoverChange(locked.cell)
      const key = `${locked.cell.row},${locked.cell.col}`
      if (key === lastCellRef.current) return
      lastCellRef.current = key
      const cells = cellsAlongAxis(lastPositionRef.current ?? startCellRef.current, locked.cell, locked.axis)
      lastPositionRef.current = locked.cell
      cells.forEach((cell) => onStrokeMove(cell.row, cell.col))
    },
    [disabled, onHoverChange, onStrokeMove, size],
  )

  const endDrag = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.pointerType !== 'mouse') onHoverChange(null)
      if (!draggingRef.current) return
      draggingRef.current = false
      releaseTouchScrollLock()
      geometryRef.current = null
      lastCellRef.current = null
      lastPositionRef.current = null
      startCellRef.current = null
      axisRef.current = null
      onStrokeEnd()
    },
    [onHoverChange, onStrokeEnd, releaseTouchScrollLock],
  )

  const onPointerLeave = useCallback(() => {
    onHoverChange(null)
  }, [onHoverChange])

  const onContextMenu = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    event.preventDefault()
  }, [])

  return {
    inputMode,
    setInputMode,
    boardHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onPointerLeave,
      onContextMenu,
    },
  }
}
