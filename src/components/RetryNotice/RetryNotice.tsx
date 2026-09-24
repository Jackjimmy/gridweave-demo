import { useT } from '../../i18n'
import { retryI18n, useI18nBootState } from '../../i18n/boot'
import { useSaveFailure } from '../../hooks/useSaveFailure'
import styles from './RetryNotice.module.css'

/**
 * 「这一份没拉到，再试一次」——按需资源出岔子时唯一的出口。
 *
 * 这个包里所有按需资源都跑同一条链路：加载中 → 成功 / 可恢复的错误 → 重试 → 成功
 * （缓存那一半见 utils/lazyResource）。这里是那条链路露在界面上的那一截：说清楚
 * 缺的是什么，给一个能当场再试一次的按钮，并且在重试期间明确地「正在试」，
 * 免得人一秒点五下。
 *
 * 不是模态框，故意的。资源没到手不等于人不能做别的事——语言降级了照样能解题，
 * 一册没取回来照样能翻别的册。所以它是压在底部的一条，不吃点击、不进返回栈
 * （没有返回键要拦的东西，按返回就该照常退页）。
 */
interface Props {
  /** 缺的是什么、能怎么办，一句话说完 */
  message: string
  onRetry: () => void
  /** 正在重试：按钮换字并禁用，重复点击不会再发一趟 */
  retrying: boolean
  /** 有它才摆「知道了」。没有出口的提示不摆——那是赖着不走的一条 */
  onDismiss?: () => void
}

export function RetryNotice({ message, onRetry, retrying, onDismiss }: Props) {
  const t = useT()
  return (
    /* role=status 而不是 alert：这是一条「有件事没办成」的通报，不打断读屏当前在念的东西 */
    <div className={styles.notice} role="status">
      <p className={styles.message}>{message}</p>
      <div className={styles.actions}>
        {onDismiss && (
          <button type="button" className={styles.dismiss} onClick={onDismiss}>
            {t('load.dismiss')}
          </button>
        )}
        <button type="button" className={styles.retry} onClick={onRetry} disabled={retrying}>
          {retrying ? t('load.retrying') : t('load.retry')}
        </button>
      </div>
    </div>
  )
}

/** 一关的画没拉到。retrying 时那一关的块正在重新取（见 App 的 selectPuzzle） */
export interface PuzzleLoadFailure {
  puzzleId: string
  retrying: boolean
}

interface StackProps {
  puzzleFailure: PuzzleLoadFailure | null
  onRetryPuzzle: () => void
  onDismissPuzzle: () => void
}

/**
 * 全部按需资源提示的落脚处，挂在页面层之外——它得在任何一层上都看得见，
 * 而藏着的那一层是 inert 的（见 App 的 slots）。
 *
 * 语言那一条自己订阅开机状态，不从 App 穿参数下来：它与页面层级毫无关系，
 * 从开机降级那一刻起就该在，直到重试成功为止。它也不给「知道了」——降级期间
 * 整屏是英文，人要的正是那个按钮，收掉它就等于把语言永久钉死在英文上。
 *
 * 「进度没能保存」同理自己订阅存储层：写失败可能发生在对局、每日挑战或通关记录
 * 任何一处，但对玩家是同一件事——你现在做的事没被保存。它给「知道了」，
 * 因为写不进去并不妨碍继续解题，横幅不该一直压在棋盘上。
 */
export function ResourceRetryNotices({
  puzzleFailure,
  onRetryPuzzle,
  onDismissPuzzle,
}: StackProps) {
  const t = useT()
  const i18n = useI18nBootState()
  const save = useSaveFailure()
  if (!i18n.degraded && !puzzleFailure && !save.visible) return null
  return (
    <div className={styles.stack}>
      {i18n.degraded && (
        <RetryNotice
          message={t('load.languageFailed')}
          retrying={i18n.retrying}
          onRetry={() => void retryI18n()}
        />
      )}
      {puzzleFailure && (
        <RetryNotice
          message={t('load.puzzleFailed')}
          retrying={puzzleFailure.retrying}
          onRetry={onRetryPuzzle}
          onDismiss={onDismissPuzzle}
        />
      )}
      {save.visible && (
        /*
         * key 带上重试次数：写 localStorage 是同步的，重试没成功时这一条从头到尾
         * 没有任何变化，读屏也就不会再念一遍。换 key 等于重新挂一条 role=status，
         * 「我按了，还是没成」这件事因此说得出口。
         */
        <RetryNotice
          key={save.attempts}
          message={t('save.failed')}
          retrying={false}
          onRetry={save.retry}
          onDismiss={save.dismiss}
        />
      )}
    </div>
  )
}
