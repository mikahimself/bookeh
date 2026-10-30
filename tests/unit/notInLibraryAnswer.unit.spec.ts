// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AnswerBook } from '@/app/(frontend)/scan/answer'

const router = { refresh: vi.fn(), replace: vi.fn() }
const show = vi.fn()
const retryLookupAction = vi.fn()

vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>()
  const { default: messages } = await import('../../messages/en.json')
  return {
    ...actual,
    useTranslations: (namespace?: string) =>
      actual.createTranslator({ locale: 'en', messages, namespace: namespace as 'sources' }),
    useFormatter: () => actual.createFormatter({ locale: 'en' }),
  }
})
vi.mock('next-intl/server', async () => {
  const { createFormatter, createTranslator } =
    await vi.importActual<typeof import('next-intl')>('next-intl')
  const { default: messages } = await import('../../messages/en.json')
  return {
    getTranslations: async (namespace?: string) =>
      createTranslator({ locale: 'en', messages, namespace: namespace as 'sources' }),
    getFormatter: async () => createFormatter({ locale: 'en' }),
  }
})
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => router,
}))
vi.mock('@/app/(frontend)/components/toast/ToastProvider', () => ({
  useToast: () => ({ show, dismiss: vi.fn() }),
}))
vi.mock('@/app/(frontend)/scan/actions', () => ({ retryLookupAction }))
vi.mock('@/app/(frontend)/scan/AddToLibrary', () => ({ AddToLibrary: () => null }))
vi.mock('@/app/(frontend)/scan/AddToWishlist', () => ({ AddToWishlist: () => null }))
vi.mock('@/app/(frontend)/scan/AnswerBack', () => ({ AnswerBack: () => null }))

const { AnswerLayout } = await import('@/app/(frontend)/scan/AnswerLayout')
const { NotInLibraryAnswer } = await import('@/app/(frontend)/scan/NotInLibraryAnswer')
const { PartialLookupLine } = await import('@/app/(frontend)/scan/PartialLookupLine')

const book: AnswerBook = {
  isbn13: '9789510396358',
  title: 'Tuntematon sotilas',
  language: 'fi',
  authors: [],
  publisher: null,
  year: null,
  pages: null,
  cover: null,
  source: 'google',
  newAuthors: [],
  newSeries: null,
  pick: undefined,
  candidate: { source: 'google', recordId: 'g1' },
  editions: [],
  failed: [],
}

/** The server component's tree, its async `AnswerLayout` resolved as `render` cannot. */
const renderAnswer = async (answer: AnswerBook) => {
  const { props } = await NotInLibraryAnswer({ answer, lists: [] })
  return render(await AnswerLayout(props as Parameters<typeof AnswerLayout>[0]))
}

describe('the partial lookup line', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('names the failed source and the one used, and shows only on a partial lookup', async () => {
    const { unmount } = await renderAnswer({ ...book, failed: ['finna'] })
    screen.getByText("Finna didn't answer. Saving now uses Google Books alone.")
    screen.getByRole('button', { name: 'Try Finna again' })
    unmount()

    await renderAnswer(book)
    expect(screen.queryByText(/didn't answer/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Try Finna again' })).toBeNull()
  })

  it('reports a refused retry and does not refresh', async () => {
    retryLookupAction.mockResolvedValue({ ok: false, code: 'RATE_LIMITED' })
    render(
      createElement(PartialLookupLine, {
        isbn13: book.isbn13,
        text: 'Line',
        tryLabel: 'Try Finna again',
      }),
    )

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Try Finna again' })))

    expect(show).toHaveBeenCalledWith(expect.objectContaining({ code: 'RATE_LIMITED' }))
    expect(router.refresh).not.toHaveBeenCalled()
  })
})
