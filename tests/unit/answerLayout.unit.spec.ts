// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AnswerLayout } from '@/app/(frontend)/scan/AnswerLayout'
import type { AnswerBook } from '@/app/(frontend)/scan/answer'

vi.mock('@/app/(frontend)/scan/AnswerReceive', () => ({
  AnswerReceive: ({ copyId }: { copyId: number }) =>
    createElement('button', { type: 'button' }, `Received ${copyId}`),
}))
vi.mock('next-intl/server', async () => {
  const { createTranslator } = await vi.importActual<typeof import('next-intl')>('next-intl')
  const { default: messages } = await import('../../messages/en.json')
  return {
    getTranslations: async (namespace?: string) =>
      createTranslator({ locale: 'en', messages, namespace: namespace as 'sources' }),
  }
})

const book: AnswerBook = {
  isbn13: '9789510396358',
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
  newGenres: [],
  pick: undefined,
  candidate: undefined,
  editions: [],
  failed: [],
}

describe('AnswerLayout', () => {
  afterEach(cleanup)

  it("reads a lent copy's line as its location, then the borrower", async () => {
    render(
      await AnswerLayout({
        book,
        lines: [
          { text: 'Mökki', lent: 'Lent · Antti', receive: null },
          { text: '', lent: 'Lent · Leena', receive: null },
        ],
        children: null,
      }),
    )

    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Mökki · Lent · Antti',
      'Lent · Leena',
    ])
  })

  it("puts a line's Received Link on that line alone", async () => {
    render(
      await AnswerLayout({
        book,
        lines: [
          { text: 'Tampere · owned', lent: null, receive: null },
          { text: 'Ordered', lent: null, receive: 3 },
        ],
        children: null,
      }),
    )

    const items = screen.getAllByRole('listitem')
    expect(items[0]!.querySelector('button')).toBeNull()
    expect(items[1]!.querySelector('button')?.textContent).toBe('Received 3')
  })
})
