import { useEffect } from 'react'

/*
 * 安卓返回键（含侧边返回手势）的拦截栈。
 *
 * 返回键的分发本来集中在 App 里，按视图层级一路 else if 下来。但弹窗不在那份
 * 层级里——设置面板挂在 Game 或 LevelSelect 内部，App 根本不知道它开着，
 * 于是一个本该「退回上一级」的返回键会穿过弹窗，直接退出关卡甚至退出应用。
 *
 * 把这类临时层做成一个栈：谁开着谁压栈，返回键先问栈顶。后进先出，
 * 弹窗套弹窗也能一层层退。App 里那串 else if 保持原样，只在最前面多问一句。
 */
const handlers: (() => void)[] = []
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

/**
 * 组件挂载期间接管返回键。active 为 false 时不参与（用于条件渲染之外的开关）。
 * 同一时刻只有最后压栈的那个会被调用。
 */
export function useBackHandler(onBack: () => void, active = true): void {
  useEffect(() => {
    if (!active) return
    handlers.push(onBack)
    notify()
    return () => {
      const index = handlers.lastIndexOf(onBack)
      if (index >= 0) handlers.splice(index, 1)
      notify()
    }
  }, [onBack, active])
}

/**
 * 订阅这个栈的进出。
 *
 * 安卓根页要把返回交还系统，可「根页」这个条件不只看层级：首页上开着设置面板时，
 * 那一下返回该收面板，不该退出应用。栈是模块里的一个数组，压栈不会惊动 App 重渲染，
 * 所以补一条订阅，配 useSyncExternalStore 用。
 */
export function subscribeBackHandlers(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** 栈里现在压着几层。快照要的是个数，不是数组——数组每次都是新身份。 */
export function backHandlerCount(): number {
  return handlers.length
}

/**
 * 栈里有没有人。
 *
 * iOS 左缘手势起手时要先分清这一下是「退回上一页」还是「收起一张浮层」：
 * 前者就地换页、交给原生跟手，后者留到松手再说——否则一次半途收回的手势
 * 会顺手把设置面板关掉。
 */
export function hasBackHandler(): boolean {
  return handlers.length > 0
}

/** 交给栈顶处理并返回 true；没人接管时返回 false，由调用方走原有的层级逻辑 */
export function runTopBackHandler(): boolean {
  const top = handlers[handlers.length - 1]
  if (!top) return false
  top()
  return true
}
