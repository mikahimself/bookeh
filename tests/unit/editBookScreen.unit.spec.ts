// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createElement, Fragment } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const show = vi.fn()
const dismiss = vi.fn()
const editBookAction = vi.fn()
// Back as the browser does it, so a close lands on the entry below.
const router = { back: vi.fn(() => window.history.back()), replace: vi.fn() }

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}.${key}` : key,
}))
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => router,
}))
vi.mock('@/app/(frontend)/books/[bookId]/edit/actions', () => ({ editBookAction }))
vi.mock('@/app/(frontend)/components/toast/ToastProvider', () => ({
  useToast: () => ({ show, dismiss }),
}))

const { installNavigationTracking, OVERLAY_TOKENS_KEY, TaskBase } =
  await import('@/app/(frontend)/components/navigation')
const { EditBookScreen } = await import('@/app/(frontend)/books/[bookId]/edit/EditBookScreen')
const { NotHeld } = await import('@/app/(frontend)/books/[bookId]/edit/NotHeld')

installNavigationTracking()

const KEY = 'bookeh:edit-book:7'
const PATH = '/books/7/edit'

const open = (draft?: object) => {
  if (draft) window.sessionStorage.setItem(KEY, JSON.stringify(draft))
  render(
    createElement(
      Fragment,
      null,
      createElement(TaskBase),
      createElement(EditBookScreen, {
        bookId: 7,
        title: 'Kotiseutu',
        authors: 'A. Kirjoittaja',
        source: 'From Finna',
        cover: null,
      }),
    ),
  )
}

/** The Back guard's entry is the current one. */
const guarded = () => OVERLAY_TOKENS_KEY in (window.history.state as object)
const save = () => fireEvent.click(screen.getByRole('button', { name: 'editBook.save' }))
const discardAsked = () => screen.findByRole('dialog', { name: 'editBook.discardTitle' })

describe('EditBookScreen', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/')
    window.history.pushState({}, '', PATH)
    window.sessionStorage.clear()
  })

  afterEach(async () => {
    cleanup()
    vi.clearAllMocks()
    // Let a close's traversal settle, so the next test's close is live.
    await new Promise((resolve) => setTimeout(resolve, 50))
  })

  it('saves the stored draft, shows "Saved", closes and clears the draft', async () => {
    editBookAction.mockResolvedValue({ ok: true, data: null })
    open({ year: 2015 })
    await waitFor(() => expect(guarded()).toBe(true))
    save()

    await waitFor(() => expect(window.location.pathname).toBe('/'))
    expect(editBookAction).toHaveBeenCalledWith({ bookId: 7, edits: { year: 2015 } })
    expect(show).toHaveBeenCalledWith({ kind: 'success', message: 'toast.saved' })
    expect(window.sessionStorage.getItem(KEY)).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('goes to sign in from the task entry when signed out and keeps the draft', async () => {
    editBookAction.mockResolvedValue({ ok: false, code: 'UNAUTHENTICATED' })
    let replacedGuard: boolean | undefined
    router.replace.mockImplementationOnce(() => {
      replacedGuard = guarded()
    })
    open({ year: 2015 })
    await waitFor(() => expect(guarded()).toBe(true))
    save()

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith(`/login?next=${encodeURIComponent(PATH)}`),
    )
    expect(replacedGuard).toBe(false)
    expect(window.sessionStorage.getItem(KEY)).toBe(JSON.stringify({ year: 2015 }))
  })

  it('reports a rejected field, stays and keeps the draft', async () => {
    editBookAction.mockResolvedValue({
      ok: false,
      code: 'VALIDATION',
      fields: { title: 'VALIDATION' },
    })
    open({ title: ' ' })
    save()

    await waitFor(() => expect(show).toHaveBeenCalledWith({ kind: 'error', code: 'VALIDATION' }))
    expect(window.location.pathname).toBe(PATH)
    expect(window.sessionStorage.getItem(KEY)).toBe(JSON.stringify({ title: ' ' }))
  })

  it('asks before the X leaves changes, and Discard clears them and closes', async () => {
    open({ year: 2015 })
    await waitFor(() => expect(guarded()).toBe(true))
    fireEvent.click(screen.getByRole('button', { name: 'task.close' }))
    fireEvent.click(within(await discardAsked()).getByRole('button', { name: 'editBook.discard' }))

    await waitFor(() => expect(window.location.pathname).toBe('/'))
    expect(window.sessionStorage.getItem(KEY)).toBeNull()
  })

  it('closes at once from the X with no changes', async () => {
    open()
    expect(guarded()).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'task.close' }))

    await waitFor(() => expect(window.location.pathname).toBe('/'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('asks on Back with changes, and Discard clears them and closes', async () => {
    open({ year: 2015 })
    await waitFor(() => expect(guarded()).toBe(true))
    act(() => window.history.back())
    fireEvent.click(within(await discardAsked()).getByRole('button', { name: 'editBook.discard' }))

    await waitFor(() => expect(window.location.pathname).toBe('/'))
    expect(window.sessionStorage.getItem(KEY)).toBeNull()
  })

  it('asks on Back with changes; Cancel stays and Back asks again', async () => {
    open({ year: 2015 })
    await waitFor(() => expect(guarded()).toBe(true))
    act(() => window.history.back())
    const dialog = await discardAsked()
    fireEvent.click(within(dialog).getByRole('button', { name: 'overlay.cancel' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(guarded()).toBe(true))
    expect(window.location.pathname).toBe(PATH)

    act(() => window.history.back())
    expect(await discardAsked()).toBeTruthy()
    expect(window.location.pathname).toBe(PATH)
  })
})

describe('NotHeld', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('shows "Not in library" and replaces with the section', () => {
    render(createElement(NotHeld))

    expect(show).toHaveBeenCalledWith({ kind: 'success', message: 'answer.notInLibrary' })
    expect(router.replace).toHaveBeenCalledWith('/')
  })
})
