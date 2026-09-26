import heartData from '../../data/puzzles/easy/festive-tales-01-heart.json'
import starData from '../../data/puzzles/easy/festive-tales-04-star.json'
import type { Board, Puzzle, PuzzleData } from '../../types'
import { deriveClues } from '../../utils/clues'
import type { ListKey, TextKey } from '../../i18n'
import type { HintView } from '../Board/hintView'

/**
 * 新手教学的脚本：**在真棋盘上**带着玩家把第一关走完。
 *
 * 开场先认一眼东西：压暗四周只留整张盘，指着旁边的数字说清「这局在干什么」。
 * 只此一页——第一次玩的人连要涂什么都不知道，直接把手推到盘上，他照做完
 * 一行也不知道自己刚才做的是什么。之后全程动手：先涂一行，再看自动补叉和
 * 分段数字；工具在需要时介绍；最后一步撤掉落点高亮，让玩家自己判断。
 * 完整重看仍沿用这套脚本，并复用 Game 的重开确认。
 *
 * 排课顺序照着这张盘真正的解法走，一步都不能提前：
 *
 *   第 2、3 行的 5   整行占满，位置不用想 —— 唯一能空盘开局的一手
 *   ↓ 两端两列的 2 当场凑齐，六个叉由 autoMark 自己冒出来
 *   第 4 行的 3      被两头的叉夹住，中间正好剩 3 格
 *   第 1 行的 1 1    同样被夹住，两段之间必须空一格
 *   ↓ 中间两列的 4 凑齐，最后一行只剩正中一格是空的
 *   第 5 行的 1      补上即通关
 *
 * 每一步「凭什么能推出来」不是这里编的，而是提示引擎在**当时那个盘面**上
 * 真的推得出来——coachScript.test.ts 拿 solveLine 逐步核对。哪天关卡或
 * 引擎改了、某一步不再是必然的一手，测试会先喊，而不是等新手卡在那儿乱猜。
 *
 * 文案一律用最直白的话：不写「线索」「重叠」「满足」这些行话——第一次玩的人
 * 不懂，而这几页的全部意义就是让他懂。
 */

/**
 * 教程绑定的那一关。入口（首次进入自动开讲、顶栏的「新手教学」按钮）都认它：
 * 讲的是这张盘的解法，摆到别的关卡上，每一句都对不上眼前的数字。
 */
export const TUTORIAL_LEVEL_ID = 'festive-tales-01-heart'

export const TUTORIAL_PUZZLE: Puzzle = {
  ...(heartData as PuzzleData),
  clues: deriveClues((heartData as PuzzleData).solution),
}

/**
 * 第二步教学绑定的关卡——节日奇谭第 4 关「星星」。
 *
 * 第一步（heart）已经教了涂色。到了这一关，玩家第一次遇到
 * 「涂完整行 5 之后剩下的行看不出该涂哪里」的情况——这是教叉子的最佳时机。
 * 那个切换开关也挪到了这里：第一关从头到尾只涂不叉，在那儿讲它，学的是一件
 * 当时用不上的事；摆在真要打叉的前一步，玩家拨完就用得上。
 *
 * 星星从前排在第 5 关，玩具飞机排第 4。两关对调过来（见 data/collections.json）：
 * 玩具飞机自己也可能要靠叉子去排除，排在星星前面就成了「没教就得先用」。
 * 教学跟着星星走，不跟着位置走，于是正式的两段教学落在第 1 关与第 4 关。
 *
 * 教学路径：
 *   认一眼这张盘     压暗四周，说清这一关要学的是叉子
 *   拨一拨切换开关   左边叉、右边涂，这一页的开关是真能拨的
 *   第 2 行的 5      整行涂满（热手，上一关学过的）
 *   ↓ 转向列：先排除再补涂
 *   第 1 列 [1,2]    1 在第 2 行、2 在底边 → 第 1、3 行打叉
 *   第 1 列剩两格    涂上那个 2
 *   第 5 列 [1,2]    对称，同理打叉 → 涂满
 *   ↓ 第 5 行 autoMark 冒出来（heart 教学里讲过，不再重复）
 *   第 4 行 [2,2]    两头已有，各补一格
 *   剩下四格          撤掉高亮，「这次你自己来」，涂完即通关（与 heart 的末步同款）
 *
 * 从前末尾是一页指着灯泡说「卡住了随时点它」。提示现在在第二关（钻石）
 * 一开局就当面介绍过了（见 HintIntro），走到这儿的人早知道它在哪儿、是干什么的，
 * 这一页就撤了——同一句话说两遍，第二遍只会让人以为自己漏了什么。
 */
export const TUTORIAL2_LEVEL_ID = 'festive-tales-04-star'

export const TUTORIAL2_PUZZLE: Puzzle = {
  ...(starData as PuzzleData),
  clues: deriveClues((starData as PuzzleData).solution),
}

/**
 * 灯泡介绍绑定的关卡——首册第 2 关「钻石」（见 Tutorial/HintIntro）。
 *
 * 第一关教完涂色，第二关没有人牵着手了，这一步跳得有点大。开局先把灯泡指给他：
 * 卡住了就点它，不限次数，随时当老师用。之后每一关卡住都有这条出路，
 * 星星那一关的教学末尾就不必再讲一遍灯泡。
 */
export const HINT_INTRO_LEVEL_ID = 'festive-tales-02-diamond'

export interface CoachCell {
  row: number
  col: number
}

/**
 * 压暗四周时留在光里的那一块。只有开场认东西的几页用得上。
 *
 * 'board'   整张盘连线索：开场那句「数字告诉你涂哪几格」
 * 'element' 界面上的某一块真东西，按 data-coach 找：对局里是操作条上的按钮
 *           （清空 / 切换 / 撤销 / 提示），首页导览指的是那几个板块
 *           （字标 / 主题画册 / 我的收藏 / 每日挑战 / 新手入口，见 HomeTour）
 */
export type CoachSpot =
  | { kind: 'board' }
  | { kind: 'element'; target: CoachTarget }

export type CoachTarget =
  | 'clear'
  | 'modes'
  | 'undo'
  | 'hint'
  | 'title'
  | 'themes'
  | 'collection'
  | 'daily'
  | 'lesson'

export interface CoachStep {
  id: string
  /** 最后一步收起落点高亮，交还整个棋盘，由玩家独立判断。 */
  independent?: boolean
  /**
   * 这一页说的话，以消息键的形式留在这里。
   *
   * 脚本管的是**教学的编排**——哪一步讲哪个按钮、要玩家涂哪几格、盘上点亮什么；
   * 那句话具体怎么说是九个语言各自的事，归消息包（见 i18n/messages）。
   * 编排与措辞分开之后，加一个语言碰不到这张表，改一步顺序也不必动九份文案。
   */
  titleKey: TextKey
  /** 一到两行短句。长了没人读，这是新手第一次见到的界面 */
  linesKey: ListKey
  /** 压暗四周、只留这一块；不给就整个界面照常亮着 */
  dim?: CoachSpot
  /** 轮到玩家亲手涂的格子。只有这些格子接受落笔；空数组＝只讲不做，点屏幕继续 */
  fill: CoachCell[]
  /** 轮到玩家亲手打叉的格子。只有这些格子接受打叉 */
  mark?: CoachCell[]
  /** 只讲不做的页要在盘上指的格子（叉），点亮但不要求动手 */
  point?: CoachCell[]
  /** 额外点亮的列数字，用来指「这两列已经够了」 */
  cols?: number[]
  /**
   * 在要涂的那一段上放一条滑过去的引导（复用提示的幽灵条画法）。
   * 只给**连着的**一段——两格中间隔着必须留空的格子时，滑过去等于教错。
   */
  ghost?: boolean
  /**
   * 打叉步骤的引导：在目标位置画一个呼吸发光的淡蓝色叉子。
   * 新手第一次见叉子，光画个空心框根本看不出那是什么意思。
   */
  ghostMark?: boolean
  /**
   * 压暗的那一块可以真按：catcher 在目标位置开个洞，点击穿透到下面的真按钮。
   * 介绍切换开关那一页用——让玩家自己拨一拨，比光看一眼记得牢。
   */
  interactive?: boolean
}

// ---------------------------------------------------------------------------
//  第一步教学：heart
// ---------------------------------------------------------------------------

const ROW_2 = [0, 1, 2, 3, 4].map((col) => ({ row: 1, col }))
const ROW_3 = [0, 1, 2, 3, 4].map((col) => ({ row: 2, col }))

/** 涂满第 2、3 行后 autoMark 替玩家打上的那六个叉（两端两列各自涂够了） */
const AUTO_MARKS: CoachCell[] = [
  { row: 0, col: 0 },
  { row: 0, col: 4 },
  { row: 3, col: 0 },
  { row: 3, col: 4 },
  { row: 4, col: 0 },
  { row: 4, col: 4 },
]

export const COACH_STEPS: CoachStep[] = [
  {
    /*
     * 开场认东西的那一页，也是全程唯一压暗的一页：只留整张盘连同两侧的数字。
     * 说的就一句「左边管行、上面管列，照着涂出一幅画」——这一关后面每一步
     * 的推理都架在这句话上，缺了它，玩家涂完第 2 行也不知道自己在涂什么。
     */
    id: 'goal',
    titleKey: 'tutorial.goal.title',
    linesKey: 'tutorial.goal.lines',
    dim: { kind: 'board' },
    fill: [],
  },
  {
    id: 'row-2',
    titleKey: 'tutorial.row2.title',
    linesKey: 'tutorial.row2.lines',
    fill: ROW_2,
    ghost: true,
  },
  {
    id: 'row-3',
    titleKey: 'tutorial.row3.title',
    linesKey: 'tutorial.row3.lines',
    fill: ROW_3,
    ghost: true,
  },
  {
    id: 'auto-mark',
    titleKey: 'tutorial.autoMark.title',
    linesKey: 'tutorial.autoMark.lines',
    fill: [],
    point: AUTO_MARKS,
    cols: [0, 4],
  },
  {
    id: 'row-4',
    titleKey: 'tutorial.row4.title',
    linesKey: 'tutorial.row4.lines',
    fill: [
      { row: 3, col: 1 },
      { row: 3, col: 2 },
      { row: 3, col: 3 },
    ],
    ghost: true,
  },
  {
    id: 'row-1',
    titleKey: 'tutorial.row1.title',
    linesKey: 'tutorial.row1.lines',
    fill: [
      { row: 0, col: 1 },
      { row: 0, col: 3 },
    ],
  },
  {
    id: 'row-5',
    independent: true,
    titleKey: 'tutorial.row5.title',
    linesKey: 'tutorial.row5.lines',
    fill: [{ row: 4, col: 2 }],
    ghost: true,
  },
]

// ---------------------------------------------------------------------------
//  第二步教学：star（叉子的使用）
// ---------------------------------------------------------------------------

const STAR_ROW_2 = [0, 1, 2, 3, 4].map((col) => ({ row: 1, col }))

export const COACH_STEPS_STAR: CoachStep[] = [
  {
    id: 'intro',
    titleKey: 'tutorial.star.intro.title',
    linesKey: 'tutorial.star.intro.lines',
    dim: { kind: 'board' },
    fill: [],
  },
  {
    /*
     * 认那个切换开关，也是全程唯一能真按的一页（interactive）。
     *
     * 它从前排在第一关，紧跟着开场那一页——可第一关从头到尾只涂不叉，
     * 学了个当时用不上的东西，等真要打叉已经隔了三关。摆在这里正合适：
     * 下一步就要用叉子，玩家拨一拨、再看着自己拨过的那一档去打叉。
     */
    id: 'tool-mode',
    titleKey: 'tutorial.toolMode.title',
    linesKey: 'tutorial.toolMode.lines',
    dim: { kind: 'element', target: 'modes' },
    fill: [],
    interactive: true,
  },
  {
    id: 'star-row-2',
    titleKey: 'tutorial.star.row2.title',
    linesKey: 'tutorial.star.row2.lines',
    fill: STAR_ROW_2,
    ghost: true,
  },
  {
    id: 'cross-col-0',
    titleKey: 'tutorial.star.crossCol1.title',
    linesKey: 'tutorial.star.crossCol1.lines',
    fill: [],
    mark: [
      { row: 0, col: 0 },
      { row: 2, col: 0 },
    ],
    ghostMark: true,
  },
  {
    id: 'fill-col-0',
    titleKey: 'tutorial.star.fillCol1.title',
    linesKey: 'tutorial.star.fillCol1.lines',
    fill: [
      { row: 3, col: 0 },
      { row: 4, col: 0 },
    ],
    ghost: true,
  },
  {
    id: 'cross-col-4',
    titleKey: 'tutorial.star.crossCol5.title',
    linesKey: 'tutorial.star.crossCol5.lines',
    fill: [],
    mark: [
      { row: 0, col: 4 },
      { row: 2, col: 4 },
    ],
    ghostMark: true,
  },
  {
    id: 'fill-col-4',
    titleKey: 'tutorial.star.fillCol5.title',
    linesKey: 'tutorial.star.fillCol5.lines',
    fill: [
      { row: 3, col: 4 },
      { row: 4, col: 4 },
    ],
    ghost: true,
  },
  {
    id: 'star-row-4',
    titleKey: 'tutorial.star.row4.title',
    linesKey: 'tutorial.star.row4.lines',
    fill: [
      { row: 3, col: 1 },
      { row: 3, col: 3 },
    ],
  },
  {
    /*
     * 收尾与 heart 同款：撤掉高亮，整张盘交还，卡片上只报「还差几格」。
     * 剩下的四格——第 1 行的 1 和第 3 行的 3——两头都已经是叉，
     * 正好拿刚学的叉子自己推一次；涂完即通关，教学随揭晓退场。
     */
    id: 'star-finish',
    independent: true,
    titleKey: 'tutorial.row5.title',
    linesKey: 'tutorial.star.finish.lines',
    fill: [
      { row: 0, col: 2 },
      { row: 2, col: 1 },
      { row: 2, col: 2 },
      { row: 2, col: 3 },
    ],
  },
]

// ---------------------------------------------------------------------------
//  步骤判定函数（两套教学通用）
// ---------------------------------------------------------------------------

/** 这一步有没有需要玩家动手的事（涂或打叉）——没有就是只讲不做的页 */
export function isHandsOn(step: CoachStep): boolean {
  return step.fill.length > 0 || (step.mark?.length ?? 0) > 0
}

/** 这一步要玩家做的事是否都做完了；只讲不做的页永远为 false，靠点屏幕推进 */
export function isStepDone(step: CoachStep, board: Board): boolean {
  if (!isHandsOn(step)) return false
  const fillOk = step.fill.every(({ row, col }) => board[row][col] === 'filled')
  const markOk = !step.mark || step.mark.every(({ row, col }) => board[row][col] === 'marked')
  return fillOk && markOk
}

/** 还差几格。卡片上实时报数——玩家不用自己数，也知道这一步还没完 */
export function stepRemaining(step: CoachStep, board: Board): number {
  const fillLeft = step.fill.filter(({ row, col }) => board[row][col] !== 'filled').length
  const markLeft = step.mark?.filter(({ row, col }) => board[row][col] !== 'marked').length ?? 0
  return fillLeft + markLeft
}

/**
 * 这一格现在能不能落笔。
 *
 * 涂色只放行 fill 里列出的格子，打叉只放行 mark 里列出的格子。
 * 没列出来的一律不放行——教程不能让新手在自己指着的地方做出一步错的。
 */
export function stepAllows(
  step: CoachStep,
  row: number,
  col: number,
  intent: 'fill' | 'mark',
): boolean {
  if (step.independent) return true
  if (intent === 'fill') return step.fill.some((cell) => cell.row === row && cell.col === col)
  return step.mark?.some((cell) => cell.row === row && cell.col === col) ?? false
}

/**
 * 这一步在棋盘上点亮什么。直接复用实战提示那套画法（HintOverlay）：
 * 整行/列一层淡色、要涂的格子实心块、要认/打的叉空心框，外加一条从头滑到尾的
 * 引导——玩家日后按下提示看到的是同一套记号，教程里不另发明一种。
 */
export function stepView(step: CoachStep, token: number): HintView | null {
  if (step.independent) return null
  const markState = step.ghostMark ? ('ghostMark' as const) : ('marked' as const)
  const cells = [
    ...step.fill.map(({ row, col }) => ({ row, col, state: 'filled' as const })),
    ...(step.mark ?? []).map(({ row, col }) => ({ row, col, state: markState })),
    ...(step.point ?? []).map(({ row, col }) => ({ row, col, state: 'marked' as const })),
  ]
  const actionCells = [...step.fill, ...(step.mark ?? [])]
  const row =
    actionCells.length > 0 && actionCells.every((c) => c.row === actionCells[0].row)
      ? actionCells[0].row
      : null
  const col =
    row === null &&
    actionCells.length > 0 &&
    actionCells.every((c) => c.col === actionCells[0].col)
      ? actionCells[0].col
      : null
  if (row === null && col === null && cells.length === 0) return null
  return { token, row, col, cells, focus: null, ghost: ghostOf(step, row, col) }
}

/**
 * 那条滑过去的引导：一格宽的方块，从这一段的头停到尾。
 *
 * 它就是提示里的幽灵条，只是这里演的不是「最左最右两种摆法」，而是
 * **手指该怎么走**——第一次涂整行的人，看一眼就知道是按住拖过去，
 * 不必在文字里描述一个手势。单格的一步 travel 为 0，原地闪两下即「点这里」。
 */
function ghostOf(step: CoachStep, row: number | null, col: number | null): HintView['ghost'] {
  if (!step.ghost) return null
  if (row !== null) {
    const cols = step.fill.map((cell) => cell.col)
    return {
      orientation: 'row',
      index: row,
      run: 1,
      leftStart: Math.min(...cols),
      rightStart: Math.max(...cols),
    }
  }
  if (col !== null) {
    const rows = step.fill.map((cell) => cell.row)
    return {
      orientation: 'col',
      index: col,
      run: 1,
      leftStart: Math.min(...rows),
      rightStart: Math.max(...rows),
    }
  }
  return null
}
