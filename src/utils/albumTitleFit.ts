/**
 * 首页四宫格里书名的定字号。
 *
 * 一本书的封面上只有那么宽的地方（那一块的边界见 .album 的 --album-face-*），
 * 而同一个书名在九种语言里长短差三倍：「小さな旅」四个字，到了西语是
 * 「Máquinas y herramientas」。谁来让步，两种书写系统的答案不一样，所以这里
 * 也分成两条路走：
 *
 *   中日韩：一本书一个字号，**只排一行**。这些名字最长八个字，一行是它们
 *     本来的样子；八个字的那一本把字号收一档，比折成「祝祭とおと／ぎ話」
 *     强得多——后者把一个词从中间劈开，还要多占一行的高度。
 *
 *   拉丁语系：**所有画册共用一个字号**，固定两行。这些名字大多本来就是两行
 *     （「Fiestas y／fábulas」），一本一本地缩会让同一张卡上四本书的字大小
 *     不一，看着像四张不同的模板。所以先找出「每一本都能在两行之内装下」的
 *     最大字号，再一次性发给所有人。
 *
 * 两条路都以「一个字都不许截」为硬条件：书名那一格没有省略号可用（见
 * .albumName），装不下就缩字号。缩到下限还装不下，就整页多让一行——
 * 中日韩从一行退到两行，拉丁从两行退到三行。320×568 那种封面只有 46px 宽的
 * 机器上两边都会走到：八个片假名一行要 7px、「Máquinas y herramientas」两行
 * 要 7.5px，那已经不是字号小，是没法看了。宁可多占一行，也不许截半个字。
 *
 * 行数是**整页一个值**，不按本给：书名那一格的高度全页共用，只让一本变高，
 * 同一排书的进度杠就不齐了。
 */

/** 量出来的字号按 0.25px 取整：再细就是给同一行字挑不同的舍入方向 */
const QUANTUM = 4

/** 中日韩单行的字号下限。低于它就该整页退回两行，而不是继续缩 */
const CJK_FLOOR = 10

/**
 * 拉丁的字号下限。低于它就该整页多让一行，而不是继续缩。
 *
 * 9 是量出来的：320×568 上封面脸只有 58px，「Máquinas y herramientas」两行
 * 要 7.5px 才装得下——那已经比进度条上的数字还小。到这一档就该添一行了。
 */
const LATIN_FLOOR = 9

/** 与 .albumNameText 的 line-height 同一个数，两处都改才算改 */
const LEADING = 1.18

/** 二分的轮数：11 到 16 之间按 0.25 取整一共 21 档，5 轮够走完 */
const PROBES = 5

/** 按比例算出来的字号可能差一两个舍入，落定前最多再往下让这么多档 */
const NUDGES = 4

/**
 * 这一页的书名占几行，量完之后写在页面根上（data-title-lines="1" … "3"）。
 * CSS 那边据此定 --album-title-lines 与 white-space，见 LevelSelect.module.css
 * 里同名的那一段。
 *
 * 一页一个值，不按本给：一格的高度全页共用，只让一本变高，同一排书的进度杠
 * 就不齐了。
 */
const LINES_ATTR = 'titleLines'

/** 中日韩先按一行排，装不下才两行；拉丁先两行，装不下才三行 */
const CJK_LINES = [1, 2]
const LATIN_LINES = [2, 3]

interface Slot {
  /** 书名那一格：宽度由它定（封面脸的宽度，见 .albumName） */
  box: HTMLElement
  /** 格子里那段字：字号写在它身上，行数也量它 */
  text: HTMLElement
}

function quantize(size: number): number {
  return Math.floor(size * QUANTUM) / QUANTUM
}

function collect(root: HTMLElement): Slot[] {
  const slots: Slot[] = []
  for (const box of root.querySelectorAll<HTMLElement>('[data-album-name]')) {
    const text = box.firstElementChild
    if (text instanceof HTMLElement) slots.push({ box, text })
  }
  return slots
}

/** 这个字号下这段字排成几行：块盒自己的高度除以行高，父级的裁切影响不到它 */
function linesAt({ text }: Slot, size: number): number {
  text.style.fontSize = `${size}px`
  return Math.round(text.getBoundingClientRect().height / (size * LEADING))
}

/** 这个字号下这段字有没有超出格子的宽度（单行那条路上量的是这个） */
function tooWide({ box, text }: Slot): boolean {
  return text.scrollWidth > box.clientWidth
}

/**
 * 一行装下这段字**所需**的字号。单行的宽度与字号成正比，所以一次除法就是
 * 答案，不必去试。返回值可能低到没法看，由调用方拿它和下限比。
 */
function oneLineNeed(slot: Slot, base: number): number {
  slot.text.style.fontSize = ''
  if (!tooWide(slot)) return base
  const available = slot.box.clientWidth
  const needed = slot.text.scrollWidth
  if (!(needed > 0) || !(available > 0)) return base
  return quantize((base * available) / needed)
}

/**
 * 把算出来的字号落到 DOM 上，并**验一遍**：按比例算出来的那个数是拿两个已经
 * 取整过的宽度算的，偶尔会差一两个舍入（量到过 2px 的溢出）。装不下就再往下
 * 让一档，让到下限为止——判据是量出来的，不是算出来的。
 */
function settle(slot: Slot, wanted: number, floor: number, lines: number): void {
  let size = Math.max(floor, wanted)
  for (let nudge = 0; nudge < NUDGES; nudge++) {
    slot.text.style.fontSize = `${size}px`
    const ok = lines === 1 ? !tooWide(slot) : linesAt(slot, size) <= lines
    if (ok || size <= floor) {
      slot.text.style.fontSize = `${size}px`
      return
    }
    size = Math.max(floor, size - 1 / QUANTUM)
  }
}

/** 这段字在 lines 行之内装得下的最大字号；二分，下限兜底 */
function maxSizeWithin(slot: Slot, base: number, lines: number, floor: number): number {
  if (linesAt(slot, base) <= lines) {
    slot.text.style.fontSize = ''
    return base
  }
  let low = floor
  let high = quantize(base)
  for (let probe = 0; probe < PROBES && high - low > 1 / QUANTUM; probe++) {
    const middle = quantize((low + high) / 2)
    if (middle <= low || middle >= high) break
    if (linesAt(slot, middle) <= lines) low = middle
    else high = middle
  }
  slot.text.style.fontSize = ''
  return low
}

/**
 * 定字号，并把结果写回 DOM：
 *
 *   中日韩逐本写在 .albumNameText 的行内样式上（一本一个值）；
 *   拉丁写成 root 上的 --album-title-fit（一个值发给所有人）。
 *
 * 每次都先把上一轮的结果撤干净再量：量的必须是 CSS 里那个基准字号下的自然
 * 宽度，拿「已经缩过一次」的尺寸再缩一次，字会一轮比一轮小。
 */
export function fitAlbumTitles(root: HTMLElement, cjk: boolean): void {
  const slots = collect(root)
  delete root.dataset[LINES_ATTR]
  root.style.removeProperty('--album-title-fit')
  for (const { text } of slots) text.style.fontSize = ''
  if (slots.length === 0) return

  // 基准字号写在 .album 上，一页十六本是同一个值（矮屏那一档整体退一级）
  const base = parseFloat(getComputedStyle(slots[0].text).fontSize)
  if (!(base > 0)) return

  const [wanted, spare] = cjk ? CJK_LINES : LATIN_LINES
  const floor = cjk ? CJK_FLOOR : LATIN_FLOOR
  /*
   * 先按想要的行数排：够用就用，不够就整页多让一行。判据是「共用字号会不会
   * 掉到下限以下」——掉下去了，说明再缩已经不是排版而是把字磨没。
   */
  let lines = wanted
  if (fittedSize(root, slots, base, wanted, floor, cjk) <= floor) lines = spare
  root.dataset[LINES_ATTR] = String(lines)

  if (cjk) {
    // 中日韩一本一个字号：短名字保持原大，只有长的那几本退档
    for (const slot of slots) {
      const size =
        lines === 1 ? oneLineNeed(slot, base) : maxSizeWithin(slot, base, lines, floor)
      if (size < base) settle(slot, size, floor, lines)
      else slot.text.style.fontSize = ''
    }
    return
  }

  // 拉丁十六本共用一个字号，由最挤的那一本定
  const size = fittedSize(root, slots, base, lines, floor, cjk)
  for (const { text } of slots) text.style.fontSize = ''
  if (size < base) root.style.setProperty('--album-title-fit', `${size}px`)
}

/**
 * 这一页在 lines 行之内能用的最大字号。
 *
 * 中日韩取「最挤的那一本自己需要的字号」——它只是用来判断要不要多让一行，
 * 真正发下去的字号是一本一个（见上面）。拉丁取的就是发给所有人的那个值。
 *
 * 量之前先把行数写上去：CSS 那边据它定 white-space，一行与多行的量法不一样。
 */
function fittedSize(
  root: HTMLElement,
  slots: Slot[],
  base: number,
  lines: number,
  floor: number,
  cjk: boolean,
): number {
  root.dataset[LINES_ATTR] = String(lines)
  let size = base
  for (const slot of slots) {
    const need =
      cjk && lines === 1 ? oneLineNeed(slot, base) : maxSizeWithin(slot, base, lines, floor)
    if (need < size) size = need
  }
  for (const { text } of slots) text.style.fontSize = ''
  return size
}

/** 书写系统的判据与 CSS 里那条 :lang() 同一口径（见 .albumName 那一段） */
export function isCjkLocale(locale: string): boolean {
  return /^(zh|ja|ko)/.test(locale)
}
