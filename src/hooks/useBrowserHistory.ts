import { useCallback, useEffect, useRef } from 'react'

/**
 * 浏览器返回键 / 前进键与应用层级的对接。
 *
 * 从前应用层级全部活在内存里（见 App.tsx 的 NavState），浏览器那一格历史条目
 * 从头到尾只有一条：站在藏品详情按浏览器返回，退掉的是「进入本站」那一步，
 * 人直接离开了游戏；再按前进回来又落在首页。这不是「没有做路由」的必然结果——
 * 层级判断本来就只有一份（resolveLayer），缺的只是把它同步到 history 里。
 *
 * ## 模型：一层页面 = 一条历史条目，条目里存这一层的层级快照
 *
 * 不引入 URL 路由：地址栏一个字都不改（pushState 的 url 传空）。理由有两条——
 * 一是原生包（Capacitor）跑在 file:// 或 capacitor:// 上，改地址栏要连带处理资源
 * 基址与深链，代价远大于收益；二是这里要解决的是「返回退到哪一层」，不是
 * 「一条链接能打开哪一页」，后者是另一件事。
 *
 * 每条条目的 state 里带两样：这条条目在会话里的序号 `idx`，和这一层的快照 `snap`。
 * 于是：
 *
 * - **前进**（进画册、进关卡、进藏品详情）：压一条新条目。
 * - **浏览器返回/前进**：popstate 拿到目标条目的快照，直接把它落回应用状态——
 *   两个方向同一条路，不用数步数，也就不会数错。
 * - **应用自己的返回**（左上角箭头）：状态先变，同步 effect 发现新快照正是栈里
 *   更浅的某一条，于是 `history.go` 退到那一条。随后 popstate 送回来的快照与
 *   当前状态一致，落回去是一次空操作（见下面的相等判断）。
 * - **刷新**：条目的 state 由浏览器自己保留，整条会话历史也还在。开机读回来就
 *   落在原来那一层，返回键仍然逐层退。栈本身另存 sessionStorage，与 history
 *   同生命周期、同标签页。
 *
 * ## 只在 Web 上装
 *
 * iOS 左缘手势与安卓返回键各有自己的实现（见 utils/nativeNavigation 与
 * utils/nativeBackHandler），它们不看 history，也不该看。原生包里这个钩子整个不装。
 */

/** 写进 history.state 的键。与页面上别的东西共用 state 对象，只认自己这一格。 */
const STATE_KEY = '__nonogramNav'
/** 栈另存一份，让刷新之后仍知道更浅的每一层分别是什么。 */
const STACK_KEY = 'nonogram.navStack.v1'
/**
 * 一次前进最多补几条中间层。
 *
 * 「首页直接开教学关」这类一步跨两层的入口要把跳过的那一层也补进历史，
 * 返回才仍是逐层退。层级总共就那么几级，给一个明确上限，坏数据也转不出死循环。
 */
const MAX_CHAIN = 6

/** 层级快照：resolveLayer 认的那几个值，一个不多一个不少。 */
export interface NavSnapshot {
  dailyActive: boolean
  dailyView: boolean
  /** 正在打的那一期每日挑战；不在对局中时为 null，日历上换日期因此不产生历史条目。 */
  dailyDate: string | null
  currentId: string | null
  openAlbumId: string | null
  libraryView: boolean
  detailPuzzleId: string | null
  collectionView: boolean
}

interface Entry {
  idx: number
  snap: NavSnapshot
}

export function sameNavSnapshot(a: NavSnapshot | null, b: NavSnapshot | null): boolean {
  if (!a || !b) return false
  return (
    a.dailyActive === b.dailyActive &&
    a.dailyView === b.dailyView &&
    a.dailyDate === b.dailyDate &&
    a.currentId === b.currentId &&
    a.openAlbumId === b.openAlbumId &&
    a.libraryView === b.libraryView &&
    a.detailPuzzleId === b.detailPuzzleId &&
    a.collectionView === b.collectionView
  )
}

function isSnapshot(value: unknown): value is NavSnapshot {
  if (!value || typeof value !== 'object') return false
  const snap = value as Record<string, unknown>
  const optionalString = (v: unknown) => v === null || typeof v === 'string'
  return (
    typeof snap.dailyActive === 'boolean' &&
    typeof snap.dailyView === 'boolean' &&
    optionalString(snap.dailyDate) &&
    optionalString(snap.currentId) &&
    optionalString(snap.openAlbumId) &&
    typeof snap.libraryView === 'boolean' &&
    optionalString(snap.detailPuzzleId) &&
    typeof snap.collectionView === 'boolean'
  )
}

/**
 * 刷新之后落回来的那一层要先夹一道。
 *
 * 每日挑战的对局只有拿到当期文件才成立（见 resolveLayer），而那份文件是开机之后
 * 才去取的——直接把 dailyActive 放回去，会有一段「状态说在打、层级还没到」的空窗。
 * 冷启动统一退到日历那一层，日期照旧还给它，玩家按一下就回到同一局（进度按日期
 * 存在本地，不会丢）。会话内的前进/返回不走这里，那时文件就在手上。
 */
export function restorableSnapshot(snap: NavSnapshot): NavSnapshot {
  if (!snap.dailyActive) return snap
  return { ...snap, dailyActive: false, dailyView: true }
}

export function entryOf(state: unknown): Entry | null {
  if (!state || typeof state !== 'object') return null
  const raw = (state as Record<string, unknown>)[STATE_KEY]
  if (!raw || typeof raw !== 'object') return null
  const entry = raw as Record<string, unknown>
  if (typeof entry.idx !== 'number' || !Number.isInteger(entry.idx) || entry.idx < 0) return null
  if (!isSnapshot(entry.snap)) return null
  return { idx: entry.idx, snap: entry.snap }
}

function withEntry(state: unknown, entry: Entry): Record<string, unknown> {
  const base = state && typeof state === 'object' ? { ...(state as Record<string, unknown>) } : {}
  base[STATE_KEY] = entry
  return base
}

function readStack(): (NavSnapshot | null)[] | null {
  try {
    const raw = sessionStorage.getItem(STACK_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    return parsed.map((item) => (isSnapshot(item) ? item : null))
  } catch {
    return null
  }
}

function writeStack(stack: (NavSnapshot | null)[]): void {
  try {
    sessionStorage.setItem(STACK_KEY, JSON.stringify(stack))
  } catch {
    // 隐私模式 / 配额用尽：栈没存下只是刷新之后退得粗一点，不该影响这一次导航
  }
}

export interface BrowserHistoryOptions {
  /** 原生包里整套不装（理由见文件头注释）。 */
  enabled: boolean
  /** 当前这一层的快照。它变了就意味着「导航发生了」。 */
  snapshot: NavSnapshot
  /** 退一层。与 App 的返回键共用同一份层级判断，null 表示已经在根页。 */
  popSnapshot: (snap: NavSnapshot) => NavSnapshot | null
  /**
   * 把一份快照落回应用状态。direction 只决定用哪套转场，不决定退到哪一层。
   * restore＝刷新之后的落地：页面刚出来，没有「从哪儿退回来」可言，不配转场。
   */
  applySnapshot: (snap: NavSnapshot, direction: 'back' | 'forward' | 'restore') => void
  /** 浮层优先：设置面板、确认单这类临时层自己先把这一下返回吃掉。 */
  consumeOverlay: () => boolean
  /** 强制更新弹窗期间，返回不是逃生通道。 */
  locked: boolean
}

export function useBrowserHistory({
  enabled,
  snapshot,
  popSnapshot,
  applySnapshot,
  consumeOverlay,
  locked,
}: BrowserHistoryOptions): void {
  /** 会话里每一条条目对应的层级。null＝刷新后没能读回来的那几条，永不匹配。 */
  const stackRef = useRef<(NavSnapshot | null)[]>([])
  const idxRef = useRef(0)
  const readyRef = useRef(false)
  /**
   * 刷新恢复还在路上时挂着的那一份。
   *
   * 恢复是在 effect 里 setState 的，而同步 effect 在**同一次提交**里就会跑一遍——
   * 那一遍看到的还是首页那份快照，与条目里存的深层页对不上，于是它会当成一次
   * 「应用自己退了好几层」，反手 history.go 退回首页，把刚恢复的落点撤掉。
   * 挂上这一份，等状态真的追上来再放行。
   */
  const awaitingRestoreRef = useRef<NavSnapshot | null>(null)
  /*
   * 监听器只装一次，读到的却必须是当前这一帧的回调与状态。
   * 把它们放在一个每次渲染都刷新的 ref 里，比让 effect 跟着依赖反复重装稳当：
   * 重装的空档里恰好来一次 popstate，那一下就没人接。
   */
  const latest = useRef({ snapshot, popSnapshot, applySnapshot, consumeOverlay, locked })
  latest.current = { snapshot, popSnapshot, applySnapshot, consumeOverlay, locked }

  /** 浏览器已经退了一格，而这一下不该改变层级：原样压回去，位置回到原处。 */
  const restoreEntry = useCallback(() => {
    const snap = stackRef.current[idxRef.current] ?? latest.current.snapshot
    window.history.pushState(withEntry(window.history.state, { idx: idxRef.current, snap }), '')
  }, [])

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return
    const restored = entryOf(window.history.state)
    if (restored) {
      // 刷新：条目的 state 与整条会话历史都由浏览器保住了，接着用
      const snap = restorableSnapshot(restored.snap)
      const stored = readStack()
      const stack: (NavSnapshot | null)[] =
        stored && stored.length > restored.idx ? stored.slice(0, restored.idx + 1) : []
      while (stack.length <= restored.idx) stack.push(null)
      stack[restored.idx] = snap
      stackRef.current = stack
      idxRef.current = restored.idx
      // 夹过的那一份要写回条目，否则同步 effect 会把它当成一次新的导航
      window.history.replaceState(withEntry(window.history.state, { idx: restored.idx, snap }), '')
      writeStack(stack)
      readyRef.current = true
      if (!sameNavSnapshot(snap, latest.current.snapshot)) {
        awaitingRestoreRef.current = snap
        latest.current.applySnapshot(snap, 'restore')
      }
    } else {
      const snap = latest.current.snapshot
      stackRef.current = [snap]
      idxRef.current = 0
      window.history.replaceState(withEntry(window.history.state, { idx: 0, snap }), '')
      writeStack(stackRef.current)
      readyRef.current = true
    }

    const onPopState = (event: PopStateEvent) => {
      const entry = entryOf(event.state)
      // 不是这套模型写的条目：这条会话里没有属于应用的上一层，让浏览器照常走
      if (!entry) return
      const { locked: isLocked, consumeOverlay: consume, applySnapshot: apply } = latest.current
      if (isLocked) {
        restoreEntry()
        return
      }
      /*
       * 浮层压着的时候，这一下返回该收浮层，不该退页——与安卓返回键、iOS 左缘
       * 手势同一条规矩（见 App.tsx 的 navigateBack 与 hasBackHandler）。收完把
       * 条目压回去，历史位置不动，人还站在同一层。
       */
      if (consume()) {
        restoreEntry()
        return
      }
      const back = entry.idx < idxRef.current
      idxRef.current = entry.idx
      if (entry.idx < stackRef.current.length) stackRef.current[entry.idx] = entry.snap
      /*
       * 应用自己的返回走的是「先改状态、再 go(-n)」，随后这条 popstate 送回来的
       * 就是刚落定的那一份。相等即什么都不做：再跑一次转场只会白闪一下。
       */
      if (sameNavSnapshot(entry.snap, latest.current.snapshot)) return
      apply(entry.snap, back ? 'back' : 'forward')
    }

    window.addEventListener('popstate', onPopState)
    return () => {
      window.removeEventListener('popstate', onPopState)
      readyRef.current = false
    }
  }, [enabled, restoreEntry])

  useEffect(() => {
    if (!enabled || !readyRef.current || typeof window === 'undefined') return
    // 刷新恢复还没落地：这一轮的快照不是玩家导航的结果，一步都不要动历史
    const awaiting = awaitingRestoreRef.current
    if (awaiting) {
      if (sameNavSnapshot(awaiting, snapshot)) awaitingRestoreRef.current = null
      return
    }
    const stack = stackRef.current
    const idx = idxRef.current
    if (sameNavSnapshot(stack[idx], snapshot)) return

    /*
     * 往回走：这一层在栈里更浅的位置已经有了（应用返回键、通关后「返回选关」
     * 这类一步退好几级的跳转都走这里）。退到那一条，不再压新的——不然按一次
     * 返回反而让历史变长，浏览器的返回键就再也退不出去了。
     */
    for (let j = idx - 1; j >= 0; j -= 1) {
      if (sameNavSnapshot(stack[j], snapshot)) {
        idxRef.current = j
        window.history.go(j - idx)
        return
      }
    }

    /*
     * 前进。一步跨过好几层时（首页直接开教学关：同时定下册与关），把跳过的
     * 中间层也补成条目，浏览器返回才仍是逐层退，而不是一步回到首页。
     * 补到「这一层在栈里已经有了」为止。
     */
    const chain: NavSnapshot[] = [snapshot]
    while (chain.length < MAX_CHAIN) {
      const prev = latest.current.popSnapshot(chain[0])
      if (!prev) break
      if (stack.slice(0, idx + 1).some((item) => sameNavSnapshot(item, prev))) break
      if (chain.some((item) => sameNavSnapshot(item, prev))) break
      chain.unshift(prev)
    }
    const next = stack.slice(0, idx + 1)
    for (const snap of chain) {
      next.push(snap)
      window.history.pushState(withEntry(window.history.state, { idx: next.length - 1, snap }), '')
    }
    stackRef.current = next
    idxRef.current = next.length - 1
    writeStack(next)
  }, [enabled, snapshot])
}
