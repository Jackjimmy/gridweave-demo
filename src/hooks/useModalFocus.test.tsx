import { useRef, useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { useModalFocus } from './useModalFocus'
afterEach(cleanup)
function Dialog({ close }: { close: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useModalFocus(ref, close)
  return <div ref={ref} role="dialog" tabIndex={-1}><button>First</button><button disabled>Disabled</button><a href="#end">Last</a></div>
}
function Example() {
  const [open, setOpen] = useState(false)
  return <><button onClick={() => setOpen(true)}>Open</button>{open && <Dialog close={() => setOpen(false)} />}</>
}
it('isolates background, wraps focus in both directions and restores the trigger', () => {
  render(<Example />)
  const trigger = screen.getByText('Open')
  trigger.focus()
  fireEvent.click(trigger)
  const first = screen.getByText('First')
  const last = screen.getByText('Last')
  expect(document.activeElement).toBe(first)
  expect(trigger.inert).toBe(true)
  fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })
  expect(document.activeElement).toBe(last)
  fireEvent.keyDown(last, { key: 'Tab' })
  expect(document.activeElement).toBe(first)
  fireEvent.keyDown(first, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(trigger.inert).toBeFalsy()
  expect(document.activeElement).toBe(trigger)
})
