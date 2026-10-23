// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement, StrictMode, useState, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
// Next's replace, as far as the history goes: the current entry takes the new address.
const replace = vi.hoisted(() =>
  vi.fn((href: string) => window.history.replaceState(window.history.state, '', href)),
)
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }))

const { installNavigationTracking, OVERLAY_TOKENS_KEY } =
  await import('@/app/(frontend)/components/navigation')
const { swipeSuspended } = await import('@/app/(frontend)/components/swipe')
const { Dialog } = await import('@/app/(frontend)/components/ui/Dialog')
const { Sheet } = await import('@/app/(frontend)/components/ui/Sheet')

// As in the app: every push and replace goes through the tracker, Next's too.
installNavigationTracking()

/** A Dialog the caller closes from its confirm button, as a confirm handler does. */
function CallerDialog() {
  const [open, setOpen] = useState(true)
  return createElement(
    Dialog,
    {
      open,
      onOpenChange: setOpen,
      title: 'Discard changes?',
      confirm: createElement('button', { type: 'button', onClick: () => setOpen(false) }, 'ok'),
    },
    'body',
  )
}

/** A Sheet the caller opens with a button and closes through `onOpenChange`. */
function CallerSheet() {
  const [open, setOpen] = useState(true)
  return createElement(
    'div',
    null,
    createElement('button', { type: 'button', onClick: () => setOpen(true) }, 'open'),
    createElement(Sheet, { open, onOpenChange: setOpen, label: 'Book' }, 'content'),
  )
}

const dialog = (title: string, children?: ReactNode) =>
  createElement(
    Dialog,
    { open: true, onOpenChange: () => undefined, title, confirm: null },
    children,
  )
const sheet = (children: ReactNode) =>
  createElement(Sheet, { open: true, onOpenChange: () => undefined, label: 'Book' }, children)

const overlayEntries = (spy: MockInstance<History['pushState']>) =>
  spy.mock.calls.filter(([state]) => JSON.stringify(state).includes(OVERLAY_TOKENS_KEY)).length
/** Whether the current entry is the pre-open one: the list's, without overlay tokens. */
const onListEntry = () =>
  (window.history.state as { page?: string }).page === 'list' &&
  !(OVERLAY_TOKENS_KEY in (window.history.state as object))

describe('overlay wrappers', () => {
  let back: MockInstance<History['back']>
  let push: MockInstance<History['pushState']>
  let start: number

  beforeEach(() => {
    // A push, not a replace: a same-URL replace would carry the tokens of an
    // overlay the previous test left open.
    window.history.pushState({ page: 'list' }, '', '/')
    start = window.history.length
    back = vi.spyOn(window.history, 'back')
    push = vi.spyOn(window.history, 'pushState')
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('pushes one same-URL entry that keeps the current state', () => {
    render(createElement(CallerDialog))
    expect(overlayEntries(push)).toBe(1)
    expect(window.history.length).toBe(start + 1)
    expect(window.location.pathname).toBe('/')
    expect(window.history.state).toMatchObject({ page: 'list' })
  })

  it('closes on Back without going back again', async () => {
    render(createElement(CallerDialog))
    act(() => window.history.back())
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(onListEntry()).toBe(true)
    expect(back).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['Cancel', () => fireEvent.click(screen.getByRole('button', { name: 'cancel' }))],
    ['the caller', () => fireEvent.click(screen.getByRole('button', { name: 'ok' }))],
    ['Esc', () => fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })],
  ])('pops its entry once when %s closes it', async (_, close) => {
    render(createElement(CallerDialog))
    close()
    await waitFor(() => expect(onListEntry()).toBe(true))
    expect(back).toHaveBeenCalledTimes(1)
  })

  it('pops the entry once when the Sheet X closes it', async () => {
    render(createElement(CallerSheet))
    fireEvent.click(screen.getByRole('button', { name: 'close' }))
    await waitFor(() => expect(onListEntry()).toBe(true))
    expect(back).toHaveBeenCalledTimes(1)
  })

  it('still pops its entry after Next replaces it with a fresh state', async () => {
    render(createElement(CallerDialog))
    act(() => window.history.replaceState({ __NA: true }, ''))
    fireEvent.click(screen.getByRole('button', { name: 'ok' }))
    await waitFor(() => expect(back).toHaveBeenCalledTimes(1))
  })

  it('lands on the address a same-path replace moved it to when Back closes it', async () => {
    render(createElement(CallerSheet))
    act(() => window.history.replaceState({ __NA: true }, '', '/?location=3'))
    act(() => window.history.back())
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(replace).toHaveBeenCalledWith('/?location=3', { scroll: false })
    expect(`${window.location.pathname}${window.location.search}`).toBe('/?location=3')
    expect(OVERLAY_TOKENS_KEY in (window.history.state as object)).toBe(false)
  })

  it('lands on the address a same-path replace moved it to when the X closes it', async () => {
    replace.mockClear()
    render(createElement(CallerSheet))
    act(() => window.history.replaceState({ __NA: true }, '', '/?location=3'))
    fireEvent.click(screen.getByRole('button', { name: 'close' }))
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/?location=3', { scroll: false }))
    expect(back).toHaveBeenCalledTimes(1)
    expect(`${window.location.pathname}${window.location.search}`).toBe('/?location=3')
    expect(OVERLAY_TOKENS_KEY in (window.history.state as object)).toBe(false)
  })

  it('does not go back after a navigation', () => {
    render(createElement(CallerDialog))
    act(() => window.history.pushState({ page: 'elsewhere' }, '', '/elsewhere'))
    fireEvent.click(screen.getByRole('button', { name: 'ok' }))
    expect(back).not.toHaveBeenCalled()
    expect(window.location.pathname).toBe('/elsewhere')
  })

  it('pushes once under StrictMode and stays open', async () => {
    render(createElement(StrictMode, null, createElement(CallerDialog)))
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)))
    expect(overlayEntries(push)).toBe(1)
    expect(back).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('allows a dialog inside a sheet', () => {
    render(sheet(dialog('Remove copy?')))
    expect(screen.getByRole('dialog', { name: 'Remove copy?' })).toBeTruthy()
  })

  it('closes only the dialog on Back from a dialog inside a sheet', async () => {
    function SheetWithDialog() {
      const [sheetOpen, setSheetOpen] = useState(true)
      const [dialogOpen, setDialogOpen] = useState(true)
      return createElement(
        Sheet,
        { open: sheetOpen, onOpenChange: setSheetOpen, label: 'Book' },
        createElement(Dialog, {
          open: dialogOpen,
          onOpenChange: setDialogOpen,
          title: 'Remove copy?',
          confirm: null,
        }),
      )
    }
    render(createElement(SheetWithDialog))
    expect(overlayEntries(push)).toBe(2)
    act(() => window.history.back())
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Remove copy?' })).toBeNull())
    expect(screen.getByRole('dialog', { name: 'Book' })).toBeTruthy()
  })

  it.each([
    ['two deep', () => sheet(dialog('Outer', dialog('Inner')))],
    ['inside a top-level dialog', () => dialog('Outer', dialog('Inner'))],
  ])('throws for an overlay %s', (_, tree) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(() => render(tree())).toThrow(/UX-DR9/)
  })

  it('opens fully from the handle and half open again after a close', async () => {
    render(createElement(CallerSheet))
    const book = () => screen.getByRole('dialog', { name: 'Book' })
    fireEvent.click(screen.getByRole('button', { name: 'expand' }))
    await waitFor(() => expect(book().hasAttribute('data-expanded')).toBe(true))
    act(() => window.history.back())
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'open' }))
    await waitFor(() => expect(book().hasAttribute('data-expanded')).toBe(false))
  })

  it('suspends section swiping only while the sheet is open', async () => {
    render(createElement(CallerSheet))
    expect(swipeSuspended()).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(swipeSuspended()).toBe(false)
  })
})
