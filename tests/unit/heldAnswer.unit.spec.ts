// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { HeldAnswer as Held } from '@/app/(frontend)/scan/answer'
import type { CopyLine, EntryLine } from '@/lib/books/holdings'

vi.mock('next-intl/server', async () => {
  const { createTranslator } = await vi.importActual<typeof import('next-intl')>('next-intl')
  const { default: messages } = await import('../../messages/en.json')
  return {
    getTranslations: async (namespace?: string) =>
      createTranslator({ locale: 'en', messages, namespace: namespace as 'sources' }),
  }
})
// The Answer's buttons and Links are client components: named, not exercised, here.
vi.mock('@/app/(frontend)/scan/AddToLibrary', () => ({
  AddToLibrary: ({ another = false }: { another?: boolean }) =>
    button(another ? 'Add another copy' : 'Add to library'),
}))
vi.mock('@/app/(frontend)/scan/AnswerBack', () => ({
  AnswerBack: ({ label, variant }: { label: string; variant?: string }) =>
    button(`${label}${variant === 'primary' ? ' (primary)' : ''}`),
}))
vi.mock('@/app/(frontend)/scan/OpenBook', () => ({
  OpenBook: ({ label }: { label: string }) => button(label),
}))
vi.mock('@/app/(frontend)/scan/AnswerLookUpAgain', () => ({
  AnswerLookUpAgain: () => button('Look it up again'),
}))
vi.mock('@/app/(frontend)/(sections)/RefreshOnUndo', () => ({ RefreshOnUndo: () => null }))
vi.mock('@/app/(frontend)/scan/AnswerReceive', () => ({
  AnswerReceive: ({ copyId }: { copyId: number }) => button(`Received ${copyId}`),
}))

function button(label: string) {
  return createElement('button', { type: 'button' }, label)
}

const { AnswerLayout } = await import('@/app/(frontend)/scan/AnswerLayout')
const { HeldAnswer } = await import('@/app/(frontend)/scan/HeldAnswer')

const copy = (over: Partial<CopyLine> = {}): CopyLine => ({
  copyId: 1,
  status: 'owned',
  location: null,
  note: null,
  loan: null,
  ...over,
})

const entry = (over: Partial<EntryLine> = {}): EntryLine => ({
  entryId: 1,
  wishlist: { id: 2, name: 'Toiveet' },
  forPerson: null,
  ...over,
})

const answer = (over: Partial<Held>): Held => ({
  isbn13: '9789510396353',
  title: 'Tuntematon sotilas',
  language: 'fi',
  authors: ['Väinö Linna'],
  publisher: null,
  year: null,
  pages: null,
  cover: null,
  source: null,
  newAuthors: [],
  newSeries: null,
  pick: undefined,
  candidate: undefined,
  editions: [],
  failed: [],
  bookId: 7,
  heading: 'inLibrary',
  lookAgain: false,
  facts: [],
  ...over,
})

/** The server component's tree, its async `AnswerLayout` resolved as `render` cannot. */
const renderAnswer = async (held: Held) => {
  const { props } = await HeldAnswer({ answer: held })
  return render(await AnswerLayout(props as Parameters<typeof AnswerLayout>[0]))
}

const buttons = () => screen.getAllByRole('button').map((item) => item.textContent)

describe('the held Answer', () => {
  afterEach(cleanup)

  // EXPERIENCE.md, Answer screens: the buttons each heading calls for, the one primary.
  it('offers Open book, Add another copy and Back on In library', async () => {
    await renderAnswer(answer({ facts: [{ kind: 'copy', copy: copy() }] }))

    expect(buttons()).toEqual(['Open book', 'Add another copy', 'Back (primary)'])
  })

  it('offers Back alone on Ordered, with a Received Link per ordered copy', async () => {
    await renderAnswer(
      answer({
        heading: 'ordered',
        facts: [
          { kind: 'copy', copy: copy({ copyId: 3, status: 'ordered' }) },
          { kind: 'copy', copy: copy({ copyId: 4, status: 'ordered' }) },
        ],
      }),
    )

    expect(buttons()).toEqual(['Received 3', 'Received 4', 'Back (primary)'])
  })

  it('offers Add to library, then Back, on On wishlist', async () => {
    await renderAnswer(
      answer({ heading: 'onWishlist', facts: [{ kind: 'entry', entry: entry() }] }),
    )

    expect(buttons()).toEqual(['Add to library', 'Back'])
  })

  it('shows Look it up again only when the Answer says so', async () => {
    const facts: Held['facts'] = [{ kind: 'copy', copy: copy() }]
    const { unmount } = await renderAnswer(answer({ facts, lookAgain: true }))
    screen.getByRole('button', { name: 'Look it up again' })
    unmount()

    await renderAnswer(answer({ facts }))
    expect(screen.queryByRole('button', { name: 'Look it up again' })).toBeNull()
  })

  it("names an entry's list, and its recipient when it has one", async () => {
    await renderAnswer(
      answer({
        heading: 'onWishlist',
        facts: [
          { kind: 'entry', entry: entry() },
          {
            kind: 'entry',
            entry: entry({
              entryId: 2,
              wishlist: { id: 3, name: 'Lahjat' },
              forPerson: { id: 12, name: 'Antti' },
            }),
          },
        ],
      }),
    )

    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'On Toiveet',
      'On Lahjat · for Antti',
    ])
  })
})
