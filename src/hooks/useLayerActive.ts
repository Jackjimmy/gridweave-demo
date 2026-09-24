import { createContext, useContext } from 'react'

/**
 * 这一层是不是**当前摊在屏幕上**的那一层。
 *
 * 紧挨着的上一层现在是真的挂着、排着版、画着的（见 App 的预热层），它的
 * effect 与当前页一样会跑。绝大多数 effect 跑两遍没关系——多算一次缩略图、
 * 多挂一个 resize 监听，各画各的互不相干。有三类不行，它们碰的是**全局唯一**
 * 的那一份东西：
 *
 *   一、往 html / body 上挂类名的（画册页锁根滚动、每日挑战锁纵向滚动）。
 *       藏着的册页把 body 锁成 position: fixed，正在打的那一局就跟着废了。
 *   二、抢焦点的（册页返回时把焦点放回那张卡）。文档里只有一个焦点。
 *   三、进返回栈的浮层（useBackHandler）。多压一层，左缘手势当场变成 defer。
 *
 * 这三类一律先问这一句。默认 true：安卓、网页端和全部单元测试都没有预热层，
 * 行为与从前一模一样。
 */
const LayerActiveContext = createContext(true)

export const LayerActiveProvider = LayerActiveContext.Provider

export function useLayerActive(): boolean {
  return useContext(LayerActiveContext)
}
