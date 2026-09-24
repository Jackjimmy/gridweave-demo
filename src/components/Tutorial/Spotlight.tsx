import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import type { CoachSpot } from './coachScript'
import styles from './Spotlight.module.css'

/** 亮区四周多留这么一圈，免得被指着的东西被压暗的边啃掉一角 */
const SPOT_PAD = 7

/** 缺省的空页表；写成模块级常量，免得每渲染一次就换一个身份、白跑一遍留白 */
const EMPTY_PAGES: readonly CoachPage[] = []

interface Box {
  top: number
  left: number
  right: number
  bottom: number
}

/** 两个框是不是同一块地方。半个像素以内当作没动过——量出来的数带小数 */
function same(a: Box | null, b: Box | null): boolean {
  if (a === null || b === null) return a === b
  return (
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.right - b.right) < 0.5 &&
    Math.abs(a.bottom - b.bottom) < 0.5
  )
}

function boxOf(element: Element | null): Box | null {
  if (!element) return null
  const rect = element.getBoundingClientRect()
  // jsdom（以及尚未布局完的首帧）量出来全是 0：宁可不画滤镜，也不能画个 0×0 的洞
  if (rect.width <= 0 || rect.height <= 0) return null
  return { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom }
}

/**
 * 这一步要把哪一块留在光里，按真实界面量。
 *
 * 全部从 DOM 现量，不照抄任何一份 CSS 常量：格子大小是随屏幕算出来的
 * （见 Game.module.css 那三档 data-size），按钮位置由布局给出，
 * 抄一份到这里迟早分岔，而分岔的表现是「圈歪了」。
 */
function measureSpot(root: HTMLElement, spot: CoachSpot | null): Box | null {
  if (!spot) return null
  if (spot.kind === 'element') return boxOf(root.querySelector(`[data-coach="${spot.target}"]`))
  const grid = root.querySelector<HTMLElement>('[role="grid"]')
  if (!grid) return null
  // 整张盘：连左边和上面的数字一起亮，它们是同一件事的两半
  return boxOf(grid.parentElement) ?? boxOf(grid)
}

/**
 * 卡片不许坐上去的那一块。
 *
 * 对局里是那张画（连线索）：不管这一页指的是盘还是某个按钮，画都是教学正在
 * 讲的东西本身。没有盘的页面（首页导览）就让开被指着的那一块——那一页要人
 * 看的就是它，卡片压在它身上等于把要看的东西盖住。
 */
function artOf(root: HTMLElement, spot: CoachSpot | null): HTMLElement | null {
  const grid = root.querySelector<HTMLElement>('[role="grid"]')
  if (grid) return grid.parentElement ?? grid
  if (spot?.kind === 'element') return root.querySelector<HTMLElement>(`[data-coach="${spot.target}"]`)
  return null
}

/**
 * 卡片摆哪一半：让开被指着的那一块。
 *
 * 要认的东西在下半屏（操作条那三块）就摆上面，否则摆下面。不压暗的几页
 * （轮到玩家动手）没有被指着的东西，一律摆上面——底下的操作条这时是能按的，
 * 卡片不能坐在它身上。
 *
 * 这只是「想摆哪一半」。真的摆得下摆不下，要连两边各剩多少空一起算（见 fit）。
 */
function placeOf(box: Box | null): 'top' | 'bottom' {
  if (!box) return 'top'
  return box.top - SPOT_PAD > window.innerHeight / 2 ? 'top' : 'bottom'
}

/** 一页卡片上的话。到这里已经是当前语言的成品 */
export interface CoachPage {
  title: string
  lines: readonly string[]
  /**
   * 这一页压暗时留在光里的那一块。量地方要用：卡片摆上面还是下面由它决定，
   * 而摆哪一半决定这一页占的是画上面的空还是下面的空。
   */
  spot?: CoachSpot | null
}

interface Props {
  /** 留在光里的那一块；null＝不压暗，只剩一张卡片 */
  spot: CoachSpot | null
  /** 量位置用的根节点：棋盘、数字、操作条都在里面 */
  rootRef: RefObject<HTMLElement | null>
  /** 卡片上的话。到这里已经是当前语言的成品，这一层不碰文案 */
  title: string
  lines: readonly string[]
  /**
   * 这一轮会翻到的每一页，含眼下这一页。用来把整轮的占地量成一个数：
   * 卡片因此不会随着「这一页两行、下一页一行」一步一跳（见下方 probeRoom）。
   * 不给就只按眼前这一页算——单页的场合本来也没有下一页。
   */
  pages?: readonly CoachPage[]
  ariaLabel: string
  /**
   * 卡片摆哪一半：'auto' 让开被指着的那一块。
   * 'center' 是整屏居中的大卡（首页导览的欢迎页）：不量、不让路，只按 CSS 站好。
   */
  place?: 'auto' | 'top' | 'bottom' | 'center'
  /** 卡片的变体样式：'welcome' 是欢迎页那张带底纹的大卡 */
  variant?: 'welcome'
  /** 铺在卡片底下的那幅淡淡的画（data URL）；只有欢迎卡用 */
  texture?: string | null
  /** 开场那一下：暗幕慢慢压下来，卡片随后升起 */
  intro?: boolean
  /** 整屏接管点按，点哪儿都是继续；不给就不拦，界面照常可按 */
  onTapThrough?: (() => void) | null
  /** 在亮区位置开个洞，让玩家真按到下面那个按钮 */
  holeInteractive?: boolean
  /** 换一页就重放卡片入场动画 */
  cardKey?: string
  /** 卡片底那一行怎么站：三件东西分居两端，还是只有一枚按钮靠右 */
  footAlign?: 'between' | 'end'
  /** 卡片底那一行（继续 / 跳过 / 进度点，各家自己摆） */
  children?: ReactNode
}

/** 这一轮的卡片在画的上下两侧各要占到哪儿 */
interface Room {
  /** 摆上面那一档的缺省落点（还没让路时的上沿），从克隆现量 */
  topAnchor: number
  /** 摆下面那一档的下沿，从克隆现量。这一档没有可让的余地，它就是硬边 */
  bottomAnchor: number
  /**
   * 摆上面的那几页里，卡片下沿最远要到哪儿——取要得最多的那一页：
   * 那一页的卡片下沿，加上它自己该留的那点余量（见 clearanceOf）。
   * 这一轮没有摆上面的页时为 null。
   */
  topNeed: number | null
  /** 摆下面的那几页里，最占地方的那一页要多高（含它该留的余量） */
  bottomNeed: number
  /** 最高的那一页有多高。只用来判断手上这张是不是超出了量过的范围 */
  tallest: number
  /**
   * 这张卡片再挤也挤不掉的那一截：话全掏空之后剩下的高。
   * 地方紧到连它都放不下时以它为准——话可以滚着读，「继续」不能没有。
   */
  floor: number
}

/**
 * 这一页的卡片离画要留出多少。
 *
 * 指着整张盘的那几页，画外面套着一圈亮区描边（SPOT_PAD 那一圈加 2px 的边），
 * 卡片压上去先啃掉的是那一圈，所以要连它一起让开。指着某个按钮的、以及
 * 不压暗的那几页，画身上没有那一圈，留一点看得出是两块东西的距离就够——
 * 多要的那几个像素在小屏幕上是要还的：法语第一关最高的那一页，多要 7px
 * 就正好压到最上面那行列数字上。
 */
function clearanceOf(spot: CoachSpot | null | undefined): number {
  return spot?.kind === 'board' ? SPOT_PAD + 8 : 8
}

/**
 * 把这一轮每一页都排一遍，量出卡片在画的上下各要占多少、两档的落点各在哪儿。
 *
 * 拿眼前这张卡片的克隆逐页换掉文案、逐页摆到它该在的那一半，量完就撤。
 * 高度只有真排一次才知道——同一句话在繁体中文里比简体多一个字，就可能多折一行；
 * 位置同理，'top' 与 'bottom' 两档的落点写在 Spotlight.module.css 里，
 * 量克隆比把那两个数抄进 JS 可靠：抄一份迟早分岔，而分岔的表现是卡片压到画上。
 * 克隆挂在真卡片的父节点下，宽度、字号、行高全部同源。
 *
 * 上下两档都要量。从前只记上面那一档，理由是「底下那截空当只会更宽」——
 * 横屏不成立：667×375 上画的下沿离屏底只剩四十来个像素，而它上面还空着一百三。
 * 两边都量出来，才谈得上「哪边放得下」。
 *
 * 插入到卸下之间没有一次绘制，屏幕上不会闪；代价是几次强制重排，
 * 而这件事整轮只做一次（见调用处）。
 */
function probeRoom(
  card: HTMLElement,
  root: HTMLElement,
  pages: readonly CoachPage[],
  forced: 'auto' | 'top' | 'bottom' | 'center',
  liveSpot: CoachSpot | null,
): Room | null {
  const parent = card.parentElement
  if (!parent) return null
  const ghost = card.cloneNode(true) as HTMLElement
  ghost.style.visibility = 'hidden'
  ghost.style.animation = 'none'
  ghost.setAttribute('aria-hidden', 'true')
  ghost.removeAttribute('aria-label')
  parent.appendChild(ghost)
  const title = ghost.querySelector<HTMLElement>(`.${styles.title}`)
  const body = ghost.querySelector<HTMLElement>(`.${styles.body}`)
  let topNeed: number | null = null
  let bottomNeed = 0
  let tallest = 0
  for (const page of pages) {
    if (title) title.textContent = page.title
    ghost.querySelectorAll(`.${styles.line}`).forEach((line) => line.remove())
    for (const text of page.lines) {
      const line = document.createElement('p')
      line.className = styles.line
      line.textContent = text
      body?.appendChild(line)
    }
    const place =
      forced === 'auto' || forced === 'center'
        ? placeOf(measureSpot(root, page.spot ?? null))
        : forced
    ghost.dataset.place = place
    const rect = ghost.getBoundingClientRect()
    tallest = Math.max(tallest, rect.height)
    if (place === 'top') {
      topNeed = Math.max(topNeed ?? -Infinity, rect.bottom + clearanceOf(page.spot))
    } else {
      bottomNeed = Math.max(bottomNeed, rect.height + clearanceOf(page.spot))
    }
  }
  /*
   * 眼前这张真卡片也算一页，但**只借它的高，不借它的位置**。
   *
   * 它未必在 pages 里：末页那条学习提示是临场换上去的，比脚本原文长。
   * 不把它算进来，量出来的 tallest 就可能永远低于手上这张，于是每一次
   * ResizeObserver 回调都判定「比量过的高」，整轮反复重量。
   *
   * 位置一律走克隆量出来的落点，不读它的 getBoundingClientRect：入场动画
   * （cardIn）正把它往下推 10px，而 rect 是含变换的。照着读，让位就会凭空
   * 多出这 10px——量得越早差得越多，德语的尺寸说明当场被顶出屏幕外
   * （卡片上沿 -2px，第一行字被切掉）。offsetHeight 不含变换，所以高可以照读；
   * 调用处会先把压扁卡片的那道上限撤掉，读到的是它的自然身量。
   */
  const height = card.offsetHeight
  tallest = Math.max(tallest, height)
  /*
   * 两档的落点各量一次，与页无关：'top' 那一档的上沿由 CSS 里那个 calc 决定
   * （调用处已把让位量清零），'bottom' 那一档的下沿由屏底和安全区决定。
   * 这一轮哪一档都没用上时也要有个数——「另一边还剩多少」得先有落点才算得出来。
   */
  ghost.dataset.place = 'top'
  const topAnchor = ghost.getBoundingClientRect().top
  ghost.dataset.place = 'bottom'
  const bottomAnchor = ghost.getBoundingClientRect().bottom
  if (card.dataset.place === 'bottom') {
    bottomNeed = Math.max(bottomNeed, height + clearanceOf(liveSpot))
  } else {
    topNeed = Math.max(topNeed ?? -Infinity, topAnchor + height + clearanceOf(liveSpot))
  }
  // 话全掏空，剩下的就是这张卡片的骨架：内边距加底下那行按钮
  if (title) title.textContent = ''
  ghost.querySelectorAll(`.${styles.line}`).forEach((line) => line.remove())
  const floor = ghost.getBoundingClientRect().height
  ghost.remove()
  return { topAnchor, bottomAnchor, topNeed, bottomNeed, tallest, floor }
}

/**
 * 摆上面的卡片该往上让开多少，才不坐到画上——**让的是卡片，画一动不动**。
 *
 * `artTop` 是画的上沿，`safeTop` 是这块屏幕上不该被占的那条边（刘海）。
 * 卡片可以一路让到贴着安全区，路上盖住顶栏也没关系：这几页压暗的正是那一带，
 * 本来就看不清，而顶栏装的是导航，不是这一课的内容；画却是这几页要教的东西
 * 本身，它一动，玩家第一眼看到的是「盘怎么跑了」。
 *
 * 让到贴边为止，中间不给自己留余地：这一档只在「再不让就要压到画上」时才用得着，
 * 那时候多留的那点客气全要由列数字来还。法语第一关最高的那一页正卡在这儿——
 * 留 8px 的余地，卡片就啃掉最上面那行数字两三个像素；一路让到底，反而正好让开。
 *
 * 让到底仍然差着一截时也就到此为止：**剩下的由卡片自己变矮来认**（见调用处的
 * 上限与 .body 的滚动），不是压到画上。从前差多少就压多少，德语在 320×480 上
 * 一压就是七十几个像素，连格子带线索一起没了。
 */
function fitCard(room: Room, topNeed: number | null, artTop: number, safeTop: number): number {
  if (topNeed === null) return 0
  return clamp(topNeed - artTop, 0, room.topAnchor - safeTop)
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), Math.max(low, high))
}

/**
 * 尺寸一变就可能把被指着的那一块推走的节点：它每一层祖先（到 root 为止）
 * 连同各层的兄弟，外加 root 自己。
 *
 * 位置不是一个能盯着量的属性。ResizeObserver 只报尺寸，而被指着的那一块
 * 尺寸一个像素不变、位置照样会挪：安卓上安全区那几个 CSS 变量是原生侧
 * 在页面挂好之后才注进来的（见 MainActivity.configureEdgeToEdgeInsets），
 * 注进来的那一刻整页内容往下让出状态栏那一截，WebView 本身却没有改尺寸，
 * 于是没有 resize 事件——首页导览赶在它前头挂上时，字标从洞里掉出去，
 * 洞停在状态栏底下。谁的尺寸变了会推它，就盯谁：祖先的内边距一变，祖先的
 * 内容盒就变（root 的高是定死的一屏）；前面的兄弟长高，它就往下走。
 */
function pushersOf(root: HTMLElement, art: HTMLElement | null): Element[] {
  const pushers = new Set<Element>([root])
  for (let node = art?.parentElement ?? null; node; node = node.parentElement) {
    pushers.add(node)
    for (const child of Array.from(node.children)) pushers.add(child)
    if (node === root) break
  }
  return Array.from(pushers)
}

/** 这块屏幕上不该被卡片占掉的那条上边（刘海）。页面的安全区内边距就是它，现量不抄 */
function safeTopOf(root: HTMLElement): number {
  return root.getBoundingClientRect().top + (parseFloat(getComputedStyle(root).paddingTop) || 0)
}

/**
 * 压暗四周、只留一块亮的，外加一张说话的卡片。
 *
 * 这一层只管「指哪一块、把话摆在没被用到的那一半」；说什么、底下摆什么按钮、
 * 何时翻页，全归调用方（见 TutorialCoach 与 SizeIntro）。
 */
export function Spotlight({
  spot,
  rootRef,
  title,
  lines,
  pages = EMPTY_PAGES,
  ariaLabel,
  place = 'auto',
  variant,
  texture = null,
  intro = false,
  onTapThrough,
  holeInteractive = false,
  cardKey,
  footAlign = 'between',
  children,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<Box | null>(null)
  /*
   * 量出来跟上一次一样就不写回去。
   *
   * 不是省一次渲染那么简单：这一层的量与写互为因果（写留白→布局变→再量），
   * 每次都换一个新对象，React 就永远判不出「没变过」，一路重渲染下去。
   * 挡在这里，上面那条环就只能转到不动点为止。
   */
  const measure = useCallback(() => {
    const root = rootRef.current
    const next = root ? measureSpot(root, spot) : null
    setBox((current) => (same(current, next) ? current : next))
    return next !== null
  }, [rootRef, spot])

  // 位置只在换步与改尺寸时量。对局中这些东西不动，涂格子不会让它们挪一个像素
  useLayoutEffect(() => {
    measure()
  }, [measure])
  /*
   * 同一件事再量一遍，这次在提交之后。
   *
   * 首帧的布局效果里量不到：React 先跑子树的布局效果，再把父节点的 ref 接上，
   * 而这一层量的正是父节点里的棋盘——进关卡即开讲撞的就是这一帧，少了这一手
   * 教学第一页整页没有压暗。补量放在 passive effect 里而不是 rAF 里：
   * 页面不在前台时 rAF 会被节流甚至完全不来，那时补量就永远不发生。
   */
  useEffect(() => {
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [measure])

  const hole = box && {
    top: box.top - SPOT_PAD,
    left: box.left - SPOT_PAD,
    width: box.right - box.left + SPOT_PAD * 2,
    height: box.bottom - box.top + SPOT_PAD * 2,
  }
  /*
   * 卡片不许坐到画上。让开的是卡片——**画一动不动**。
   *
   * 这条不变量是踩出来的。卡片先是被算进 --cell-size 的纵向预算（卡片高一点、
   * 格子就小一点，中文正好塞得下所以看不出来，日语葡语高出七八个像素就要棋盘
   * 买单）；改成只挪画不改大小之后，一点开教学画仍然往下窜一截——德语三十八个
   * 像素，中文二十一个——收起来时窜回去，通关那一帧教学退场还窜一次，
   * 正好落在揭晓最挤的那一帧上。让路的钱一旦记在画头上，就总要在某个时刻还。
   *
   * 现在这笔钱由卡片自己出，一共三档，按顺序用：
   *
   * 1. 摆到没被用到的那一半（placeOf）；
   * 2. 那一半也不够，就换到宽的那一半去（下面的 lift，只许从下换到上：
   *    摆上面的那几页要么指着屏底的按钮、要么正轮到玩家按它们，换下去就是坐在
   *    它们身上）；
   * 3. 还不够，摆上面的那一档先往上抬（rise，一路可以让到安全区，路上盖住顶栏
   *    没关系——那一带正被暗幕压着，装的也只是导航），抬到顶仍然差着，就把卡片
   *    压到剩下的那点高度里，话自己滚着读（见 fit 末尾与 .body）。
   *
   * 前两档整轮只算一次，且按整轮最占地方的那一页算：先把每一页连同它摆哪一半
   * 都排一遍（probeRoom），再一次定死。所以翻页时卡片不会跟着「这一页两行、
   * 下一页一行」上下跳，短的那几页只是离画更远一点。
   */
  const roomRef = useRef<Room | null>(null)
  /** 这一轮下面那一档挤不下，整轮改摆上面 */
  const [lift, setLift] = useState(false)
  // 卡片摆在没被用到的那一半（规则见 placeOf），地方不够再往宽的那一半让
  const wanted = place !== 'auto' ? place : placeOf(box)
  const spotPlace = wanted === 'bottom' && lift ? 'top' : wanted
  const centered = place === 'center'
  /*
   * 换一轮（改语言、换教材）就把量过的作废，别拿上一轮的占位给这一轮定位置。
   * 写成布局效果并排在量之前：布局效果一律先于提交后的 effect 跑，
   * 摆成后者就会「先按旧结论量一遍、再作废、再量一遍」，白排两轮。
   */
  useLayoutEffect(() => {
    roomRef.current = null
  }, [pages, place])
  /*
   * 不给 pages 的场合（单页）拿眼前这一页凑一份。走 ref 而不是进依赖：
   * lines 每渲染一次就是一个新数组（末页那条学习提示是现搭的），
   * 进了依赖，这条 effect 就每渲染一次重跑一次。
   */
  const soloRef = useRef<readonly CoachPage[]>(EMPTY_PAGES)
  soloRef.current = [{ title, lines, spot }]
  const fit = useCallback(() => {
    const root = rootRef.current
    const card = cardRef.current
    const art = root ? artOf(root, spot) : null
    // 居中的大卡不参与让路：它的落点与高度全由 CSS 定（见 .card[data-place='center']）
    if (centered) {
      measure()
      return
    }
    if (!root || !card || !art || !card.offsetHeight || !art.offsetHeight) return
    /*
     * 先把上一次让开的量和压扁的高都撤掉再量。
     *
     * 量到的落点里含着上一次的位移，直接拿它去算，每量一次就在上一次的结果上
     * 再加一次，卡片会一页比一页往上爬；高同理，照着压过的高去量，只会一次比
     * 一次矮。撤掉再量则每次都从同一个缺省落点、同一个自然身量起算，量多少遍
     * 都是同一个答案。撤与写之间没有一次绘制，屏幕上不会闪。
     */
    root.style.setProperty('--coach-card-rise', '0px')
    card.style.maxHeight = ''
    const cached = roomRef.current
    // 高出半个像素以内不算「比量过的高」：offsetHeight 取的是整数，克隆量出来的
    // 是小数，差这一点就重量一轮，等于每翻一页白排一遍整轮的页
    if (!cached || cached.tallest + 0.5 < card.offsetHeight) {
      roomRef.current = probeRoom(
        card,
        root,
        pages.length > 0 ? pages : soloRef.current,
        place,
        spot,
      )
    }
    const room = roomRef.current
    if (!room) return
    const artBox = art.getBoundingClientRect()
    const safeTop = safeTopOf(root)
    const below = room.bottomAnchor - artBox.bottom
    const above = artBox.top - safeTop
    /*
     * 下面那一档摆不下、上面反倒宽一些，这一轮就整个抬到上面去。
     *
     * 只许从下换到上。摆下面的那几页指的都是上半屏的东西（开场认盘、收尾指灯泡），
     * 换到上面只是离得远些；反过来不行——摆上面的那几页要么指着屏底那三枚按钮、
     * 要么正轮到玩家去按，卡片换下去就是坐在它们身上。
     */
    const raise = place === 'auto' && room.bottomNeed > below && above > below
    setLift(raise)
    const topNeed = raise
      ? Math.max(room.topNeed ?? -Infinity, room.topAnchor + room.bottomNeed)
      : room.topNeed
    const rise = fitCard(room, topNeed, artBox.top, safeTop)
    root.style.setProperty('--coach-card-rise', `${rise}px`)
    /*
     * 让到头还差着的那一截，由卡片压矮自己来认：这一档到画之间还剩多少，
     * 卡片就只准占多少，话装在 .body 里滚着读。矮到连骨架都放不下时以骨架为准
     * ——地方再紧，「继续」也得留在屏幕上，否则这一层就没法收了。
     */
    const space = card.dataset.place === 'bottom' ? below : artBox.top - (room.topAnchor - rise)
    card.style.maxHeight = `${Math.max(space - clearanceOf(spot), room.floor)}px`
    measure()
  }, [rootRef, measure, pages, place, spot, centered])

  /*
   * 让位在绘制之前落地，卡片因此不会先站在缺省落点上闪一帧再跳上去。
   * 首帧父节点的 ref 可能还没接上（进关卡即开讲那一帧），量不到就什么也不做，
   * 交给下面那条提交后的 effect 补一次。
   */
  useLayoutEffect(() => {
    fit()
  }, [fit, cardKey, spotPlace])
  useEffect(() => {
    const root = rootRef.current
    const card = cardRef.current
    const art = root ? artOf(root, spot) : null
    fit()
    if (!root) return
    // 换视口就把这一轮的结论作废：横竖屏之间上下的余量完全是两回事
    const relayout = () => {
      roomRef.current = null
      fit()
    }
    /*
     * root 的内容盒一变，等于视口或安全区变了（它的高是定死的一屏，变的只能是
     * 内边距），这一轮的落点全要重算——与 resize 事件同一待遇。安卓上安全区
     * 变量注进来时正是这条路，那时并没有 resize 事件。挂上时那一次通知只是
     * 报个初值，不算变。
     */
    let rootSize: string | null = null
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver((entries) => {
            const rootEntry = entries.find((entry) => entry.target === root)
            if (rootEntry) {
              const size = `${rootEntry.contentRect.width}×${rootEntry.contentRect.height}`
              const changed = rootSize !== null && rootSize !== size
              rootSize = size
              if (changed) {
                relayout()
                return
              }
            }
            fit()
          })
    if (card) observer?.observe(card)
    if (art) observer?.observe(art)
    // 被指着的那一块尺寸不变也会被推着走，推它的那些节点一并盯着（见 pushersOf）
    for (const pusher of pushersOf(root, art)) observer?.observe(pusher)
    window.addEventListener('resize', relayout)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', relayout)
    }
    // cardKey 要在依赖里：翻页时卡片是**换了一个节点**（React 按 key 重建），
    // 不重挂就等于在盯着一个已经拆掉的节点量高。spot 同理：没有盘的页面上
    // 盯着量的是被指着的那一块，换一页就换一个节点
  }, [rootRef, fit, cardKey, spot])

  /*
   * 这一层撤下时才把让位收回去，不在翻页之间来回摘挂：
   * 那个属性眼下正撑着卡片的位置，翻一页摘一次，等于让它多经历一次无谓的往返。
   */
  useEffect(() => {
    const root = rootRef.current
    return () => {
      root?.style.removeProperty('--coach-card-rise')
    }
  }, [rootRef])

  return (
    <div className={styles.coach}>
      {hole && (
        <div
          className={styles.veil}
          data-intro={intro ? 'true' : undefined}
          style={hole}
          aria-hidden="true"
        />
      )}
      {/*
        只讲不做的页：整屏接管点按，点哪儿都是继续。它压在洞上面，所以被指着的
        那个按钮此刻按不动——这几页要的是「看清楚它长什么样」，真按留到后面。

        例外：holeInteractive 的那一页（介绍切换开关），catcher 在目标位置
        开个洞（clip-path），让玩家自己拨一拨。
      */}
      {onTapThrough && (
        <div
          className={styles.catcher}
          onClick={onTapThrough}
          aria-hidden="true"
          style={
            hole && holeInteractive
              ? {
                  clipPath: `polygon(0 0, 10000px 0, 10000px 10000px, 0 10000px, 0 0, ${hole.left}px ${hole.top}px, ${hole.left}px ${hole.top + hole.height}px, ${hole.left + hole.width}px ${hole.top + hole.height}px, ${hole.left + hole.width}px ${hole.top}px, ${hole.left}px ${hole.top}px)`,
                }
              : undefined
          }
        />
      )}
      <div
        key={cardKey}
        ref={cardRef}
        className={styles.card}
        data-place={spotPlace}
        data-variant={variant}
        data-intro={intro ? 'true' : undefined}
        role="group"
        aria-label={ariaLabel}
      >
        {/* 欢迎卡的底纹：一幅很淡的画铺在字底下，不参与布局 */}
        {texture && (
          <div
            className={styles.texture}
            style={{ backgroundImage: `url(${texture})` }}
            aria-hidden="true"
          />
        )}
        {/* 话装在这里。地方紧的时候变矮、能滚的是它，底下那行按钮一步不让 */}
        <div className={styles.body}>
          <p className={styles.title}>{title}</p>
          {lines.map((line) => (
            <p key={line} className={styles.line}>
              {line}
            </p>
          ))}
        </div>
        <div className={styles.foot} data-align={footAlign}>
          {children}
        </div>
      </div>
    </div>
  )
}
