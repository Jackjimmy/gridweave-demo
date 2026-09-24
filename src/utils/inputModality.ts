/**
 * Track input before component handlers can cancel compatibility mouse/click events.
 * Focus itself is not evidence of keyboard use: touch and delayed focus() also cause it.
 * No initial override: assistive-technology focus keeps the browser's default behavior.
 */
export function isPointerInput(): boolean {
  return document.documentElement.dataset.inputModality === 'pointer'
}

export const INPUT_MODALITY_CHANGE = 'inputmodalitychange'

export function installInputModality(): () => void {
  const root = document.documentElement
  const previous = root.getAttribute('data-input-modality')
  const update = (mode: 'pointer' | 'keyboard') => {
    if (root.dataset.inputModality === mode) return
    root.dataset.inputModality = mode
    document.dispatchEvent(new Event(INPUT_MODALITY_CHANGE))
  }
  const pointer = () => update('pointer')
  const keyboard = (event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey ||
        ['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) return
    update('keyboard')
  }
  const options = { capture: true, passive: true }
  document.addEventListener('pointerdown', pointer, options)
  document.addEventListener('touchstart', pointer, options)
  document.addEventListener('mousedown', pointer, options)
  document.addEventListener('keydown', keyboard, true)
  return () => {
    document.removeEventListener('pointerdown', pointer, true)
    document.removeEventListener('touchstart', pointer, true)
    document.removeEventListener('mousedown', pointer, true)
    document.removeEventListener('keydown', keyboard, true)
    if (previous === null) root.removeAttribute('data-input-modality')
    else root.setAttribute('data-input-modality', previous)
  }
}
