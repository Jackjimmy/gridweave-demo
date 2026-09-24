import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { useBackHandler } from '../../hooks/useBackHandler'
import styles from './ConfirmSheet.module.css'

interface Props {
  /** 对话框的无障碍名，通常就是面板里那句问话 */
  label: string
  /** 面板正文：问话本身，以及调用方要摆的这一局的成绩之类 */
  children: ReactNode
  /** 问话下面那行灰字：说清确认之后会失去什么 */
  description: string
  confirmLabel: string
  onConfirm: () => void
  cancelLabel: string
  onCancel: () => void
}

/**
 * 从底部升起的二次确认面板。
 *
 * 只给**做了就收不回来**的那一下用。护栏要跟代价成正比——撤销、切换工具这些
 * 随手能退回去的操作一概不问；清掉一盘推了二十分钟的棋，问。
 *
 * 默认焦点落在取消上，不落在确认上：会弹出这张面板，前提就是上一下有可能是误触，
 * 那么默认选项就该是「什么都没发生」。点面板外、Esc、安卓返回键同样走取消。
 */
export function ConfirmSheet({
  label,
  children,
  description,
  confirmLabel,
  onConfirm,
  cancelLabel,
  onCancel,
}: Props) {
  useBackHandler(onCancel)

  // 桌面端也得走得掉：这一层没有常驻的关闭键，Esc 是唯一的键盘出口
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={onCancel}
    >
      <section className={styles.sheet} onClick={(event) => event.stopPropagation()}>
        <span className={styles.grabber} aria-hidden="true" />
        {children}
        <p className={styles.description}>{description}</p>
        <div className={styles.actions}>
          <button className={styles.confirm} type="button" onClick={onConfirm}>
            {confirmLabel}
          </button>
          <button className={styles.cancel} type="button" autoFocus onClick={onCancel}>
            {cancelLabel}
          </button>
        </div>
      </section>
    </div>
  )
}
