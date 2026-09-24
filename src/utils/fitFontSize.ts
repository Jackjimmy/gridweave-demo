/**
 * 把一行不折行的文字收进给定宽度：从基准字号起按溢出比例递减，直到放得下。
 *
 * 每日挑战的状态卡与通关结算卡都要用（长名称在 320~360px 屏上放不下同一个坑），
 * 所以放在 utils 而不是任一组件目录下。
 *
 * 单独抽出来是因为这里有两个容易写错的点，值得用测试钉住：
 *   一次比例估算往往不够——字形步进不随字号严格线性变化，估完仍可能溢出；
 *   到达下界后必须停，否则循环不收敛（下界之下由调用方用 ellipsis 兜底）。
 *
 * measure(size) 返回该字号下文本的实际宽度；由调用方接到真实布局上。
 */
export function fitNameFontSize(
  measure: (size: number) => number,
  base: number,
  available: number,
  min: number,
  maxPasses = 8,
): number {
  if (!(base > 0) || !(available > 0)) return base
  let size = base
  for (let pass = 0; pass < maxPasses; pass++) {
    const width = measure(size)
    if (width <= available) break
    const next = Math.max(min, Math.floor((size * available) / width))
    if (next >= size) break
    size = next
  }
  return size
}

/**
 * 量宽度的两把尺子：**都要小数**。
 *
 * scrollWidth / clientWidth 返回的是取整后的整数，而浏览器裁字用的是小数。
 * 真机上「Stonehenge」撞的就是这半个像素：盒子 68.5px、文字 69.05px，两边
 * 都报 69，「装得下」于是成立——可它照样溢出，而 text-overflow 为了给省略号
 * 腾地方要一口吃掉两三个字母，屏幕上是「Stonehen…」。差半像素，看上去像少了
 * 三个字母；玩家看到的不是「字小了一号」，是「名字被砍了」。
 *
 * 所以盒子量 getBoundingClientRect（小数），文字量 Range（小数，且量的是文字
 * 自己的排版矩形，不受 text-overflow 那层**绘制**裁剪影响）。两把尺子同源，
 * 祖先上有缩放也一起缩放，比值不变。
 *
 * 量不到（jsdom 没有排版，Range 也给不出矩形）时退回整数那一路：结果不会比
 * 从前更差，测试里那套假盒子也照旧走得通。
 */
const measureRange =
  typeof document !== 'undefined' && typeof document.createRange === 'function'
    ? document.createRange()
    : null

function boxWidth(el: HTMLElement): number {
  const width = el.getBoundingClientRect().width
  return width > 0 ? width : el.clientWidth
}

function textWidth(el: HTMLElement): number {
  if (measureRange) {
    try {
      measureRange.selectNodeContents(el)
      const width = measureRange.getBoundingClientRect().width
      if (width > 0) return width
    } catch {
      // 拿不到就退回 scrollWidth，别为一次量不到把整趟收字号停掉
    }
  }
  return el.scrollWidth
}

/**
 * 把一批**可以折行、但行数封顶**的文字各自收进自己的盒子。
 *
 * 与 fitOneLine 是同一件事的另一个方向：那边盒子的宽度是硬的，这边盒子的
 * 高度是硬的（册页上的关卡名封顶两行，卡片高度是定死的）。判据因此从
 * 「宽出多少」换成「高出多少」——scrollHeight 给的是不受 line-clamp 裁剪的
 * 完整高度，clientHeight 是盒子实际能露出的那一截。
 *
 * 元素要先在 CSS 里写好行数封顶（-webkit-line-clamp）与 overflow: hidden，
 * 两者都在才有「高出多少」可量。
 *
 * 绝大多数名字两行绰绰有余；这一趟通常一条都不用改（先读完再写，见 fitOneLine）。
 */
export function fitWrappedLines(elements: Iterable<HTMLElement>, min: number): void {
  const all = [...elements]
  for (const el of all) {
    el.style.fontSize = ''
    // 上一轮兜底加的词内断行也要清掉：盒子变宽之后不该还钉着它
    el.style.overflowWrap = ''
  }

  const overflowing: { el: HTMLElement; base: number; width: number }[] = []
  for (const el of all) {
    // 宽度按小数量（见 boxWidth / textWidth）；高度按整数够用——那一路的
    // 粒度是一整行（13px），取整差的半像素翻不过一行去
    const width = boxWidth(el)
    if (width <= 0 || el.clientHeight <= 0) continue
    if (el.scrollHeight <= el.clientHeight && textWidth(el) <= width) continue
    const base = parseFloat(getComputedStyle(el).fontSize)
    if (!(base > 0)) continue
    overflowing.push({ el, base, width })
  }

  for (const { el, base, width } of overflowing) {
    const size = fitNameFontSize(
      (candidate) => {
        el.style.fontSize = candidate === base ? '' : `${candidate}px`
        /*
         * 两个方向都要看，取更挤的那一个：
         *
         *   高——行数超了（名字比封顶的行数还长）。盒子的高度也跟着字号缩，
         *       直接比 scrollHeight 与 clientHeight 会两边一起变、收敛不了，
         *       所以折算成「相当于多宽」再和宽度那一路比。
         *   宽——某一个长单词横着就放不下。断词字典不是每个 WebView 都有
         *       （实测这台上德语断得开、英语断不开），断不开时只能靠收字号，
         *       而那种情况只在宽度上露出来，高度看不见。
         */
        const byHeight = (el.scrollHeight / Math.max(1, el.clientHeight)) * width
        return Math.max(byHeight, textWidth(el))
      },
      base,
      width,
      min,
    )
    el.style.fontSize = size === base ? '' : `${size}px`
    /*
     * 收到下界仍然横着放不下：只剩一个长单词而断词字典又不在。
     * 这时才允许词内断——「Bacterio／phage」不好看，但比「Bacteriophag」
     * 少一个字母好：名字缺一截就认不出是什么了，而这正是这张卡唯一的信息。
     * 只有真的走到这一步才加，所以正常的名字一个都不受影响。
     */
    if (textWidth(el) > boxWidth(el)) el.style.overflowWrap = 'anywhere'
  }
}

/**
 * 把并排的几条文字一起收进它们所在的那一行，**并且收到同一个字号**。
 *
 * 结算卡底下那两枚按钮用它。它们从前是 flex-wrap: wrap：德语的
 * 「Zurück zur Auswahl」配上「Nächstes Kapitel」在 375px 上正好差一点，
 * 于是折成两行——卡片跟着长高一截，把刚揭晓的那幅画往上顶。
 *
 * 为什么不能各收各的（fitOneLine）：并排的两枚按钮字号不一样，比换行更刺眼。
 * 所以这里算的是一整行的账，最后一个字号发给所有人。
 *
 * 预算取「几条文字的盒子宽度之和」。行放不下时 flex 已经把每一枚按下去了，
 * 这个和正好等于「行宽 − 间距 − 各自的内边距与边框」，也就是留给文字的全部
 * 位置；文字总宽收进这个数，就等于整行按自然宽度排也放得下。
 *
 * 元素要先在 CSS 里写好 `white-space: nowrap` 与 `overflow: hidden`，
 * 且盒子上不要有横向 padding 或边框（按 border box 量，见 boxWidth）——
 * 把按钮的文字包一层 span，量那个 span。
 */
export function fitRowOneLine(elements: Iterable<HTMLElement>, min: number): void {
  const all = [...elements]
  if (all.length === 0) return
  // 先清上一轮的内联字号：行变宽（旋屏、换语言）之后字号要能重新涨回去
  for (const el of all) el.style.fontSize = ''

  let available = 0
  let required = 0
  for (const el of all) {
    available += boxWidth(el)
    required += textWidth(el)
  }
  // 还没排版（宽度为 0，jsdom 里一直如此）或本来就放得下：基准字号没错
  if (available <= 0 || required <= available) return

  const base = parseFloat(getComputedStyle(all[0]).fontSize)
  if (!(base > 0)) return

  const size = fitNameFontSize(
    (candidate) => {
      for (const el of all) el.style.fontSize = candidate === base ? '' : `${candidate}px`
      let width = 0
      for (const el of all) width += textWidth(el)
      return width
    },
    base,
    available,
    min,
  )
  for (const el of all) el.style.fontSize = size === base ? '' : `${size}px`
}

/**
 * 把一批「必须待在一行里」的文字各自收进自己的盒子。
 *
 * 起因是真机上的《居家日常》第 2 页：「理发店旋转灯柱」七个汉字在 10.5px 下正好
 * 比一格宽出一点，折成两行，把上面那行英文名顶得只剩半截。中文名不能省略号
 * （「理发店旋转灯…」认不出是什么），也不能折行（卡片高度是定的），所以收字号。
 *
 * 元素要先在 CSS 里写死 `white-space: nowrap` 与 `max-width: 100%`：不折行、
 * 宽度被盒子夹住，「文字比盒子宽」才成立，也才量得出「超出多少」。
 * 盒子上不要有横向 padding 或边框——这里按 border box 量（见 boxWidth）。
 *
 * **先一次读完谁溢出，再只对溢出的那几条写字号。** 一页 16 张卡，读一次写一次
 * 交替着来就是 16 次强制回流；绝大多数名字根本不溢出，一遍读完之后通常一条都不用改。
 */
export function fitOneLine(elements: Iterable<HTMLElement>, min: number): void {
  // 先把上一轮的内联字号全清掉：盒子变宽（旋屏、分屏）时字号要能重新涨回去。
  // 清空只是写属性，读布局在下一轮循环里一次做完。
  const all = [...elements]
  for (const el of all) el.style.fontSize = ''

  const overflowing: { el: HTMLElement; base: number; available: number }[] = []
  for (const el of all) {
    // 盒子与文字都按小数量：差半个像素就是差两三个字母（见 boxWidth / textWidth）
    const available = boxWidth(el)
    // 还没布局（宽度为 0，jsdom 里一直如此）时什么都别做，基准字号本来也没错
    if (available <= 0 || textWidth(el) <= available) continue
    const base = parseFloat(getComputedStyle(el).fontSize)
    if (!(base > 0)) continue
    overflowing.push({ el, base, available })
  }

  for (const { el, base, available } of overflowing) {
    const size = fitNameFontSize(
      (candidate) => {
        el.style.fontSize = candidate === base ? '' : `${candidate}px`
        return textWidth(el)
      },
      base,
      available,
      min,
    )
    el.style.fontSize = size === base ? '' : `${size}px`
  }
}
