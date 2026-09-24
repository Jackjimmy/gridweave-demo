import { useLayoutEffect } from 'react'
import type { RefObject } from 'react'
import { fitOneLine, fitWrappedLines } from '../../utils/fitFontSize'

/**
 * 卡片上两行名字的字号下界。
 *
 * 中文里最长的名字是「理发店旋转灯柱」七个字（602 关里仅此一条，六个字的也只有三条）。
 * 实测：375px 屏上一格 70px，收到 10px 正好进去；320px 屏上一格只有 59px，
 * 收到 8px 进去——刚好落在这个界上。再窄的屏这个 App 也排不出四列了，
 * 所以到界还溢出就让 overflow 裁掉，不会一路缩成蚂蚁。
 *
 * 上面那行也走同一个下界。中日韩下它装的是英文词（本来就有长到 16 个字母的
 * T4 Bacteriophage），德法西葡下它装的是本地名——两种都可能比一格宽，
 * 从前只有下面那行收字号，是因为上面那行当时只可能是英文而卡片是照英文排的。
 */
const MIN_ZH_FONT_PX = 8

/**
 * 把一片卡片上的名字收进各自那一格。
 *
 * 「理发店旋转灯柱」在 10.5px 下比一格宽出一点点，折行之后把上面那行英文名
 * 顶掉半截（真机实测，《居家日常》第 2 页）。名字的长短和格子的宽窄都要等
 * 排完版才知道，所以只能在这儿量；useLayoutEffect 而不是 useEffect——晚一帧
 * 就会先闪一下折行的样子。
 *
 * 一次量完 root 里的全部卡片，不是每张卡各挂一个观察器：一页 16 张，观察器和
 * 回流都不该按卡片数量长。已经在场的卡片量出来还是原来那个字号——fitOneLine
 * 每次都从基准字号重来，结果只由盒宽与文字决定，所以屏上的东西不会因此挪一下。
 *
 * 四条重算触发与每日挑战那张卡同源（见 DailyCalendar，那儿写着「缺一条都出过问题」）：
 *   ResizeObserver —— 格子宽度变了，最准的一条
 *   resize —— 旋屏、分屏；RO 万一不触发时的保底
 *   fonts.ready —— 首次测量可能落在回退字体上，字形宽度与最终字体不同
 *   deps —— 调用方给的：换页会挂上新的一屏卡片，解锁一关会把「第 12 关」换成真名字
 *
 * 册页与试玩版首页的合集面板共用这一份（后者把六关直接摊在首页上）。
 */
export function useFitPuzzleNames(root: RefObject<HTMLElement | null>, deps: readonly unknown[]): void {
  useLayoutEffect(() => {
    const container = root.current
    if (!container) return
    const fit = () => {
      /*
       * 没有布局盒子就跳过。预热那一层是真排着版的（正是要它排好，揭开时才
       * 不用现排），所以这一句在那条路上不会拦住什么；它拦的是没有尺寸可量的
       * 场合——祖先被藏起来、页面还没进文档，量出来的永远是 0，量了也是白量。
       */
      if (container.getClientRects().length === 0) return
      const names = container.querySelectorAll<HTMLElement>('[data-fit-name], [data-fit-wrapped]')
      for (const el of names) {
        delete el.dataset.nameWrap
        if (el.parentElement) delete el.parentElement.dataset.nameWrap
      }
      fitOneLine(container.querySelectorAll<HTMLElement>('[data-fit-name]'), MIN_ZH_FONT_PX)
      // 折行那一路（没有副名的语言，名字占满两行）按高度收，见 utils/fitFontSize
      fitWrappedLines(container.querySelectorAll<HTMLElement>('[data-fit-wrapped]'), MIN_ZH_FONT_PX)
      // 达到字号下界仍放不下时，保留完整名称并让本行卡片增加所需高度。
      for (const el of names) {
        if (el.clientWidth > 0 && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)) {
          el.dataset.nameWrap = ''
          if (el.parentElement) el.parentElement.dataset.nameWrap = ''
        }
      }
    }
    fit()
    // 收字号改的是 .zh 的字号与 .name 的高（长译名保全那一路），都在卡片内部，
    // 容器自己的盒子由 flex 定高定宽——所以观察容器不会被自己的写入回弹成死循环
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit)
    observer?.observe(container)
    window.addEventListener('resize', fit)
    let alive = true
    void document.fonts?.ready.then(() => {
      if (alive) fit()
    })
    return () => {
      alive = false
      observer?.disconnect()
      window.removeEventListener('resize', fit)
    }
    // deps 由调用方列出：换页、解锁、进度都会换掉屏上的名字
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, ...deps])
}
