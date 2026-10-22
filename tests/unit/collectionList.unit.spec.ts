// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement, useEffect, type ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { EffectiveBook } from '@/lib/books/effectiveBook'
import type { ActionResult } from '@/lib/errors'
import type { ShelfQuery, ShelfRow, ShelfRows } from '@/lib/shelf/query'

import en from '../../messages/en.json'

// The client list over a stubbed `fetch` and `IntersectionObserver` (AD-7):
// the next range appended without a held copy twice, no request with all
// held, and a reload of rows 0..n after Undo and after `afterAction`.

const undoAction = vi.fn()
// Stable, as Next's router is: the list's callbacks must not change per render.
const router = { replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }

vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>()
  const { default: messages } = await import('../../messages/en.json')
  return {
    ...actual,
    useTranslations: (namespace?: string) =>
      actual.createTranslator({ locale: 'en', messages, namespace: namespace as 'collection' }),
  }
})
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => router,
  usePathname: () => '/',
}))
vi.mock('@/app/(frontend)/actions/undo', () => ({ undoAction }))

/** Every observer made, with the elements it watches. */
const observers: { callback: IntersectionObserverCallback; elements: Element[] }[] = []
vi.stubGlobal(
  'IntersectionObserver',
  class {
    private entry: (typeof observers)[number]
    constructor(callback: IntersectionObserverCallback) {
      this.entry = { callback, elements: [] }
      observers.push(this.entry)
    }
    observe(element: Element) {
      this.entry.elements.push(element)
    }
    unobserve() {}
    disconnect() {}
  },
)

const fetchStub = vi.fn<(url: string) => Promise<Pick<Response, 'json' | 'status'>>>()
vi.stubGlobal('fetch', fetchStub)

const { ToastProvider, useToast } = await import('@/app/(frontend)/components/toast/ToastProvider')
const { ShelfRowsProvider, useShelfRows } = await import('@/app/(frontend)/(sections)/ShelfRows')
const { CollectionList } = await import('@/app/(frontend)/(sections)/CollectionList')

const book = (bookId: number): EffectiveBook => ({
  bookId,
  isbn13: null,
  visibility: 'shared',
  source: null,
  title: `Book ${bookId}`,
  subtitle: null,
  authors: [],
  series: null,
  seriesIndex: null,
  genres: [],
  themes: [],
  publisher: null,
  year: null,
  language: null,
  pages: null,
  description: null,
  coverUrl: null,
  overridden: [],
})

const row = (copyId: number): ShelfRow => ({
  copy: { copyId, status: 'owned', location: null, note: null, loan: null },
  book: book(copyId),
})

const rows = (from: number, to: number): ShelfRow[] =>
  Array.from({ length: to - from + 1 }, (_, i) => row(from + i))

const query: ShelfQuery = { filters: {}, sort: 'author', dir: 'asc' }

/** What a test reaches through the contexts, as a later sibling would. */
let probe: {
  afterAction: (result: ActionResult<unknown>) => void
  toast: ReturnType<typeof useToast>
}
function Probe() {
  const { afterAction } = useShelfRows()
  const toast = useToast()
  useEffect(() => {
    probe = { afterAction, toast }
  }, [afterAction, toast])
  return null
}

const mount = (initial: ShelfRows) =>
  render(
    createElement(
      ToastProvider,
      null,
      createElement(
        ShelfRowsProvider,
        // `children` comes as the arguments after props.
        { query, initial } as ComponentProps<typeof ShelfRowsProvider>,
        createElement(CollectionList, { query }),
        createElement(Probe),
      ),
    ),
  )

const answerWith = (body: ActionResult<ShelfRows>) =>
  fetchStub.mockResolvedValueOnce({ status: 200, json: async () => body })

/** The sentinel comes within a screen of view, or leaves it. */
const sentinelSeen = (isIntersecting: boolean) =>
  act(() => {
    for (const { callback, elements } of observers) {
      const sentinel = elements.find((element) => element.getAttribute('aria-hidden') === 'true')
      if (sentinel) {
        callback(
          [{ isIntersecting, target: sentinel } as IntersectionObserverEntry],
          {} as IntersectionObserver,
        )
      }
    }
  })
const approach = () => sentinelSeen(true)
const leave = () => sentinelSeen(false)

const titles = () =>
  screen.getAllByRole('listitem').map((item) => item.querySelector('p')?.textContent)

const countLine = () => screen.getByText(/\d+ books?/).textContent

describe('CollectionList', () => {
  afterEach(() => {
    cleanup()
    observers.length = 0
    vi.clearAllMocks()
    fetchStub.mockReset()
  })

  it('appends the next range, skipping a copy already held', async () => {
    mount({ rows: rows(1, 2), total: 4, labels: {} })
    let settle: (body: ActionResult<ShelfRows>) => void = () => {}
    fetchStub.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          settle = (body) => resolve({ status: 200, json: async () => body })
        }),
    )
    approach()

    // While the range loads, the progress line runs and the rows held stay.
    screen.getByRole('progressbar')
    expect(titles()).toEqual(['Book 1', 'Book 2'])
    await act(async () => settle({ ok: true, data: { rows: rows(2, 4), total: 4, labels: {} } }))

    await waitFor(() => expect(titles()).toEqual(['Book 1', 'Book 2', 'Book 3', 'Book 4']))
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(fetchStub).toHaveBeenCalledOnce()
    expect(fetchStub.mock.calls[0]![0]).toBe('/data/shelf?offset=2&limit=50')
  })

  it('asks for nothing when every row is held', () => {
    mount({ rows: rows(1, 2), total: 2, labels: {} })
    approach()

    expect(fetchStub).not.toHaveBeenCalled()
  })

  it('reloads the rows held after an Undo from the toast, with the new count', async () => {
    mount({ rows: rows(1, 60), total: 61, labels: {} })
    undoAction.mockResolvedValue({ ok: true, data: null })
    answerWith({ ok: true, data: { rows: rows(2, 60), total: 59, labels: {} } })
    act(() => {
      probe.toast.show({ kind: 'success', message: 'Saved', undo: { token: 'tok', seconds: 60 } })
    })
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))

    await waitFor(() => expect(countLine()).toBe('59 books'))
    expect(fetchStub).toHaveBeenCalledOnce()
    expect(fetchStub.mock.calls[0]![0]).toBe('/data/shelf?offset=0&limit=60')
    expect(titles()).toHaveLength(59)
  })

  it('shows "Not in library" and reloads after an action fails NOT_FOUND', async () => {
    mount({ rows: rows(1, 2), total: 2, labels: {} })
    answerWith({ ok: true, data: { rows: rows(2, 2), total: 1, labels: {} } })
    act(() => probe.afterAction({ ok: false, code: 'NOT_FOUND' }))

    screen.getByText('Not in library')
    await waitFor(() => expect(titles()).toEqual(['Book 2']))
    expect(fetchStub.mock.calls[0]![0]).toBe('/data/shelf?offset=0&limit=50')
    expect(countLine()).toBe('1 book')
  })

  it('reloads after an action succeeds', async () => {
    mount({ rows: rows(1, 2), total: 2, labels: {} })
    answerWith({ ok: true, data: { rows: rows(1, 3), total: 3, labels: {} } })
    act(() => probe.afterAction({ ok: true, data: null }))

    await waitFor(() => expect(titles()).toEqual(['Book 1', 'Book 2', 'Book 3']))
    expect(fetchStub.mock.calls[0]![0]).toBe('/data/shelf?offset=0&limit=50')
  })

  it('reports a failed load, keeps the rows and tries again on the next approach', async () => {
    mount({ rows: rows(1, 2), total: 3, labels: {} })
    answerWith({ ok: false, code: 'NO_CONNECTION' })
    approach()

    await screen.findByText(en.errors.NO_CONNECTION)
    expect(titles()).toEqual(['Book 1', 'Book 2'])

    answerWith({ ok: true, data: { rows: rows(3, 3), total: 3, labels: {} } })
    leave()
    approach()
    await waitFor(() => expect(titles()).toEqual(['Book 1', 'Book 2', 'Book 3']))
    expect(fetchStub).toHaveBeenCalledTimes(2)
    expect(fetchStub.mock.calls[1]![0]).toBe('/data/shelf?offset=2&limit=50')
  })
})
