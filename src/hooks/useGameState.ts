import { useCallback, useMemo, useRef, useState } from 'react'
import type { Board, CellState, GameStatus, Puzzle } from '../types'
import { checkWinByClues, getColumn, isLineSatisfied } from '../utils/clues'
import { createPuzzleBoard, isPresetMark, isPuzzleBoardPristine } from '../utils/presetMarks'
import { DEFAULT_SETTINGS } from '../utils/settings'
import type { StrokeRule } from '../utils/settings'

/** 对局规则，来自玩家设置；改它会换掉 reducer，但不动已经落在盘上的进度 */
export interface GameRules {
  /** easy=点在叉上能直接改成方块（只改一格），strict=方块与叉互不干扰 */
  strokeRule: StrokeRule
  /** 补完整行整列时自动把该行列剩余空格标成叉 */
  autoMark: boolean
}

export const DEFAULT_RULES: GameRules = {
  strokeRule: DEFAULT_SETTINGS.strokeRule,
  autoMark: DEFAULT_SETTINGS.autoMark,
}

/** 玩家操作意图：fill=填充模式，mark=标记模式（右键为标记快捷键） */
export type CellIntent = 'fill' | 'mark'

/** 一次被规则接受的玩家落笔，供输入层在同一事件里选择唯一一条触感语义。 */
export interface CellMutation {
  kind: 'fill' | 'mark' | 'erase'
  row: number
  col: number
  /** 这次变化令所在行或列从未满足变为满足；行列同时完成仍只是 true。 */
  completedLine: boolean
  /** 这次变化令整个谜题从 playing 进入 won。 */
  won: boolean
}

/** 一次手势（笔画）内的状态转换：仅 from 列出的状态被置为 target，其余不动、不翻转 */
interface Stroke {
  from: readonly CellState[]
  target: CellState
  /** 只作用于落笔那一格，抬手前不再跟随手指延伸（见 strokeFor 中「叉上起笔」一段） */
  single?: true
}

interface State {
  board: Board
  status: GameStatus
  /** 盘面最后一次变化来自哪里；反馈层只响应真实 stroke，撤销/重开不伪装成落子。 */
  boardChangeSource: 'init' | 'stroke' | 'undo' | 'reset' | 'solve'
  stroke: Stroke | null
  /*
   * 本次笔画落笔前的盘面。撤销以「一笔」为单位——点一格和拖一行都是一笔，
   * 补完整行整列时自动补上的那串叉也在同一笔里，撤销要连它们一起收回。
   * 所以快照在落笔前扣下、抬手时才入栈，中途每跨一格并不各算一步。
   */
  strokeBase: Board | null
  /* 撤销栈。盘面本身不可变，入栈存的是引用，不是拷贝 */
  history: Board[]
}

type Action =
  | { type: 'BEGIN_STROKE'; row: number; col: number; intent: CellIntent }
  | { type: 'CONTINUE_STROKE'; row: number; col: number }
  | { type: 'END_STROKE' }
  | { type: 'UNDO' }
  | { type: 'RESET' }
  | { type: 'SOLVE' }

/*
 * 撤销栈上限。一局 15×15 的落笔数远不止这些，但玩家真正会回溯的只有最近几步；
 * 栈里存的是引用，留得再多也主要是让更早的盘面版本迟迟不能回收。
 */
const HISTORY_LIMIT = 64

function pushHistory(history: Board[], board: Board): Board[] {
  const kept = history.length >= HISTORY_LIMIT ? history.slice(1) : history
  return [...kept, board]
}

/*
 * 手势起点格状态 + 意图 → 本次笔画的转换规则；不成立的组合返回 null。
 *
 * 一条贯穿两套规则的底线：**一笔只做一件事**。落笔那一格决定这笔是涂、是擦、
 * 还是画叉、擦叉，沿途凡是不符合起手状态的格子一律绕开。叉是玩家（或自动补齐）
 * 已经落下的推理结论，一次划过去就把它们抹成方块，代价远大于省下的那一步——
 * 线索 5 从头拖到底，右边刚补上的那串叉会被同一笔顺手吃掉；线索 2 3 中间那段
 * 留白也一样。所以涂的时候只认空格，擦的时候只认自己那一种记号。
 *
 * 方块工具：空格起笔连着涂，方块起笔连着擦。
 * 叉子工具：空格起笔连着画叉，叉起笔连着擦叉，方块一概不碰。
 *
 * 两套规则的差别只剩一条，玩家在设置里选（默认「简易」）：
 *
 *   简易：方块工具点在叉上，直接把叉改成方块——但**只改那一格就收笔**。
 *     这是简易那点便利的对价：既然它允许一下就改掉已经落下的推理结论，
 *     就不能再让这一下跟着手指延伸，否则误触的代价从一格放大到一整行。
 *
 *   严谨：方块与叉互不干扰，点在叉上不成笔画，要改得先切到叉子工具擦掉。
 */
function strokeFor(startState: CellState, intent: CellIntent, rule: StrokeRule): Stroke | null {
  // 简易独有的一条：叉上直接起方块，且到此为止
  if (rule === 'easy' && intent === 'fill' && startState === 'marked') {
    return { from: ['marked'], target: 'filled', single: true }
  }
  if (intent === 'fill') {
    if (startState === 'empty') return { from: ['empty'], target: 'filled' }
    if (startState === 'filled') return { from: ['filled'], target: 'empty' }
    return null
  }
  if (startState === 'empty') return { from: ['empty'], target: 'marked' }
  if (startState === 'marked') return { from: ['marked'], target: 'empty' }
  return null
}

function applyStroke(
  state: State,
  row: number,
  col: number,
  puzzle: Puzzle,
  rules: GameRules,
): State {
  const stroke = state.stroke
  if (!stroke || isPresetMark(puzzle, row, col) || !stroke.from.includes(state.board[row][col])) {
    return state
  }
  let board = state.board.map((r, ri) =>
    ri === row ? r.map((cell, ci) => (ci === col ? stroke.target : cell)) : r,
  )
  if (rules.autoMark && stroke.target === 'filled') {
    const completedRow = isLineSatisfied(board[row], puzzle.clues.rows[row])
    const completedCol = isLineSatisfied(getColumn(board, col), puzzle.clues.cols[col])
    if (completedRow || completedCol) {
      board = board.map((line, r) =>
        line.map((cell, c) => {
          if (cell !== 'empty') return cell
          if ((completedRow && r === row) || (completedCol && c === col)) return 'marked'
          return cell
        }),
      )
    }
  }
  const won = checkWinByClues(board, puzzle.clues)
  return {
    ...state,
    board,
    status: won ? 'won' : 'playing',
    boardChangeSource: 'stroke',
    stroke: won ? null : stroke,
  }
}

/** 抬手：这一笔真的改动了盘面才入撤销栈，空手一按不占位置 */
function commitStroke(state: State): State {
  const base = state.strokeBase
  if (!base && !state.stroke) return state
  return {
    ...state,
    stroke: null,
    strokeBase: null,
    history: !base || base === state.board ? state.history : pushHistory(state.history, base),
  }
}

function makeReducer(puzzle: Puzzle, rules: GameRules) {
  return function reducer(state: State, action: Action): State {
    if (action.type === 'RESET') {
      return {
        board: createPuzzleBoard(puzzle),
        status: 'playing',
        boardChangeSource: 'reset',
        stroke: null,
        strokeBase: null,
        history: [],
      }
    }
    /*
     * 直接摆出解答并判胜。只有 DEV 包的开发菜单会派这个 action——测揭晓动画、
     * 结算卡、解锁提示时，没必要每次真的把一张 15×15 涂完。
     * 撤销栈清掉：跳过来的这一步不该能退回去，退回去的盘面本来也不存在。
     */
    if (action.type === 'SOLVE') {
      return {
        board: puzzle.solution.map((line) => line.map((v) => (v ? 'filled' : 'marked'))),
        status: 'won',
        boardChangeSource: 'solve',
        stroke: null,
        strokeBase: null,
        history: [],
      }
    }
    // 胜利那一步会把 stroke 清掉，但快照还挂着；抬手这一下要照常收尾
    if (action.type === 'END_STROKE') return commitStroke(state)
    if (state.status === 'won') return state
    switch (action.type) {
      case 'BEGIN_STROKE': {
        const stroke = strokeFor(state.board[action.row][action.col], action.intent, rules.strokeRule)
        if (!stroke) return state
        const next = applyStroke(
          { ...state, stroke, strokeBase: state.board },
          action.row,
          action.col,
          puzzle,
          rules,
        )
        // 单格笔画落完就摘掉 stroke，后续的 CONTINUE_STROKE 自然全部落空；
        // strokeBase 留着，抬手时照常入撤销栈。
        return stroke.single ? { ...next, stroke: null } : next
      }
      case 'CONTINUE_STROKE':
        return applyStroke(state, action.row, action.col, puzzle, rules)
      case 'UNDO': {
        if (state.history.length === 0) return state
        return {
          board: state.history[state.history.length - 1],
          status: 'playing',
          boardChangeSource: 'undo',
          stroke: null,
          strokeBase: null,
          history: state.history.slice(0, -1),
        }
      }
    }
  }
}

function mutationBetween(
  before: State,
  after: State,
  row: number,
  col: number,
  puzzle: Puzzle,
): CellMutation | null {
  if (before.board === after.board || before.board[row][col] === after.board[row][col]) return null

  const rowWasSatisfied = isLineSatisfied(before.board[row], puzzle.clues.rows[row])
  const colWasSatisfied = isLineSatisfied(getColumn(before.board, col), puzzle.clues.cols[col])
  const rowIsSatisfied = isLineSatisfied(after.board[row], puzzle.clues.rows[row])
  const colIsSatisfied = isLineSatisfied(getColumn(after.board, col), puzzle.clues.cols[col])
  const next = after.board[row][col]

  return {
    kind: next === 'filled' ? 'fill' : next === 'marked' ? 'mark' : 'erase',
    row,
    col,
    completedLine:
      (rowIsSatisfied && !rowWasSatisfied) || (colIsSatisfied && !colWasSatisfied),
    won: before.status !== 'won' && after.status === 'won',
  }
}

/**
 * 游戏状态中枢：棋盘三态 + 笔画手势 + 撤销栈 + 胜利判定。
 * savedBoard 为存档序列化串，解码失败时从空盘开始。
 *
 * rules 中途改变（玩家在设置里换了规则）只换掉 reducer，不重置盘面与撤销栈——
 * 换规则是换「接下来怎么涂」，不是重开一局。
 */
export function useGameState(puzzle: Puzzle, savedBoard?: string, rules: GameRules = DEFAULT_RULES) {
  const reducer = useMemo(
    () => makeReducer(puzzle, rules),
    // 规则是两个标量，按值订阅；整个对象每次渲染都是新的，按引用订阅等于每帧重建
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [puzzle, rules.strokeRule, rules.autoMark],
  )
  const [state, setState] = useState<State>(() => {
    const board = createPuzzleBoard(puzzle, savedBoard)
    return {
      board,
      status: checkWinByClues(board, puzzle.clues) ? 'won' : 'playing',
      boardChangeSource: 'init',
      stroke: null,
      strokeBase: null,
      history: [],
    }
  })
  /*
   * pointermove 可能在同一个浏览器事件里补过数格，React 会把这些 setState 批处理。
   * ref 保存已经接受到哪一格，让下一格基于刚才的盘面继续算，并把“是否真的改变”
   * 同步交还给输入 handler；触感因此不必等 render 后再反查 board diff。
   */
  const stateRef = useRef(state)
  stateRef.current = state

  const applyAction = useCallback(
    (action: Action): { before: State; after: State } => {
      const before = stateRef.current
      const after = reducer(before, action)
      if (after !== before) {
        stateRef.current = after
        setState(after)
      }
      return { before, after }
    },
    [reducer],
  )

  const previewStroke = useCallback(
    (row: number, col: number, intent: CellIntent): CellMutation['kind'] | null => {
      const current = stateRef.current
      if (current.status === 'won' || isPresetMark(puzzle, row, col)) return null
      const stroke = strokeFor(current.board[row][col], intent, rules.strokeRule)
      if (!stroke) return null
      return stroke.target === 'filled' ? 'fill' : stroke.target === 'marked' ? 'mark' : 'erase'
    },
    [puzzle, rules.strokeRule],
  )

  const beginStroke = useCallback(
    (row: number, col: number, intent: CellIntent): CellMutation | null => {
      const { before, after } = applyAction({ type: 'BEGIN_STROKE', row, col, intent })
      return mutationBetween(before, after, row, col, puzzle)
    },
    [applyAction, puzzle],
  )
  const continueStroke = useCallback(
    (row: number, col: number): CellMutation | null => {
      const { before, after } = applyAction({ type: 'CONTINUE_STROKE', row, col })
      return mutationBetween(before, after, row, col, puzzle)
    },
    [applyAction, puzzle],
  )
  const endStroke = useCallback(() => applyAction({ type: 'END_STROKE' }), [applyAction])
  const undo = useCallback(() => applyAction({ type: 'UNDO' }), [applyAction])
  const reset = useCallback(() => applyAction({ type: 'RESET' }), [applyAction])
  /** 只给 DEV 包的开发菜单用 */
  const solve = useCallback(() => applyAction({ type: 'SOLVE' }), [applyAction])

  return {
    board: state.board,
    boardChangeSource: state.boardChangeSource,
    status: state.status,
    isPristine: isPuzzleBoardPristine(puzzle, state.board),
    canUndo: state.history.length > 0 && state.status === 'playing',
    previewStroke,
    beginStroke,
    continueStroke,
    endStroke,
    undo,
    reset,
    solve,
  }
}
