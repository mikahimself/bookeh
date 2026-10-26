// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AnswerLayout } from '@/app/(frontend)/scan/AnswerLayout'
import type { AnswerBook } from '@/app/(frontend)/scan/answer'

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
  pick: undefined,
  candidate: undefined,
  editions: [],
}

describe('AnswerLayout', () => {
  afterEach(cleanup)

  it("reads a lent copy's line as its location, then the borrower", async () => {
    render(
      await AnswerLayout({
        book,
        lines: [
          { text: 'Mökki', lent: 'Lent · Antti' },
          { text: '', lent: 'Lent · Leena' },
        ],
        children: null,
      }),
    )

    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Mökki · Lent · Antti',
      'Lent · Leena',
    ])
  })
})
