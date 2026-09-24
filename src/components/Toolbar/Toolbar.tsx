import { useT } from '../../i18n'
import { useFitOneLine } from '../../hooks/useFitOneLine'
import { SettingsGear } from '../Settings/SettingsGear'
import { BackIcon } from '../BackIcon'
import { HintIcon } from './HintIcon'
import styles from './Toolbar.module.css'

interface Props {
  onExit: () => void
  /** 缺省是「返回选关」；每日挑战、藏品页等二级入口自己给一句 */
  backLabel?: string
  /** 居中标题：所属章名／册名，都没有才退回棋盘尺寸 */
  title: string
  /** 右上角设置入口 */
  onSettings?: () => void
  /** 提示：指出当前能继续推理的行或列 */
  onHint?: () => void
}

/**
 * 顶栏册名收字号的下界。它是背景信息（我在画哪一本），不是这一屏的主角，
 * 收得比页名再狠一点无妨；到界仍放不下才省略。
 */
const MIN_TITLE_PX = 14

export function Toolbar({ onExit, backLabel, title, onSettings, onHint }: Props) {
  const t = useT()
  const titleRef = useFitOneLine<HTMLHeadingElement>(MIN_TITLE_PX)
  return (
    <header className={styles.toolbar}>
      <button className={styles.back} onClick={onExit} aria-label={backLabel ?? t('game.backLevels')}>
        <BackIcon />
      </button>
      <h1 className={styles.title} ref={titleRef}>
        {title}
      </h1>
      <span className={styles.side}>
        {onHint && (
          <button className={styles.action} onClick={onHint} data-coach="hint" aria-label={t('toolbar.hint')}>
            <HintIcon />
          </button>
        )}
        {onSettings && (
          <button className={styles.action} onClick={onSettings} aria-label={t('toolbar.settings')}>
            <SettingsGear />
          </button>
        )}
      </span>
    </header>
  )
}
