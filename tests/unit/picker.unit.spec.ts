// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

const { installNavigationTracking } = await import('@/app/(frontend)/components/navigation')
const { Picker } = await import('@/app/(frontend)/components/ui/Picker')

installNavigationTracking()

/** `matchMedia` for the wide query, switchable while a picker is open. */
let wide = false
const mediaListeners = new Set<() => void>()
function setWide(next: boolean) {
  wide = next
  act(() => mediaListeners.forEach((listener) => listener()))
}

/** A caller that opens the picker with a button, as a screen does. */
function renderPicker(onChoose: (value: string) => void) {
  function Caller() {
    const [open, setOpen] = useState(true)
    return createElement(
      'div',
      null,
      createElement('button', { type: 'button', onClick: () => setOpen(true) }, 'open'),
      createElement(Picker<string>, {
        open,
        onOpenChange: setOpen,
        title: 'Edition',
        options: [
          { value: 'A', label: 'Paperback' },
          { value: 'B', label: 'Hardback' },
        ],
        value: 'A',
        onChoose,
      }),
    )
  }
  render(createElement(Caller))
}

const picker = () => screen.queryByRole('dialog', { name: 'Edition' })
const popState = () => act(() => window.dispatchEvent(new PopStateEvent('popstate')))

describe('Picker', () => {
  let back: MockInstance<History['back']>

  beforeEach(() => {
    window.history.pushState({ page: 'list' }, '', '/')
    back = vi.spyOn(window.history, 'back')
    wide = false
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        media: query,
        get matches() {
          return wide
        },
        addEventListener: (_: string, listener: () => void) => mediaListeners.add(listener),
        removeEventListener: (_: string, listener: () => void) => mediaListeners.delete(listener),
      })),
    )
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    mediaListeners.clear()
  })

  it.each([
    ['Sheet', false],
    ['Dialog', true],
  ])('chooses only after its history entry is gone (%s)', async (_, isWide) => {
    wide = isWide
    back.mockImplementation(() => undefined)
    const onChoose = vi.fn()
    renderPicker(onChoose)
    fireEvent.click(screen.getByRole('button', { name: 'Hardback' }))
    await waitFor(() => expect(back).toHaveBeenCalledTimes(1))
    expect(onChoose).not.toHaveBeenCalled()

    popState()
    expect(onChoose).toHaveBeenCalledExactlyOnceWith('B')
    popState()
    expect(onChoose).toHaveBeenCalledTimes(1)
  })

  it('closes without a choice on the chosen row', async () => {
    const onChoose = vi.fn()
    renderPicker(onChoose)
    fireEvent.click(screen.getByRole('button', { name: 'Paperback' }))
    await waitFor(() => expect(picker()).toBeNull())
    await waitFor(() => expect(back).toHaveBeenCalledTimes(1))
    expect(onChoose).not.toHaveBeenCalled()
  })

  it('closes on Back without a choice', async () => {
    const onChoose = vi.fn()
    renderPicker(onChoose)
    act(() => window.history.back())
    await waitFor(() => expect(picker()).toBeNull())
    expect(back).toHaveBeenCalledTimes(1)
    expect(onChoose).not.toHaveBeenCalled()
  })

  it('keeps the form it opened in until it closes', async () => {
    wide = true
    renderPicker(() => undefined)
    // The Dialog: Cancel in its foot, no sheet handle.
    expect(screen.getByRole('button', { name: 'cancel' })).toBeTruthy()
    setWide(false)
    expect(screen.getByRole('button', { name: 'cancel' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'expand' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'cancel' }))
    await waitFor(() => expect(picker()).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'open' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'expand' })).toBeTruthy())
    expect(screen.queryByRole('button', { name: 'cancel' })).toBeNull()
  })
})
