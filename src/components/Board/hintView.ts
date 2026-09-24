import type { Hint } from '../../utils/hint'
import { hintFocusCell } from '../../utils/hint'

/** 提示要在棋盘上点亮的东西，由 Game 从一条 Hint 派生（见 utils/hint） */
export interface HintView {
  /**
   * 第几次按下提示。它当 key 用：同一条线被再次指出来时，DOM 节点若被复用，
   * 幽灵条那段动画就不会重放——玩家看到的是一个没反应的按钮。
   */
  token: number
  /** 点亮的行；列提示且未叠加时为 null */
  row: number | null
  /** 点亮的列 */
  col: number | null
  /** 这句话真正说到的格子。涂与叉画法不同，理由见下方 .hintCell */
  cells: { row: number; col: number; state: 'filled' | 'marked' | 'ghostMark' }[]
  /** 第二次追问时锁定的交点，只有行列都点亮时才有 */
  focus: { row: number; col: number } | null
  /** 重叠法的演示：这一段最左摆法从这里滑到最右摆法 */
  ghost: {
    orientation: 'row' | 'col'
    index: number
    run: number
    leftStart: number
    rightStart: number
  } | null
}

/**
 * 一条提示落到棋盘上：点亮哪一条线、照亮哪几格、要不要放重叠法那段动画。
 *
 * crossed 为第二次追问（level 2）：把另一条轴叠上来、框住交点那一格。
 * 到这一步等于把「下一个能涂的地方」直接指出来了，所以它必须是玩家再问一次
 * 才给的东西，不是第一次点提示就送到手上的。
 *
 * 实战的提示按钮与新手教学共用这一段：教程里棋盘上亮起来的东西，
 * 与玩家自己按下提示时看到的，必须是同一套画法。
 */
export function buildHintView(
  hint: Hint,
  { token, crossed }: { token: number; crossed: boolean },
): HintView {
  const focus = hintFocusCell(hint)
  return {
    token,
    row: hint.orientation === 'row' ? hint.index : crossed ? focus.row : null,
    col: hint.orientation === 'col' ? hint.index : crossed ? focus.col : null,
    cells: hint.cells.map((cell) => ({
      row: hint.orientation === 'row' ? hint.index : cell.at,
      col: hint.orientation === 'row' ? cell.at : hint.index,
      state: cell.state,
    })),
    focus: crossed ? focus : null,
    ghost: hint.overlap
      ? {
          orientation: hint.orientation,
          index: hint.index,
          run: hint.overlap.run,
          leftStart: hint.overlap.leftStart,
          rightStart: hint.overlap.rightStart,
        }
      : null,
  }
}
