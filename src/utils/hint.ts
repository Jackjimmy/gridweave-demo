import type { Board, CellState, Clue, Clues } from '../types'
import { getColumn, lineToRuns } from './clues'
import { t } from '../i18n'

/**
 * 提示引擎：在当前盘面上找出「下一条能继续推理的线」，并说出**真实的**理由。
 *
 * 两条底线，改这个文件之前先读：
 *
 * 1. **解释必须为真。** 提示不是「拿 solver 的结论倒推一段听着像样的话」。
 *    每一条提示只高亮它所讲的那一手真正推出来的格子，讲重叠就必须是当前盘面下
 *    最左、最右两种**可行**摆法仍然交叠——不是假想一条空线算出来的重叠
 *    （那会把幽灵条画到叉上去，玩家照着看只会更糊涂）。
 *
 * 2. **按人挑，不按 solver 的遍历顺序挑。** 同一个盘面上常有十几条线能推，
 *    solver 的先行后列是实现细节，不是玩家的视线顺序。挑的标准是
 *    「玩家此刻缺的最小一条逻辑信息」，见 scoreOf。
 *
 * 结论的正确性仍与关卡校验同源：这里枚举的可行摆法与 solver.solveLine 是同一套
 * 约束（hint.test.ts 里用 solveLine 逐格对过），所以提示指出来的推理，
 * 玩家自己一定推得出来。
 */

/** 推理手法。每一种都对应一句能独立成立的话，以及那句话真正推出来的那几格。 */
export type HintTechnique =
  /** 线索加起来正好占满整条线，一格盘面都不用看 */
  | 'full-line'
  /** 某一段只有一处放得下（常见于一头被叉堵住），可以直接填完 */
  | 'run-anchored'
  /** 某一段最左与最右两种可行摆法仍然交叠，交叠那截必填 */
  | 'overlap'
  /** 线索已经全部找齐，剩下的格子都是空的 */
  | 'clue-satisfied'
  /** 某一段已经填满，两头必然是空 */
  | 'cap-blank'
  /** 一段空隙塞不下任何线索，整段排除 */
  | 'gap-too-small'
  /** 上面都不是，但整条线已经只剩一种摆法 */
  | 'line-fixed'
  /** 兜底：这条线能推出新格子，但讲不出更具体的手法 */
  | 'general'
  /** 盘面与答案冲突，先纠错再谈推理 */
  | 'mistake'

/** 线内某一格的推理结论 */
export interface HintCell {
  /** 线内下标（行提示即列号，列提示即行号） */
  at: number
  state: 'filled' | 'marked'
}

/**
 * 重叠法的演示数据：这一段**当前可行**的最左、最右两种摆法，以及必然交叠的那一截。
 * 界面据此让幽灵条从最左滑到最右。两个起点都必须是真摆得下的位置，
 * 否则动画会盖在叉上，等于当着玩家的面撒谎。
 *
 * 中间那些过渡帧同样安全，不必另做检查：能给出这份数据的前提是
 * rightStart < leftStart + run（否则两种摆法不交叠，压根不是重叠法），
 * 于是幽灵条扫过的整段 [leftStart, rightStart + run) 恰好等于左右两种摆法
 * 覆盖范围的并集——每一格都至少被一种可行摆法盖过，不可能是叉。
 */
export interface OverlapDemo {
  clueIndex: number
  run: number
  leftStart: number
  rightStart: number
  /** 交叠区间，闭区间 */
  from: number
  to: number
}

export interface Hint {
  orientation: 'row' | 'col'
  index: number
  technique: HintTechnique
  /** 这条提示所讲的那一手真正推出来的格子；mistake 时为空 */
  cells: HintCell[]
  /** 第二次追问时锁定的那一格（线内下标），优先给可涂的方块 */
  focus: number
  message: string
  overlap?: OverlapDemo
  /** 挑选时用的难度分，越小越先给（见 scoreOf）；调试与测试用 */
  score: number
}

/** 「这一行 / 这一列」。提示文案里到处要拼它，取一次当参数递进去 */
function lineName(orientation: 'row' | 'col'): string {
  return t(orientation === 'row' ? 'hint.row' : 'hint.col')
}

/** 空线索 [0] 视作没有段 */
function runsOf(clue: Clue): number[] {
  return clue.length === 1 && clue[0] === 0 ? [] : clue
}

/** 一条线在当前盘面下的全部可行摆法，压缩成每段的起点范围与每格的可能取值 */
export interface LinePlacements {
  /** 每段可行起点的最小 / 最大值；两者相等即这一段的位置已经定死 */
  minStart: number[]
  maxStart: number[]
  /** 每格在全部可行摆法中能否被填 / 能否为空 */
  canFill: boolean[]
  canBlank: boolean[]
}

/**
 * 枚举当前盘面下所有与线索相容的摆法。
 *
 * 与 solver.solveLine 同一套剪枝，多记一样东西：**每一段的起点范围**。
 * solveLine 只回答「哪些格能定」，而提示还要回答「为什么能定」——
 * 一段的最左最右摆法各在哪，是重叠法与「只有一处放得下」这两句话的全部依据。
 * 这个信息 solveLine 的返回值里没有，也不适合硬塞进去（求解器不该为讲解付代价）。
 *
 * 无相容摆法时返回 null（盘面与线索矛盾）。
 */
export function analysePlacements(line: CellState[], clue: Clue): LinePlacements | null {
  const n = line.length
  const runs = runsOf(clue)

  const canFill = new Array<boolean>(n).fill(false)
  const canBlank = new Array<boolean>(n).fill(false)
  const minStart = new Array<number>(runs.length).fill(Number.POSITIVE_INFINITY)
  const maxStart = new Array<number>(runs.length).fill(-1)
  const starts = new Array<number>(runs.length).fill(0)
  const placement = new Array<boolean>(n).fill(false)
  let found = false

  // suffixNeeded[i]：摆下第 i 段及之后全部段所需的最小格数（段间含 1 空格）
  const suffixNeeded = new Array<number>(runs.length + 1)
  suffixNeeded[runs.length] = 0
  for (let i = runs.length - 1; i >= 0; i--) {
    suffixNeeded[i] = runs[i] + (i < runs.length - 1 ? 1 : 0) + suffixNeeded[i + 1]
  }

  const cellCanBlank = (i: number) => line[i] !== 'filled'
  const cellCanFill = (i: number) => line[i] !== 'marked'

  const record = () => {
    found = true
    for (let i = 0; i < n; i++) {
      if (placement[i]) canFill[i] = true
      else canBlank[i] = true
    }
    for (let i = 0; i < runs.length; i++) {
      if (starts[i] < minStart[i]) minStart[i] = starts[i]
      if (starts[i] > maxStart[i]) maxStart[i] = starts[i]
    }
  }

  const recurse = (pos: number, runIdx: number): void => {
    if (runIdx === runs.length) {
      for (let i = pos; i < n; i++) {
        if (!cellCanBlank(i)) return
      }
      record()
      return
    }
    const len = runs[runIdx]
    for (let s = pos; s + suffixNeeded[runIdx] <= n; s++) {
      let fits = true
      for (let i = s; i < s + len; i++) {
        if (!cellCanFill(i)) {
          fits = false
          break
        }
      }
      const end = s + len
      // 非末段后必须留 1 个空格作分隔
      if (fits && runIdx < runs.length - 1 && !cellCanBlank(end)) fits = false
      if (fits) {
        starts[runIdx] = s
        for (let i = s; i < end; i++) placement[i] = true
        recurse(runIdx < runs.length - 1 ? end + 1 : end, runIdx + 1)
        for (let i = s; i < end; i++) placement[i] = false
      }
      // 段起点右移意味着格 s 留空；s 必须可为空白才能继续右移
      if (!cellCanBlank(s)) break
    }
  }

  recurse(0, 0)
  return found ? { minStart, maxStart, canFill, canBlank } : null
}

interface Candidate {
  technique: HintTechnique
  cells: HintCell[]
  /** 这一手讲的是哪一段线索（run-anchored / cap-blank / 单段 full-line 用它报数字） */
  run?: number
  overlap?: OverlapDemo
  score: number
}

/*
 * 难度分：**玩家看懂这一步要花多少力气**，不是 solver 走到它花了多少步。
 *
 * 三项相加，越小越先给：
 *
 *   手法本身的门槛（TECHNIQUE_COST）——「线索正好占满」谁都会，「空隙塞不下」
 *     要先在心里试摆一遍。
 *
 *   还要同时盯着几个数字（SEGMENT_COST）——这一项权重最大，也最反 solver 直觉：
 *     一条 [9] 的线比一条 [5,3] 的线好懂得多，哪怕后者能一次推出更多格。
 *     单个大数字只要求玩家在心里挪一个块；两个数字要同时挪两个、还要顾着中间
 *     那格分隔。已经填满并定位的段不算数——它已经不占脑子了。
 *     「正好占满」的线例外（FULL_LINE_SEGMENT_COST）：什么都不用挪。
 *
 *   重叠法还要看这一段能滑多远（OVERLAP_SLACK_COST）——[4] 填 5 格几乎就是
 *     占满，[7] 填 10 格才真要想。新手看到一大段「重叠」的解释会直接关掉，
 *     所以凡是接近占满的先给，真正的重叠往后排。
 *
 *   能不能涂（MARK_ONLY_PENALTY）——只能打叉的一步既难看出来，也没有获得感。
 *     图1 那种局面（6 格的位置已被叉钉死，同时左端还有个格子能排除）必须给
 *     「填完这 6 格」，而不是「先把那个叉打上」。
 *
 * 再减去收益（推出的格子数，封顶 PAYOFF_CAP），同档之内多推几格的更值。
 */
const TECHNIQUE_COST: Record<HintTechnique, number> = {
  'full-line': 0,
  'run-anchored': 8,
  // 重叠法的门槛不是常数，还要加上这一段能滑多远（见 OVERLAP_SLACK_COST）
  overlap: 12,
  'clue-satisfied': 12,
  'cap-blank': 16,
  'gap-too-small': 22,
  'line-fixed': 24,
  general: 30,
  // 纠错不参与打分：它一出现就抢在所有推理前面
  mistake: -1,
}
const SEGMENT_COST = 9
/*
 * 「正好占满」的线多几个数字也不怎么难：不用在心里挪任何一块，照着数字从头
 * 写到尾就是了。[2,2] 填 5 格、[1,1,1] 填 5 格，新手一眼就认得出来，
 * 不该因为数字多就排到一条要滑来滑去的重叠后面。
 */
const FULL_LINE_SEGMENT_COST = 3
/*
 * 重叠法的难度随「这一段能滑多远」涨：[4] 填 5 格只能挪一格，中间三格显然
 * 跑不掉；[7] 填 10 格要在心里推来推去三格才看得出重叠。同样是重叠法，
 * 前者接近「正好占满」，后者才是真要人想一想的那一档。
 */
const OVERLAP_SLACK_COST = 2
const MARK_ONLY_PENALTY = 8
const PAYOFF_CAP = 8

function scoreOf(
  technique: HintTechnique,
  cells: HintCell[],
  activeSegments: number,
  slack = 0,
): number {
  const payoff = Math.min(cells.length, PAYOFF_CAP)
  const marksOnly = cells.every((cell) => cell.state === 'marked')
  const segmentCost = technique === 'full-line' ? FULL_LINE_SEGMENT_COST : SEGMENT_COST
  return (
    TECHNIQUE_COST[technique] +
    segmentCost * Math.max(activeSegments - 1, 0) +
    (technique === 'overlap' ? OVERLAP_SLACK_COST * slack : 0) +
    (marksOnly ? MARK_ONLY_PENALTY : 0) -
    payoff
  )
}

function sameRuns(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

/** 下标 i 所在的「非叉连续段」范围——空隙塞不塞得下一段线索看的就是它 */
function gapAround(line: CellState[], i: number): { start: number; end: number } {
  let start = i
  while (start > 0 && line[start - 1] !== 'marked') start--
  let end = i
  while (end < line.length - 1 && line[end + 1] !== 'marked') end++
  return { start, end }
}

/**
 * 一条线现在能推什么、该怎么讲。返回这条线上**最好懂的那一手**。
 *
 * 返回 null：推不出新格子，或盘面与线索矛盾（矛盾交给 findMistake，
 * 它拿答案说话，比「某条线无解」准得多）。
 */
export function analyseLine(line: CellState[], clue: Clue): Candidate | null {
  const placements = analysePlacements(line, clue)
  if (!placements) return null

  const { minStart, maxStart, canFill, canBlank } = placements
  const n = line.length
  const runs = runsOf(clue)

  /** 这条线上全部能定下来的新格子 */
  const determined: HintCell[] = []
  for (let i = 0; i < n; i++) {
    if (line[i] !== 'empty') continue
    if (canFill[i] && !canBlank[i]) determined.push({ at: i, state: 'filled' })
    else if (canBlank[i] && !canFill[i]) determined.push({ at: i, state: 'marked' })
  }
  if (determined.length === 0) return null

  const fixed = (i: number) => minStart[i] === maxStart[i]
  const runFilled = (i: number) => {
    if (!fixed(i)) return false
    for (let c = minStart[i]; c < minStart[i] + runs[i]; c++) {
      if (line[c] !== 'filled') return false
    }
    return true
  }
  // 还要占脑子的段：位置没定死，或者定死了但还没填完
  const activeSegments = runs.reduce((count, _run, i) => count + (runFilled(i) ? 0 : 1), 0)

  const candidates: Candidate[] = []
  const add = (
    technique: HintTechnique,
    cells: HintCell[],
    extra?: { run?: number; overlap?: OverlapDemo },
  ) => {
    if (cells.length === 0) return
    const slack = extra?.overlap ? extra.overlap.rightStart - extra.overlap.leftStart : 0
    candidates.push({
      technique,
      cells,
      ...extra,
      score: scoreOf(technique, cells, activeSegments, slack),
    })
  }

  // 线索正好占满整条线：不看盘面就成立，最好讲。只有一个数字时文案报那个数
  const needed = runs.reduce((sum, run) => sum + run, 0) + Math.max(runs.length - 1, 0)
  if (runs.length > 0 && needed === n) {
    add('full-line', determined, runs.length === 1 ? { run: runs[0] } : undefined)
  }

  for (let i = 0; i < runs.length; i++) {
    if (fixed(i)) {
      // 这一段只有一处放得下：把它没填的那几格填完
      const cells: HintCell[] = []
      for (let c = minStart[i]; c < minStart[i] + runs[i]; c++) {
        if (line[c] === 'empty') cells.push({ at: c, state: 'filled' })
      }
      if (cells.length > 0) {
        add('run-anchored', cells, { run: runs[i] })
      } else {
        // 已经填满了，那就讲两头封口
        const caps: HintCell[] = []
        const before = minStart[i] - 1
        const after = minStart[i] + runs[i]
        if (before >= 0 && line[before] === 'empty') caps.push({ at: before, state: 'marked' })
        if (after < n && line[after] === 'empty') caps.push({ at: after, state: 'marked' })
        add('cap-blank', caps, { run: runs[i] })
      }
      continue
    }
    // 最左与最右两种可行摆法的交叠段
    const from = maxStart[i]
    const to = minStart[i] + runs[i] - 1
    if (from > to) continue
    const cells: HintCell[] = []
    for (let c = from; c <= to; c++) {
      if (line[c] === 'empty') cells.push({ at: c, state: 'filled' })
    }
    add('overlap', cells, {
      run: runs[i],
      overlap: {
        clueIndex: i,
        run: runs[i],
        leftStart: minStart[i],
        rightStart: maxStart[i],
        from,
        to,
      },
    })
  }

  // 线索已经全部找齐，其余格子只能是空
  if (sameRuns(lineToRuns(line), clue)) {
    add(
      'clue-satisfied',
      determined.filter((cell) => cell.state === 'marked'),
    )
  }

  // 塞不下任何线索的空隙：整段排除
  const shortest = runs.length > 0 ? Math.min(...runs) : 0
  if (shortest > 0) {
    const seen = new Set<number>()
    for (const cell of determined) {
      if (cell.state !== 'marked' || seen.has(cell.at)) continue
      const gap = gapAround(line, cell.at)
      for (let c = gap.start; c <= gap.end; c++) seen.add(c)
      if (gap.end - gap.start + 1 >= shortest) continue
      // 空隙里已经有方块就不是「塞不下」，那是别的推理
      let hasFilled = false
      for (let c = gap.start; c <= gap.end; c++) if (line[c] === 'filled') hasFilled = true
      if (hasFilled) continue
      const cells: HintCell[] = []
      for (let c = gap.start; c <= gap.end; c++) {
        if (line[c] === 'empty') cells.push({ at: c, state: 'marked' })
      }
      add('gap-too-small', cells)
    }
  }

  // 兜底：整条线已经只剩一种摆法 / 讲不出更具体的手法
  const unknown = line.reduce((count, cell) => count + (cell === 'empty' ? 1 : 0), 0)
  if (determined.length === unknown) add('line-fixed', determined)
  add('general', determined)

  candidates.sort((a, b) => a.score - b.score || a.cells[0].at - b.cells[0].at)
  return candidates[0]
}

/** 提示文案。不带行号：高亮已经指明是哪一条了。 */
function messageFor(orientation: 'row' | 'col', candidate: Candidate): string {
  const line = lineName(orientation)
  switch (candidate.technique) {
    case 'full-line':
      return candidate.run !== undefined
        ? t('hint.fullLineSingle', { line, run: candidate.run })
        : t('hint.fullLine', { line })
    case 'run-anchored':
      return t('hint.runAnchored', { line, run: candidate.run ?? '' })
    case 'overlap':
      return t('hint.overlap', { line, run: candidate.overlap?.run ?? '' })
    case 'clue-satisfied':
      return t('hint.clueSatisfied', { line })
    case 'cap-blank':
      return t('hint.capBlank', { line, run: candidate.run ?? '' })
    case 'gap-too-small':
      return t('hint.gapTooSmall', { line })
    case 'line-fixed':
      return t('hint.lineFixed', { line })
    case 'general':
      return t('hint.general', { line })
    case 'mistake':
      return t('hint.mistake', { line })
  }
}

/** 优先给可涂的方块；重叠法给交叠区正中那一格，讲得最清楚 */
function focusOf(candidate: Candidate): number {
  const { overlap, cells } = candidate
  if (overlap) {
    const middle = Math.floor((overlap.from + overlap.to) / 2)
    if (cells.some((cell) => cell.at === middle && cell.state === 'filled')) return middle
  }
  const filled = cells.find((cell) => cell.state === 'filled')
  return (filled ?? cells[0]).at
}

/**
 * 盘面上第一处与答案冲突的格子。
 *
 * 拿答案比对，而不是等某条线推出矛盾：涂错一格常常要过好几步才会撞上矛盾，
 * 而在撞上之前，从错误前提推出来的提示会把玩家带得更远。
 */
export function findMistake(
  board: Board,
  solution: number[][],
): { row: number; col: number } | null {
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[r].length; c++) {
      const shouldFill = solution[r][c] === 1
      if (board[r][c] === 'filled' && !shouldFill) return { row: r, col: c }
      if (board[r][c] === 'marked' && shouldFill) return { row: r, col: c }
    }
  }
  return null
}

/** 一条候选整理成提示：文案与聚焦格都在这里定，找线与按脚本走的都走它。 */
function toHint(orientation: 'row' | 'col', index: number, candidate: Candidate): Hint {
  return {
    orientation,
    index,
    technique: candidate.technique,
    cells: candidate.cells,
    focus: focusOf(candidate),
    message: messageFor(orientation, candidate),
    overlap: candidate.overlap,
    score: candidate.score,
  }
}

/**
 * 当前盘面的下一条提示。没有可给的提示时返回 null（已解出，或超出单线推理）。
 *
 * 行列一视同仁地打分再挑，**不按先行后列的顺序**——那是 solver 的遍历顺序，
 * 不是玩家的视线顺序。分数相同才按行优先、下标从小到大定序，图个稳定。
 */
export function findHint(board: Board, clues: Clues, solution: number[][]): Hint | null {
  const mistake = findMistake(board, solution)
  if (mistake) {
    const candidate: Candidate = { technique: 'mistake', cells: [], score: -1 }
    return {
      orientation: 'row',
      index: mistake.row,
      technique: 'mistake',
      cells: [],
      focus: mistake.col,
      message: messageFor('row', candidate),
      score: -1,
    }
  }

  let best: Hint | null = null

  const consider = (orientation: 'row' | 'col', index: number, line: CellState[], clue: Clue) => {
    const candidate = analyseLine(line, clue)
    if (!candidate) return
    if (best && candidate.score >= best.score) return
    best = toHint(orientation, index, candidate)
  }

  for (let r = 0; r < board.length; r++) consider('row', r, board[r], clues.rows[r])
  for (let c = 0; c < board.length; c++) consider('col', c, getColumn(board, c), clues.cols[c])

  return best
}

/**
 * 第二次追问时的说法。到这一步话就说到底：那一格是涂还是空，直接讲明白——
 * 玩家已经问了两次，再打哑谜就是耍他。
 *
 * 措辞上有个坑，别再踩回去：第二次叠上来的那条轴**只是准星，不是论据**。
 * 那一格是靠第一条线推出来的，另一条轴只负责把它指到具体位置。所以不能说
 * 「连这一列一起看，就能定下这一格」——那是把一句假话说得很顺口。
 *
 * 说到这里为止。第三次仍然不替他落子：提示的上限是把视线放到该看的地方。
 */
export function hintCrossMessage(hint: Hint): string {
  if (hint.technique === 'mistake') return t('hint.crossMistake')
  const state = hint.cells.find((cell) => cell.at === hint.focus)?.state
  return state === 'marked' ? t('hint.crossMarked') : t('hint.crossFill')
}

/** 提示指向的那一格在盘面上的坐标 */
export function hintFocusCell(hint: Hint): { row: number; col: number } {
  return hint.orientation === 'row'
    ? { row: hint.index, col: hint.focus }
    : { row: hint.focus, col: hint.index }
}
