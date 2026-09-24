import { useMemo } from 'react'
import type { RefObject } from 'react'
import { useBackHandler } from '../../hooks/useBackHandler'
import { useT } from '../../i18n'
import type { Coach } from './useTutorialCoach'
import { Spotlight } from './Spotlight'
import styles from './Spotlight.module.css'

interface Props {
  learningNote?: string | null
  coach: Coach
  /** 量位置用的根节点：棋盘、数字、操作条都在里面 */
  rootRef: RefObject<HTMLElement | null>
}

/**
 * 新手教学的教练层。
 *
 * 只讲不做的几页：压暗四周留出要认的那一块，整屏接管点按——**点哪儿都是继续**。
 * 那几页玩家没有别的事可做，把「下一步」缩进一枚小按钮里只会让人找。
 *
 * 轮到动手的几页：这一层只剩一张卡片。不压暗、不拦截，撤销清空切换提示都能真按，
 * 要涂的那几格由棋盘自己的提示高亮指出来（见 coachScript 的 stepView）。
 *
 * 压暗、开洞、把卡片摆到没被用到的那一半，都归 Spotlight；这里只管说什么、
 * 底下摆什么、什么时候翻页。
 */
export function TutorialCoach({ coach, rootRef, learningNote }: Props) {
  const t = useT()
  const { step } = coach
  /*
   * 安卓返回键当「跳过」用，而不是穿过去退出关卡。
   *
   * 教学期间按返回，意思是「先不学了」——让它退出关卡，玩家会连着丢掉这一局；
   * 何况教学没走完不算看过，下次进来还会自动开讲，等于绕回原地。
   */
  useBackHandler(coach.skip, coach.active)

  /*
   * 整轮会翻到的每一页：文案，外加那一页压暗时指着哪一块。Spotlight 拿它把
   * 整轮的占地量成一个数，一次定死卡片站哪儿——不然「这一页两行、下一页一行」
   * 会让卡片一步一跳（见那边的长注释）。
   */
  const pages = useMemo(
    () =>
      coach.steps.map((s) => ({
        title: t(s.titleKey),
        lines: t.list(s.linesKey),
        spot: s.dim ?? null,
      })),
    [coach.steps, t],
  )

  if (!step) return null

  return (
    <Spotlight
      spot={coach.dim}
      rootRef={rootRef}
      cardKey={step.id}
      pages={pages}
      /*
       * 摆哪一半交给 'auto'：开场认盘那一页从下方升起（画在上半屏，话就摆下面），
       * 指着操作条的几页和动手的几页摆上面。摆下面那一档挤不下时（横屏），
       * Spotlight 会把整轮抬到上面去。
       *
       * 这曾经被钉死成一律摆上面，因为上下两侧的留白各自参与棋盘的尺寸公式，
       * 翻过那一页画就换一个大小。现在这一层不再往棋盘身上写任何东西了
       * （见 Game.module.css 的 .boardScroll 与 Spotlight 的 fitCard），
       * 摆法换来换去也只动卡片自己。
       */
      place="auto"
      intro={coach.index === 0}
      onTapThrough={coach.reading ? coach.next : null}
      holeInteractive={step.interactive}
      ariaLabel={t('tutorial.aria')}
      title={t(step.titleKey)}
      lines={learningNote ? [learningNote] : t.list(step.linesKey)}
    >
      <button className={styles.skip} onClick={coach.skip}>
        {t('tutorial.skip')}
      </button>
      <span className={styles.dots} aria-hidden="true">
        {Array.from({ length: coach.total }, (_, i) => (
          <span key={i} data-on={i <= coach.index ? 'true' : undefined} />
        ))}
      </span>
      {coach.reading ? (
        /* coach.next 自己带一记 step()——整屏 catcher 那条路不是按钮，
           委托覆盖不到，只能留在 next 里；所以这个按钮退出委托免得叠两记。
           「跳过」不带，交给委托就够。 */
        <button className={styles.next} onClick={coach.next} data-haptic="self">
          {t('tutorial.next')}
        </button>
      ) : (
        /*
          轮到玩家的时候不摆按钮：这一步的「下一步」就是把那几格涂上。
          这里实时报还差几格，省得他自己数，也让「还没完」有个说法。
        */
        <span className={styles.turn} role="status">
          {coach.remaining > 0 ? t('tutorial.remaining', { count: coach.remaining }) : t('tutorial.ok')}
        </span>
      )}
    </Spotlight>
  )
}
