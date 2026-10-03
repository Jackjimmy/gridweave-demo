import { useCallback, useMemo, useState } from 'react'
import type { RefObject } from 'react'
import { haptics } from '../../utils/haptics'
import { isDemoBuild } from '../../config/demo'
import { useT } from '../../i18n'
import { aboutLines } from './aboutLines'
import type { CoachSpot } from './coachScript'
import { Spotlight } from './Spotlight'
import type { CoachPage } from './Spotlight'
import styles from './Spotlight.module.css'
import { welcomeTexture } from './welcomeTexture'

interface Props {
  /** 量位置用的根节点：首页整页 */
  rootRef: RefObject<HTMLElement | null>
  /** 顶栏上有没有每日挑战那一枚（网页端可能关着）；没有就不讲它 */
  hasDaily: boolean
  /** 这一屏上有没有「我的收藏」那一架（试玩版宽屏首页没有它，那一页随之不讲） */
  hasCollection?: boolean
}

interface Page extends CoachPage {
  id: string
  spot: CoachSpot
}

/**
 * 第一次打开游戏时的首页导览：压暗四周，逐块指给他看这一屏上有什么。
 *
 * 走的是第一关教学同一套压暗（Spotlight）——之后进关卡见到同样的样子，
 * 认得出「又有人要指给我看一样东西」。
 *
 * 五页，前四页只讲不做（点哪儿都是继续）：
 *   欢迎       聚光打在字标上，屏幕中间一张大卡：一句欢迎，加一段 README 式的
 *              游戏说明（与字标点开的那页 AboutCard 同一段话）
 *   主题画册   这一屏真正要人做的选择，多说一句「每本里关卡随你挑」
 *   我的收藏   一句带过
 *   每日挑战   只说入口在哪儿
 * 最后一页亮出底部那条「第一次玩？」，**只有它能按**——整屏其余地方一律
 * 拦下，没有「继续」也没有「跳过」。第一次打开的人此刻最该做的事只有一件，
 * 就是进第一关把规则学会；把别的门都关上，他不会走岔。
 *
 * 看过没看过由 LevelSelect 记（按下那条入口的那一刻），这里只管讲。
 */
export function HomeTour({ rootRef, hasDaily, hasCollection = true }: Props) {
  const t = useT()
  const [index, setIndex] = useState(0)
  const pages = useMemo<Page[]>(() => {
    const list: Page[] = [
      {
        id: 'welcome',
        spot: { kind: 'element', target: 'title' },
        // 与字标点开的那页游戏说明同一段话（见 AboutCard），末尾多一句「点继续」
        title: isDemoBuild ? `Gridweave · ${t('about.title')}` : t('about.title'),
        lines: [...aboutLines(t), t('tour.welcome.continue')],
      },
      /*
       * 试玩版首页中段那张卡不是主题横排，是四本精选合集：同一块（data-coach="themes"），
       * 换一套话。
       */
      isDemoBuild
        ? {
            id: 'themes',
            spot: { kind: 'element', target: 'themes' },
            title: t('tour.demo.title'),
            lines: t.list('tour.demo.lines'),
          }
        : {
            id: 'themes',
            spot: { kind: 'element', target: 'themes' },
            title: t('tour.themes.title'),
            lines: t.list('tour.themes.lines'),
          },
    ]
    if (hasCollection) {
      list.push({
        id: 'collection',
        spot: { kind: 'element', target: 'collection' },
        title: t('tour.collection.title'),
        lines: t.list('tour.collection.lines'),
      })
    }
    if (hasDaily) {
      list.push({
        id: 'daily',
        spot: { kind: 'element', target: 'daily' },
        title: t('tour.daily.title'),
        lines: t.list('tour.daily.lines'),
      })
    }
    list.push({
      id: 'lesson',
      spot: { kind: 'element', target: 'lesson' },
      title: t('tour.lesson.title'),
      // 试玩版指着的可能是一张卡（宽屏上教学关那一格），不说「这一条」
      lines: t.list(isDemoBuild ? 'tour.demo.lessonLines' : 'tour.lesson.lines'),
    })
    return list
  }, [hasCollection, hasDaily, t])

  const page = pages[index] ?? pages[0]
  const last = index === pages.length - 1
  const welcome = page.id === 'welcome'
  /*
   * 翻页带一记轻拍，和教学里的「继续」同一记（见 useTutorialCoach 的 next）。
   * 整屏的 catcher 不是按钮，全站那套委托覆盖不到；「继续」标了 data-haptic="self"。
   */
  const advance = useCallback(() => {
    if (last) return
    haptics.step()
    setIndex((i) => i + 1)
  }, [last])

  return (
    <Spotlight
      spot={page.spot}
      rootRef={rootRef}
      cardKey={page.id}
      pages={pages}
      intro={index === 0}
      /* 欢迎那一页是整屏居中的大卡，之后几页各自让开被指着的那一块 */
      place={welcome ? 'center' : 'auto'}
      variant={welcome ? 'welcome' : undefined}
      texture={welcome ? welcomeTexture() : null}
      /*
       * 最后一页仍然挂着 catcher，但点空白处什么也不做：它在这儿的用处是
       * **拦住**其余一切，只在那条入口的位置开个洞（holeInteractive）。
       */
      onTapThrough={advance}
      holeInteractive={last}
      ariaLabel={t('tour.aria')}
      title={page.title}
      lines={page.lines}
    >
      <span className={styles.dots} aria-hidden="true">
        {pages.map((p, i) => (
          <span key={p.id} data-on={i <= index ? 'true' : undefined} />
        ))}
      </span>
      {!last && (
        <button className={styles.next} onClick={advance} data-haptic="self">
          {t('tutorial.next')}
        </button>
      )}
    </Spotlight>
  )
}
