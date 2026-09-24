import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

/**
 * 这块地方进没进过视野（含提前量）。
 *
 * 给「一段一段地长」的长页面用：段还远着的时候先交个空壳，滚到跟前才把真东西
 * 挂上去。收藏页是第一个用户——解锁满库的老玩家进去要一次挂 600 张 canvas，
 * 每张还要算三张色表再逐格画一遍，那是一次以百毫秒计的长任务。
 *
 * 进过就一直算进过，不再摘下来：画一次的钱已经付了，滚回去重画只会再付一次，
 * 而一张缩略图的后备存储只有 size×size 个像素（15×15 关不到 1KB），留着不亏。
 *
 * 两条腿走路，提前量也分两档：
 * - 真落在视野里的那几段不等观察器回话。IntersectionObserver 的第一次回调排在
 *   「更新渲染」那一步，最快也是下一帧，中间会亮出一屏空格子；这里在 layout
 *   effect 里自己量一次盒子，同一帧内就把画挂上。这一档不留提前量：首帧只付
 *   看得见的那部分的钱。
 * - 提前量那一圈（默认往外一屏半）交给观察器。它的回调本来就落在下一帧，
 *   于是「看得见的」与「快看得见的」自然分成两个短任务，而不是并成一个长的。
 *
 * 没有 IntersectionObserver 的环境（jsdom、老 WebView）直接当全都在视野里，
 * 退回从前那套一次挂满的行为——少一层优化，不能少一块内容。
 *
 * `root` 是滚动的那个容器，页面自己拿着滚动时必须传（收藏页就是）。不传等于
 * 用视口。这一条不是可选的讲究：`rootMargin` 只作用在 root 自己那个框上，
 * 中间那些滚动容器的裁剪不吃它。页面装在一个 overflow 容器里而 root 仍留空时，
 * 容器外的段早就被裁没了，那一圈提前量等于白写——段要等真的露头才开工，
 * 一屏格子当场现画，正是这个 hook 要躲开的那件事。
 */
export function useNearViewport<T extends Element>(
  margin = 800,
  root?: RefObject<Element | null>,
): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null)
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined')

  useLayoutEffect(() => {
    if (near) return
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    // 「看得见」是相对滚动容器说的；没有容器时才轮到视口
    const bounds = root?.current?.getBoundingClientRect()
    const top = bounds ? bounds.top : 0
    const bottom = bounds
      ? bounds.bottom
      : window.innerHeight || document.documentElement.clientHeight
    if (rect.bottom >= top && rect.top <= bottom) setNear(true)
  }, [near, root])

  useEffect(() => {
    if (near) return
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        setNear(true)
        observer.disconnect()
      },
      { root: root?.current ?? null, rootMargin: `${margin}px` },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [near, margin, root])

  return [ref, near]
}
