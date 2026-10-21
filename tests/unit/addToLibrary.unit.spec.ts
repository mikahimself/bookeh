// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Activity, type ActivityProps, createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const back = vi.fn()
const replace = vi.fn()
const refresh = vi.fn()
const show = vi.fn()
const saveCopyAction = vi.fn()

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: { location: string }) =>
    values ? `${key}:${values.location}` : key,
}))
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ replace, refresh }),
}))
vi.mock('@/app/(frontend)/components/navigation', () => ({ useTaskBack: () => back }))
vi.mock('@/app/(frontend)/scan/actions', () => ({ saveCopyAction }))
vi.mock('@/app/(frontend)/components/toast/ToastProvider', () => ({
  useToast: () => ({ show, dismiss: vi.fn() }),
}))

const { AddToLibrary } = await import('@/app/(frontend)/scan/AddToLibrary')

const ISBN = '9789510397077'

const saved = (savedTo: { id: number; name: string } | null) => ({
  ok: true,
  data: { bookId: 1, copyId: 2, savedTo, undoToken: 'token', undoSeconds: 1800 },
})

const button = () => screen.getByRole<HTMLButtonElement>('button', { name: 'answer.addToLibrary' })

const deferred = () => {
  let resolve!: (value: unknown) => void
  const promise = new Promise((r) => (resolve = r))
  return { promise, resolve }
}

const requestIds = () =>
  saveCopyAction.mock.calls.map(([input]) => (input as { requestId: string }).requestId)

describe('AddToLibrary', () => {
  afterEach(() => {
    cleanup()
    vi.resetAllMocks()
  })

  it.each([
    ['Saved to {location}', { id: 3, name: 'Tampere' }, 'toast.savedTo:Tampere'],
    ['Saved with no location', null, 'toast.saved'],
  ])('shows the held %s toast and goes back to Scan', async (_, savedTo, message) => {
    saveCopyAction.mockResolvedValue(saved(savedTo))
    render(createElement(AddToLibrary, { isbn13: ISBN }))
    fireEvent.click(button())

    await waitFor(() => expect(back).toHaveBeenCalledTimes(1))
    expect(show).toHaveBeenCalledWith({
      kind: 'success',
      message,
      hold: true,
      undo: { token: 'token', seconds: 1800 },
    })
    expect(saveCopyAction).toHaveBeenCalledWith({ requestId: expect.any(String), isbn13: ISBN })
  })

  it('sends the picked edition', async () => {
    saveCopyAction.mockResolvedValue(saved(null))
    render(createElement(AddToLibrary, { isbn13: ISBN, pick: 1 }))
    fireEvent.click(button())

    await waitFor(() => expect(back).toHaveBeenCalledTimes(1))
    expect(saveCopyAction).toHaveBeenCalledWith({
      requestId: expect.any(String),
      isbn13: ISBN,
      pick: 1,
    })
  })

  it('makes one call for a double tap', async () => {
    const call = deferred()
    saveCopyAction.mockReturnValue(call.promise)
    render(createElement(AddToLibrary, { isbn13: ISBN }))
    // One act: the second click lands before `pending` disables the button.
    act(() => {
      button().click()
      button().click()
    })

    call.resolve(saved(null))
    await waitFor(() => expect(back).toHaveBeenCalled())
    expect(saveCopyAction).toHaveBeenCalledTimes(1)
  })

  it('reports a failed save, stays, and retries with the same requestId', async () => {
    saveCopyAction.mockResolvedValueOnce({ ok: false, code: 'SAVE_FAILED' })
    const tree = (mode: 'visible' | 'hidden') =>
      createElement(
        Activity,
        { mode } as ActivityProps,
        createElement(AddToLibrary, { isbn13: ISBN }),
      )
    const view = render(tree('visible'))
    fireEvent.click(button())

    await waitFor(() => expect(show).toHaveBeenCalledWith({ kind: 'error', code: 'SAVE_FAILED' }))
    await waitFor(() => expect(button().disabled).toBe(false))
    expect(back).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()

    saveCopyAction.mockResolvedValue(saved(null))
    fireEvent.click(button())
    await waitFor(() => expect(back).toHaveBeenCalledTimes(1))

    // Latched after a success: leaving the Answer can take a round trip.
    fireEvent.click(button())
    await act(async () => undefined)
    expect(saveCopyAction).toHaveBeenCalledTimes(2)

    // A revived instance saves again, and a success dropped the id: a new save.
    view.rerender(tree('hidden'))
    view.rerender(tree('visible'))
    fireEvent.click(button())
    await waitFor(() => expect(saveCopyAction).toHaveBeenCalledTimes(3))
    const [first, retry, next] = requestIds()
    expect(retry).toBe(first)
    expect(next).not.toBe(first)
  })

  it('re-renders the address on NOT_FOUND, with no toast and no return', async () => {
    saveCopyAction.mockResolvedValue({ ok: false, code: 'NOT_FOUND' })
    render(createElement(AddToLibrary, { isbn13: ISBN }))
    fireEvent.click(button())

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
    expect(show).not.toHaveBeenCalled()
    expect(back).not.toHaveBeenCalled()
  })

  it('goes to sign in, back to this address, when the session is gone', async () => {
    window.history.replaceState(null, '', `/scan?isbn=${ISBN}`)
    saveCopyAction.mockResolvedValue({ ok: false, code: 'UNAUTHENTICATED' })
    render(createElement(AddToLibrary, { isbn13: ISBN }))
    fireEvent.click(button())

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(
        `/login?next=${encodeURIComponent(`/scan?isbn=${ISBN}`)}`,
      ),
    )
    expect(back).not.toHaveBeenCalled()
    expect(show).not.toHaveBeenCalled()
  })

  it('shows No connection when the call rejects', async () => {
    saveCopyAction.mockRejectedValue(new TypeError('Failed to fetch'))
    render(createElement(AddToLibrary, { isbn13: ISBN }))
    fireEvent.click(button())

    await waitFor(() => expect(show).toHaveBeenCalledWith({ kind: 'error', code: 'NO_CONNECTION' }))
    expect(back).not.toHaveBeenCalled()
  })

  it('shows the toast but does not navigate once the Answer is gone', async () => {
    const call = deferred()
    saveCopyAction.mockReturnValue(call.promise)
    const view = render(createElement(AddToLibrary, { isbn13: ISBN }))
    fireEvent.click(button())
    view.unmount()

    call.resolve(saved(null))
    await waitFor(() =>
      expect(show).toHaveBeenCalledWith({
        kind: 'success',
        message: 'toast.saved',
        hold: true,
        undo: { token: 'token', seconds: 1800 },
      }),
    )
    expect(back).not.toHaveBeenCalled()
  })
})
