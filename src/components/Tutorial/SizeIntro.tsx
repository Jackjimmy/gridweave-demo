import { useCallback, useMemo, useState } from 'react'
import type { RefObject } from 'react'
import { useBackHandler } from '../../hooks/useBackHandler'
import { haptics } from '../../utils/haptics'
import { useT } from '../../i18n'
import type { CoachSpot } from './coachScript'
import { Spotlight } from './Spotlight'
import type { CoachPage } from './Spotlight'
import styles from './Spotlight.module.css'

interface Props {
  /** 10 或 15。5×5 不讲——那是所有人开局的尺寸 */
  size: number
  /** 量棋盘位置用的根节点 */
  rootRef: RefObject<HTMLElement | null>
  /** 读完了：记下这个尺寸见过，把界面整个交还玩家 */
  onStart: () => void
}

interface Page extends CoachPage {
  id: string
  spot: CoachSpot
}

/**
 * 第一次进 10×10 / 15×15 时的那几页。
 *
 * 从前是一张居中的对话框：它把玩家正要面对的那张盘整个挡在身后，读完关掉，
 * 他仍然没看见「更大」是多大。现在走教学同一套压暗——四周暗下来、这张盘
 * 亮着，话摆在它上面。第一次玩数织的人在第一关见过这个样子，到了这里
 * 认得出来：又有人要指给我看一样东西。
 *
 * 10×10 那一次多讲两页：撤销与重新开始。
 *
 * 这两样从前排在第一关，紧挨着开场——可 5×5 只有二十五格，涂错了自己再点
 * 一下就翻回来，那时候玩家还没有「想退回去」这个念头，听了也记不住。
 * 第一张 10×10 才是第一次可能真的画岔了一整行、又不想从头重来的场合，
 * 两枚按钮在这里各自有了用处，才轮到介绍它们。
 *
 * 点哪儿都是继续，和教学里只讲不做的那几页一致。
 */
export function SizeIntro({ size, rootRef, onStart }: Props) {
  const t = useT()
  const [index, setIndex] = useState(0)
  const pages = useMemo<Page[]>(() => {
    const opening: Page = {
      id: 'size',
      spot: { kind: 'board' },
      title: t('journey.sizeTitle', { size }),
      lines: [t(size === 10 ? 'journey.size10' : 'journey.size15')],
    }
    // 15×15 不重复讲工具：走到这儿的人已经在第一张 10×10 上学过了
    if (size !== 10) return [opening]
    return [
      opening,
      {
        id: 'tool-undo',
        spot: { kind: 'element', target: 'undo' },
        title: t('tutorial.toolUndo.title'),
        lines: t.list('tutorial.toolUndo.lines'),
      },
      {
        id: 'tool-clear',
        spot: { kind: 'element', target: 'clear' },
        title: t('tutorial.toolClear.title'),
        lines: t.list('tutorial.toolClear.lines'),
      },
    ]
  }, [size, t])

  const page = pages[index] ?? pages[0]
  const last = index === pages.length - 1
  const next = useCallback(() => {
    setIndex((i) => (i + 1 < pages.length ? i + 1 : i))
  }, [pages.length])
  /*
   * 翻页带一记轻拍，和 5×5 那套教学的「继续」是同一记（见 useTutorialCoach 的 next）。
   *
   * 这里从前是哑的：走到第一张 10×10 的人刚在第一关按熟了「点一下、手上响一下」，
   * 到这儿连按三页（尺寸、撤销、重新开始）却什么都没有，像是按空了。
   * 整屏的 catcher 不是按钮，全站那套委托（uiHaptics）覆盖不到；下面那枚「继续」
   * 又标了 data-haptic="self"，所以两条路都只能在这里给。
   */
  const advance = useCallback(() => {
    haptics.step()
    if (last) onStart()
    else next()
  }, [last, next, onStart])
  // 返回键只收起这一层，人留在棋盘上——它不是一道要退出去的门
  useBackHandler(onStart)

  return (
    <Spotlight
      spot={page.spot}
      rootRef={rootRef}
      cardKey={page.id}
      pages={pages}
      intro={index === 0}
      /*
       * 摆哪一半交给 'auto'：开场那一页指的是整张盘，'auto' 把它判到下面；
       * 后两页指的是屏底那两枚按钮，判到上面。
       *
       * 这里曾经钉死成一律摆上面，理由是「10×10、15×15 的画本来就快占满那个槽，
       * 下面腾不出一张卡片的位置」——没量过。量出来正相反：320×480 上这张画
       * 底下还剩一百一十几个像素，上面只有九十。钉在上面，德语那一页就得把
       * 一百二十几个像素的话挤进九十里。腾不腾得出来现在由 Spotlight 现量，
       * 真挤不下它自己会换一边（见那边的 lift）。
       */
      place="auto"
      onTapThrough={advance}
      footAlign={pages.length > 1 ? 'between' : 'end'}
      ariaLabel={pages[0].title}
      title={page.title}
      lines={page.lines}
    >
      {pages.length > 1 && (
        <span className={styles.dots} aria-hidden="true">
          {pages.map((p, i) => (
            <span key={p.id} data-on={i <= index ? 'true' : undefined} />
          ))}
        </span>
      )}
      <button className={styles.next} onClick={advance} data-haptic="self">
        {t(last ? 'journey.startPuzzle' : 'tutorial.next')}
      </button>
    </Spotlight>
  )
}
