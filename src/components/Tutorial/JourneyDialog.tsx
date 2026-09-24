import { useEffect, useId, useRef } from 'react'
import { useBackHandler } from '../../hooks/useBackHandler'
import { useT } from '../../i18n'
import styles from './JourneyDialog.module.css'

interface Props {
  title: string
  description: string
  action: string
  onAction: () => void
  alternative: string
  onAlternative: () => void
  onClose: () => void
}

/** 原生 dialog 提供焦点圈定与背景 inert；返回只关闭这一层。 */
export function JourneyDialog({ title, description, action, onAction, alternative, onAlternative, onClose }: Props) {
  const t = useT()
  const ref = useRef<HTMLDialogElement>(null)
  const id = useId()
  useBackHandler(onClose)
  useEffect(() => {
    const dialog = ref.current!
    const previous = document.activeElement as HTMLElement | null
    dialog.showModal()
    dialog.querySelector<HTMLButtonElement>('[data-primary]')?.focus()
    return () => {
      dialog.close()
      if (previous?.isConnected) previous.focus({ preventScroll: true })
    }
  }, [])
  return (
    <dialog ref={ref} className={styles.dialog} aria-labelledby={id} aria-describedby={`${id}-body`}
      onCancel={(event) => { event.preventDefault(); onClose() }}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return
        const buttons = ref.current!.querySelectorAll<HTMLButtonElement>('button')
        const first = buttons[0]
        const last = buttons[buttons.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }}>
      <button type="button" className={styles.close} aria-label={t('common.back')} onClick={onClose}>×</button>
      <h2 id={id}>{title}</h2>
      <p id={`${id}-body`}>{description}</p>
      <div className={styles.actions}>
        <button type="button" data-primary className={styles.primary} onClick={onAction}>{action}</button>
        <button type="button" onClick={onAlternative}>{alternative}</button>
      </div>
    </dialog>
  )
}
