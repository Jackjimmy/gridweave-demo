import { useRef, useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useBackHandler } from './useBackHandler'
import { useModalFocus } from './useModalFocus'
afterEach(cleanup)
function Dialog({ close }: { close: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useBackHandler(close)
  useModalFocus(ref)
  return <div ref={ref} role="dialog" tabIndex={-1}><button>First</button><button disabled>Disabled</button><a href="#end">Last</a></div>
}
function Example() {
  const [open, setOpen] = useState(false)
  return <><button onClick={() => setOpen(true)}>Open</button>{open && <Dialog close={() => setOpen(false)} />}</>
}
it('leaves the background untouched, wraps focus in both directions and restores the trigger', () => {
  render(<Example />)
  const trigger = screen.getByText('Open')
  trigger.focus()
  fireEvent.click(trigger)
  const first = screen.getByText('First')
  const last = screen.getByText('Last')
  expect(document.activeElement).toBe(first)
  expect(trigger.inert).toBeFalsy()
  fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })
  expect(document.activeElement).toBe(last)
  fireEvent.keyDown(last, { key: 'Tab' })
  expect(document.activeElement).toBe(first)
  fireEvent.keyDown(first, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.activeElement).toBe(trigger)
})
function Layer({ close }: { close: () => void }) {
  useBackHandler(close)
  return null
}
it('hands Escape to the top of the back stack, so a layer above the modal closes first', () => {
  function Stacked() {
    const [layer, setLayer] = useState(false)
    return <><Example /><button onClick={() => setLayer(true)}>Stack</button>{layer && <Layer close={() => setLayer(false)} />}</>
  }
  render(<Stacked />)
  fireEvent.click(screen.getByText('Open'))
  fireEvent.click(screen.getByText('Stack'))
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).not.toBeNull()
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
})
it('moves focus in and back without scrolling the page', () => {
  render(<Example />)
  const trigger = screen.getByText('Open')
  trigger.focus()
  const focus = vi.spyOn(HTMLElement.prototype, 'focus')
  fireEvent.click(trigger)
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
  expect(document.activeElement).toBe(trigger)
  expect(focus.mock.calls.length).toBeGreaterThanOrEqual(2)
  for (const [options] of focus.mock.calls) expect(options).toEqual({ preventScroll: true })
  focus.mockRestore()
})
