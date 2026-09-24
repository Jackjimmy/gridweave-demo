import { useCallback, useId, useMemo, useState } from 'react'
import type { HTMLAttributes } from 'react'
import type { Board } from '../../types'
import type { CellPosition } from '../../hooks/usePointerInput'
import { useT } from '../../i18n'
import { Cell } from './Cell'
import { GridLines } from './GridLines'
import { BoardCanvas } from './BoardCanvas'
import { RevealCanvas } from './RevealCanvas'
import { HintOverlay } from './HintOverlay'
import type { HintView } from './hintView'
import {
  DEFAULT_FLASH_COLOR,
  DEFAULT_SCENE_FADE,
  DEFAULT_WAVE,
  REVEAL_TIMING,
  buildRevealPlan,
} from './revealTimeline'
import type { RevealOrigin, RevealWave } from './revealTimeline'
import styles from './Board.module.css'

interface Props {
  board: Board
  hovered: CellPosition | null
  won: boolean
  /** 每格胜利揭晓颜色（来自关卡 art）；无 art 时为 null */
  artColors: (string | null)[][] | null
  /** 每格场景背景色（来自关卡 scene）；无场景时为 null */
  sceneColors: (string | null)[][] | null
  /** 关卡答案矩阵，用于排布揭晓动画的时序 */
  solution: number[][]
  /** 揭晓动画是否已放完（含跳过）；true 时棋盘呈现静态终态 */
  revealed: boolean
  finishRevealImmediately?: boolean
  /** 拿不到 canvas 时才让 DOM 顶上终态配色，见 Board.module.css 的 .domFallback */
  canvasUnavailable?: boolean
  onRevealComplete: () => void
  onCanvasUnavailable?: () => void
  handlers: HTMLAttributes<HTMLDivElement>
  /**
   * 键盘光标落在哪一格；棋盘没有键盘焦点时为 null。
   * 它只管画那一圈焦点框，落笔与十字高亮各走各的路（见 useKeyboardInput）。
   */
  cursor?: CellPosition | null
  /** 提示要点亮的行列；无提示时为 null */
  hint?: HintView | null
  /** 已对齐到整数物理像素的格边长；BoardCanvas 拿它当重排信号（见那边的注释） */
  cellSize?: number | null
  /** 揭晓起点：玩家点下的最后一格；null 时 from-touch 退化为对角波 */
  revealOrigin?: RevealOrigin | null
  /**
   * 起点是否已确定。胜利那一帧起点还没定，此时先不挂 canvas，
   * 免得用错起点排好的时间线在下一帧被换掉、动画从头重放。
   */
  revealArmed?: boolean
  /** 揭晓波形，仅调试台用于对比；缺省走 DEFAULT_WAVE */
  revealWave?: RevealWave
  /** 揭晓放慢倍数，仅调试台使用 */
  revealSpeed?: number
  /** 主体格入场高亮色，仅调试台用于对比；缺省走 DEFAULT_FLASH_COLOR */
  revealFlashColor?: string | 'none'
  /** 背景格是否透明度淡入，仅调试台用于对比；缺省走 DEFAULT_SCENE_FADE */
  revealSceneFade?: boolean
}

export function GameBoard({
  board,
  hovered,
  won,
  artColors,
  sceneColors,
  solution,
  revealed,
  finishRevealImmediately = false,
  canvasUnavailable = false,
  onRevealComplete,
  onCanvasUnavailable,
  handlers,
  cursor = null,
  hint = null,
  cellSize = null,
  revealOrigin = null,
  revealArmed = true,
  revealWave = DEFAULT_WAVE,
  revealSpeed = 1,
  revealFlashColor = DEFAULT_FLASH_COLOR,
  revealSceneFade = DEFAULT_SCENE_FADE,
}: Props) {
  const t = useT()
  const size = board.length
  /*
   * 格子的 id 前缀。焦点落在棋盘容器上，读屏靠 aria-activedescendant 才知道
   * 光标此刻停在哪一格——那一格上本来就写着「第几行第几列，什么状态」。
   * 用 useId 而不是写死一个常量：对局层与预热的上一层可能同时挂在树上。
   */
  const gridId = useId()
  const plan = useMemo(
    () => buildRevealPlan(solution, sceneColors !== null, REVEAL_TIMING, revealWave, revealOrigin),
    [solution, sceneColors, revealWave, revealOrigin],
  )

  /*
   * 对局盘面的像素由 BoardCanvas 出（成因与理由见那边的头注释）。拿不到 2d
   * 上下文的极老 WebView 退回从前那套 DOM 格子 + SVG 网格线，一格不少地照画。
   */
  const [paintUnavailable, setPaintUnavailable] = useState(false)
  const onPaintUnavailable = useCallback(() => setPaintUnavailable(true), [])
  const painted = !won && !paintUnavailable

  const classes = [styles.board]
  if (won) classes.push(styles.won)
  if (revealed) classes.push(styles.revealed)
  if (canvasUnavailable) classes.push(styles.domFallback)
  // 盘面由 canvas 出像素时，下方 DOM 格子只留结构与无障碍，不再自己上色
  if (painted) classes.push(styles.canvasPainted)

  return (
    <div
      className={classes.join(' ')}
      /*
       * 两个轴都必须是定长轨道。以前只锁了列，行由 implicit `auto` tracks
       * 生成；在 iOS 16 的 WebKit 中，格子内容（×）或完成线索更新时会重新参与
       * 这些 auto track 的固有尺寸计算，10×10 / 15×15 的分数格高便会被重新分配，
       * 肉眼看起来就是棋盘上下浮动。显式行轨让盘面高度只由 size × cell-size 决定。
       */
      style={{
        gridTemplateColumns: `repeat(${size}, var(--cell-size))`,
        gridTemplateRows: `repeat(${size}, var(--cell-size))`,
      }}
      role="grid"
      aria-label={t('game.board')}
      aria-activedescendant={cursor ? `${gridId}-${cursor.row}-${cursor.col}` : undefined}
      {...handlers}
    >
      {board.map((row, r) => (
        <div key={r} className={styles.row} role="row">
          {row.map((state, c) => (
            <Cell
              key={c}
              id={`${gridId}-${r}-${c}`}
              state={state}
              row={r}
              col={c}
              highlighted={hovered !== null && (hovered.row === r || hovered.col === c)}
              revealColor={artColors?.[r][c] ?? null}
              sceneColor={sceneColors?.[r][c] ?? null}
              showMark={!painted}
            />
          ))}
        </div>
      ))}
      {/*
        对局盘面：格底、× 标记、十字高亮、提示高亮与网格线由这张 canvas 一次画完，
        四条光栅化路径合成一条（详见 BoardCanvas 头注释）。
      */}
      {painted && (
        <BoardCanvas
          board={board}
          hovered={hovered}
          hint={hint}
          cellSize={cellSize}
          onUnavailable={onPaintUnavailable}
        />
      )}
      {/*
        提示高亮画在格子之上、网格线之下。canvas 接管后这两层都在 canvas 里，
        DOM 只剩会动的幽灵条——它是半透明的滑块，本来就不需要压着物理像素。
      */}
      {!won && hint && <HintOverlay view={hint} ghostOnly={painted} />}
      {/*
        键盘光标那一圈框。画在这儿而不是落到格子自己身上：对局盘面由上面那张
        不透明的 canvas 出像素，格子上的任何描边都会被它盖住（见 Board.module.css
        的 .canvasPainted）。位置与提示层同一套算法，只是它归键盘。
      */}
      {!won && cursor && (
        <div className={styles.cursorLayer} aria-hidden="true">
          <div
            className={styles.cursorCell}
            style={{
              top: `calc(var(--cell-size) * ${cursor.row})`,
              left: `calc(var(--cell-size) * ${cursor.col})`,
              width: 'var(--cell-size)',
              height: 'var(--cell-size)',
            }}
          />
        </div>
      )}
      {/*
        胜利即整体撤下网格线：终态是一幅画，不该再有棋盘的痕迹。
        这里用「不渲染」而不是淡出或 opacity——两者都要靠一条 CSS 过渡跑完才干净，
        过渡一旦没跑（页面不可见、掉帧、动画被打断），半透明的网格就整条留在画上。
      */}
      {!won && !painted && <GridLines size={size} />}
      {/*
        揭晓放完后 canvas 不卸载：那幅画就由它一直呈现。
        交还给 DOM 会把画重新拆成上百个独立盒子，格边落在半个物理像素上时
        相邻两格之间漏出板底白线，整幅画被切成网格（详见 RevealCanvas 头注释）。
        下方 DOM 的终态配色保留，作为拿不到 2d 上下文时的兜底。
      */}
      {won && revealArmed && (
        <RevealCanvas
          size={size}
          finishImmediately={finishRevealImmediately}
          plan={plan}
          artColors={artColors}
          sceneColors={sceneColors}
          speed={revealSpeed}
          flashColor={revealFlashColor}
          sceneFade={revealSceneFade}
          onUnavailable={onCanvasUnavailable}
          onComplete={onRevealComplete}
        />
      )}
    </div>
  )
}
