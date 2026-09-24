import { useCallback, useEffect, useRef } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import type { InputMode } from '../../hooks/usePointerInput'
import { haptics } from '../../utils/haptics'
import { useT } from '../../i18n'
import styles from './ActionBar.module.css'

interface Props {
  mode: InputMode
  onChange: (mode: InputMode) => void
  /** 撤销上一笔；无可撤销内容时按钮置灰 */
  onUndo: () => void
  canUndo: boolean
  /**
   * 重新开始这一局。按下只是**提出**这件事：盘上有东西时对局页会先升起一张
   * 确认面板，真正的清空与那一记 clear 触感都发生在玩家点了确认之后。
   */
  onRestart: () => void
  /** 通关庆祝期间收起：不再是可操作的工具，也要给底部结算卡让位 */
  hidden?: boolean
}

/** 左标记、右填色；下标即滑块的两个落点 */
const SLOTS: InputMode[] = ['mark', 'fill']

/** 超过这点位移才算「在拖」，之前都当点按处理 */
const DRAG_START_PX = 3

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * 屏幕底部悬浮的操作条：重新开始 · 模式（× 标记 / ■ 填色）· 撤销。
 * 三块都是首页那套圆角矩形 + 下沿实色厚边，按下去会沉一下。
 *
 * 撤销放右手位、重新开始放左手位：右手用户占多数，而撤销一局要按许多次、
 * 重新开始整局最多按一次——高频的那个该落在拇指最省力的地方。
 */
export function ActionBar({
  mode,
  onChange,
  onUndo,
  canUndo,
  onRestart,
  hidden = false,
}: Props) {
  const t = useT()
  const trackRef = useRef<HTMLDivElement>(null)
  const thumbRef = useRef<HTMLSpanElement>(null)
  /** 一次拖动内量一次的滑轨几何；null 表示当前没有拖动 */
  const dragRef = useRef<{
    axis: 'x' | 'y'
    start: number
    travel: number
    half: number
    startPointer: number
    dragging: boolean
    slot: number
  } | null>(null)
  /*
   * 模式切换做成滑块而不是两个按钮：滑块在轨道上跟着手指走，松手落到最近的
   * 一格。两个格子之间是连续的，切换因而是「推过去」而不是「跳过去」——
   * 这一下一局要做几十次，让它连贯比让它精确更值。
   *
   * 滑块位置由 --slot 这个自定义属性驱动：静止时由 CSS 按 data-mode 给出，
   * 跟手时由这里逐帧写像素值。位移直接写 DOM 不走 state——一次拖动几十帧，
   * 每帧重渲染整条操作条只为改一个 transform 不划算。
   */
  const setSlot = useCallback((px: number) => {
    const thumb = thumbRef.current
    if (!thumb) return
    thumb.style.transition = 'none'
    thumb.style.setProperty('--slot', `${px}px`)
  }, [])

  /*
   * 量一次轨道几何。量的是两枚按钮而不是轨道的内边距——它们本来就是滑块的
   * 两个落点，位置由布局给出，不必再把 CSS 里的 padding 与间距在这里抄一遍。
   */
  const measure = useCallback(() => {
    const slots = trackRef.current?.querySelectorAll('button')
    if (slots?.length !== 2) return null
    const first = slots[0].getBoundingClientRect()
    const second = slots[1].getBoundingClientRect()
    if (first.width <= 0) return null
    const horizontalTravel = second.left - first.left
    const verticalTravel = second.top - first.top
    const axis: 'x' | 'y' =
      Math.abs(verticalTravel) > Math.abs(horizontalTravel) ? 'y' : 'x'
    return axis === 'y'
      ? { axis, start: first.top, travel: verticalTravel, half: first.height / 2 }
      : { axis, start: first.left, travel: horizontalTravel, half: first.width / 2 }
  }, [])

  /** 滑块起始边落在轨道坐标 position 时该选哪一格 */
  const slotFor = useCallback(
    (position: number, travel: number) => (travel > 0 && position > travel / 2 ? 1 : 0),
    [],
  )

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const geometry = measure()
      if (!geometry) return
      const pointer = geometry.axis === 'y' ? event.clientY : event.clientX
      // 点按先落到指头下面那一格；滑块由 CSS 平滑滑过去，不跳
      const slot = slotFor(
        clamp(pointer - geometry.start - geometry.half, 0, geometry.travel),
        geometry.travel,
      )
      dragRef.current = { ...geometry, startPointer: pointer, dragging: false, slot }
      const next = SLOTS[slot]
      if (next !== mode) {
        haptics.selection()
        onChange(next)
      }
      // 放在最后：捕获失败（jsdom、非法 pointerId）也不该让这一笔拖动起不来
      event.currentTarget.setPointerCapture?.(event.pointerId)
    },
    [measure, mode, onChange, slotFor],
  )

  /*
   * click 只服务键盘：指针那一路在 pointerdown 就把模式定了。
   *
   * 两条路都应用一次的时候，来回快速点按会把刚选好的模式弹回去。click 不是
   * pointerdown 的同步续集，它在 pointerup 之后另行派发；手快时**上一次**点按的
   * click 会晚于**这一次**点按的 pointerdown 到达——叉子那一下的 click 落在方块
   * 已经选好之后，它只知道「现在不是标记」，于是又把模式改回叉子。屏幕上就是
   * 光标先跳到方块、随即弹回，最后一次点的那一格反而没算数。
   *
   * 两种触发靠 detail 分辨：指针点出来的 click 是 1 起步，Enter / 空格触发的是 0。
   * 键盘没有 pointerdown 打底，那一路的模式与触感都还得由这里给。
   */
  const selectMode = useCallback(
    (next: InputMode, event: ReactMouseEvent<HTMLButtonElement>) => {
      if (event.detail > 0) return
      if (next !== mode) {
        haptics.selection()
        onChange(next)
      }
    },
    [mode, onChange],
  )

  const undo = useCallback(() => {
    haptics.undo()
    onUndo()
  }, [onUndo])

  /*
   * 重新开始。整条操作栏 data-haptic="self" 退出了全站委托（模式滑块有自己的拖动
   * 手势），所以这里的按钮得逐个自己接——这一个此前是全 app 唯一漏掉触感的按钮。
   *
   * 用通用的 selection：按下只是**提出**重新开始，真正的破坏性动作在确认单里，
   * 那一记由确认单自己给（它不在 self 范围内，走委托）。
   */
  const restart = useCallback(() => {
    haptics.selection()
    onRestart()
  }, [onRestart])

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current
      if (!drag) return
      const pointer = drag.axis === 'y' ? event.clientY : event.clientX
      if (!drag.dragging) {
        if (Math.abs(pointer - drag.startPointer) <= DRAG_START_PX) return
        drag.dragging = true
      }
      const position = clamp(pointer - drag.start - drag.half, 0, drag.travel)
      setSlot(position)
      const nextSlot = slotFor(position, drag.travel)
      if (nextSlot !== drag.slot) {
        drag.slot = nextSlot
        haptics.selection()
        onChange(SLOTS[nextSlot])
      }
    },
    [onChange, setSlot, slotFor],
  )

  const endDrag = useCallback(() => {
    const drag = dragRef.current
    if (!drag) return
    dragRef.current = null
    const thumb = thumbRef.current
    if (!thumb) return
    /*
     * 落到最近的一格。这里仍然写行内值、而不是直接把位置交还 CSS：
     * 新的 mode 要等 React 提交这一帧之后才写进 data-mode，中途交还会让滑块
     * 先朝**旧的**那一格倒退一下再折回来。行内值由下面的 effect 在 mode
     * 落定后撤掉，那时两边的值已经一致，撤掉不产生位移。
     */
    thumb.style.transition = ''
    thumb.style.setProperty('--slot', `${drag.slot === 1 ? drag.travel : 0}px`)
  }, [])

  // mode 落定后撤掉行内值，位置重新由 CSS 说了算
  useEffect(() => {
    thumbRef.current?.style.removeProperty('--slot')
  }, [mode])

  return (
    <div
      className={styles.bar}
      data-hidden={hidden}
      aria-hidden={hidden || undefined}
      /* 撤销有自己的语义，不是通用 selection——退出全站委托，见 utils/uiHaptics */
      data-haptic="self"
    >
      <button
        className={styles.tile}
        onClick={restart}
        data-coach="clear"
        aria-label={t('actionBar.restart')}
        title={t('actionBar.restartTitle')}
      >
        <svg className={styles.glyph} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
          <path d="M21 3v5h-5" />
        </svg>
      </button>

      <div
        ref={trackRef}
        className={styles.modes}
        data-mode={mode}
        data-coach="modes"
        role="group"
        aria-label={t('actionBar.modes')}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <span ref={thumbRef} className={styles.thumb} aria-hidden="true" />
        <button
          className={mode === 'mark' ? `${styles.option} ${styles.active}` : styles.option}
          aria-pressed={mode === 'mark'}
          aria-label={t('actionBar.mark')}
          title={t('actionBar.markTitle')}
          onClick={(event) => selectMode('mark', event)}
        >
          <span className={`${styles.icon} ${styles.iconMark}`} aria-hidden="true" />
        </button>
        <button
          className={mode === 'fill' ? `${styles.option} ${styles.active}` : styles.option}
          aria-pressed={mode === 'fill'}
          aria-label={t('actionBar.fill')}
          title={t('actionBar.fillTitle')}
          onClick={(event) => selectMode('fill', event)}
        >
          <span className={`${styles.icon} ${styles.iconFill}`} aria-hidden="true" />
        </button>
      </div>

      <button
        className={styles.tile}
        onClick={undo}
        disabled={!canUndo}
        data-coach="undo"
        aria-label={t('actionBar.undo')}
        title={t('actionBar.undo')}
      >
        {/* 折回左上的箭头：一条走出去又绕回来的路，指回起点 */}
        <svg className={styles.glyph} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4.6 8.6h9.4a5.5 5.5 0 0 1 0 11H8.2" />
          <path d="M8.7 4.1 4.2 8.6l4.5 4.5" />
        </svg>
      </button>
    </div>
  )
}
