import { useCallback, useEffect, useState } from 'react'
import type { RefObject } from 'react'
import { useBackHandler } from '../../hooks/useBackHandler'
import { haptics } from '../../utils/haptics'
import { useT } from '../../i18n'
import type { CoachSpot } from './coachScript'
import { Spotlight } from './Spotlight'
import styles from './Spotlight.module.css'

/** 这一页至少停这么久：读完两行字要的时间，秒 */
export const HINT_INTRO_HOLD_SECONDS = 5

/** 留在光里的只有顶栏那枚提示。模块级常量：换一个身份 Spotlight 就要重量一遍 */
const HINT_SPOT: CoachSpot = { kind: 'element', target: 'hint' }

interface Props {
  /** 量提示按钮位置用的根节点 */
  rootRef: RefObject<HTMLElement | null>
  /** 读完了：记下看过，把界面整个交还玩家 */
  onDone: () => void
}

/**
 * 第二关一开局那一页：压暗四周，只留顶栏那枚提示，介绍它是干什么的。
 *
 * 第一关（heart）教完涂色，第二关（diamond）没有人牵着手了——这一步跳得
 * 有点大，一部分人跟不上。这里在他落第一笔之前先把提示介绍给他：点它看下一步
 * 该涂哪里、为什么；免费、不限次数，就是随身的教程。这一页讲的是**功能**，
 * 不是「你卡住了」——他还一笔没落，没有卡住这回事。有了这句话，第二关往后
 * 每一次卡住都有一条出路，不必再在星星那一关末尾单独讲一遍。
 *
 * 前五秒**关着门**：没有继续，点空白处也不走，右下角只有一个倒数——这一页
 * 只有两行字，可它是这游戏最要紧的一句话，不能让人手一滑就翻过去。五秒到了
 * 换成「继续」，点哪儿都是走人。全程只出现这一次，之后不再有入口：读过的人
 * 已经知道提示在哪儿、是干什么的。
 */
export function HintIntro({ rootRef, onDone }: Props) {
  const t = useT()
  const [left, setLeft] = useState(HINT_INTRO_HOLD_SECONDS)
  const open = left <= 0
  useEffect(() => {
    if (open) return
    const timer = window.setInterval(() => setLeft((n) => n - 1), 1000)
    return () => window.clearInterval(timer)
  }, [open])

  /*
   * 走人带一记轻拍，和教学里的「继续」同一记。整屏的 catcher 不是按钮，
   * 全站那套委托覆盖不到；下面那枚「继续」标了 data-haptic="self"。
   */
  const finish = useCallback(() => {
    if (!open) return
    haptics.step()
    onDone()
  }, [open, onDone])
  // 返回键在门关着时按了也不算：这一页就是要读完；开了门就等于「继续」
  useBackHandler(finish)

  return (
    <Spotlight
      spot={HINT_SPOT}
      rootRef={rootRef}
      cardKey="hint-intro"
      intro
      place="auto"
      onTapThrough={finish}
      footAlign="end"
      ariaLabel={t('hintIntro.title')}
      title={t('hintIntro.title')}
      lines={t.list('hintIntro.lines')}
    >
      {open ? (
        <button className={styles.next} onClick={finish} data-haptic="self">
          {t('tutorial.next')}
        </button>
      ) : (
        <span className={styles.turn} role="status" aria-live="off">
          {left}
        </span>
      )}
    </Spotlight>
  )
}
