import { useEffect } from 'react'
import type { RefObject } from 'react'

/** Isolate a mounted modal and return focus to its trigger after exit. */
export function useModalFocus(ref: RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previous = new Map<HTMLElement, boolean>()
    let branch: HTMLElement = dialog
    while (branch.parentElement) {
      for (const sibling of branch.parentElement.children) {
        if (sibling instanceof HTMLElement && sibling !== branch) {
          previous.set(sibling, sibling.inert)
          sibling.inert = true
        }
      }
      branch = branch.parentElement
      if (branch === document.body) break
    }
    const focusable = () => [...dialog.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]')]
      .filter(node => node.tabIndex >= 0 && !node.matches(':disabled') && !node.closest('[hidden], [inert], [aria-hidden="true"]') && getComputedStyle(node).display !== 'none' && getComputedStyle(node).visibility !== 'hidden')
    const first = () => (focusable()[0] ?? dialog).focus()
    first()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return }
      if (event.key !== 'Tab') return
      const nodes = focusable()
      const active = document.activeElement
      if (!nodes.length) { event.preventDefault(); dialog.focus(); return }
      if (!dialog.contains(active) || (event.shiftKey ? active === nodes[0] : active === nodes[nodes.length - 1])) {
        event.preventDefault(); (event.shiftKey ? nodes[nodes.length - 1] : nodes[0]).focus()
      }
    }
    const onFocus = (event: FocusEvent) => { if (!dialog.contains(event.target as Node)) first() }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('focusin', onFocus)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('focusin', onFocus)
      previous.forEach((inert, node) => { node.inert = inert })
      if (trigger?.isConnected) trigger.focus()
    }
  }, [ref, close])
}
