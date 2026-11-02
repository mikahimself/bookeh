import { describe, expect, it } from 'vitest'

import type { EffectiveBook } from '@/lib/books/effectiveBook'
import type { CopyLine, Holdings } from '@/lib/books/holdings'
import type { SearchDraft } from '@/lib/catalogue/searchBooks'
import type { MyBook } from '@/lib/shelf/query'

import { lookupRows } from '@/app/(frontend)/scan/find/lookupRows'

// EXPERIENCE.md, Lookup: the two groups, their hrefs, their edition lines, the
// own group's lent marker, and the overlap an own Book takes out of Elsewhere.

const book = (over: Partial<EffectiveBook> = {}): EffectiveBook => ({
  bookId: 1,
  isbn13: '9789510123456',
  visibility: 'shared',
  source: null,
  title: 'Tuntematon sotilas',
  subtitle: null,
  authors: [{ id: 3, name: 'Väinö Linna' }],
  series: null,
  seriesIndex: null,
  genres: [],
  themes: [],
  publisher: 'WSOY',
  year: 1954,
  language: 'fi',
  pages: null,
  description: null,
  coverUrl: null,
  overridden: [],
  ...over,
})

const copy = (over: Partial<CopyLine> = {}): CopyLine => ({
  copyId: 11,
  status: 'owned',
  location: { id: 2, name: 'Tampere' },
  note: null,
  loan: null,
  ...over,
})

const holdings = (copies: CopyLine[] = [copy()]): Holdings => ({ copies, entries: [] })

const mine = (over: Partial<EffectiveBook> = {}, copies?: CopyLine[]): MyBook => ({
  book: book(over),
  mine: holdings(copies),
})

const hit = (over: Partial<SearchDraft> = {}): SearchDraft => ({
  isbn13: '9789511111118',
  title: 'Sinuhe egyptiläinen',
  authors: [{ name: 'Mika Waltari' }],
  publisher: 'WSOY',
  year: 1945,
  binding: 'nidottu',
  source: 'finna',
  hasCover: false,
  ...over,
})

describe('lookupRows', () => {
  it('groups own Books first and keeps each search its own order', () => {
    const { mine: own, elsewhere } = lookupRows(
      [mine(), mine({ bookId: 2, isbn13: null, title: 'Taikatalvi' })],
      [hit(), hit({ isbn13: '9789510222222', title: 'Komisario Palmu' })],
    )
    expect(own.map((row) => row.title)).toEqual(['Tuntematon sotilas', 'Taikatalvi'])
    expect(elsewhere.map((row) => row.title)).toEqual(['Sinuhe egyptiläinen', 'Komisario Palmu'])
  })

  it('addresses an own row by Book id and an Elsewhere row by ISBN', () => {
    const { mine: own, elsewhere } = lookupRows([mine({ bookId: 7 })], [hit()])
    expect(own[0].href).toBe('/scan?book=7')
    expect(elsewhere[0].href).toBe('/scan?isbn=9789511111118')
  })

  it('addresses an own Book without an ISBN by Book id too, and never drops it', () => {
    const { mine: own, elsewhere } = lookupRows([mine({ bookId: 9, isbn13: null })], [hit()])
    expect(own[0].href).toBe('/scan?book=9')
    expect(elsewhere).toHaveLength(1)
  })

  it('drops an Elsewhere hit for a Book already in the own group', () => {
    const { mine: own, elsewhere } = lookupRows(
      [mine({ isbn13: '9789511111118' })],
      [hit(), hit({ isbn13: '9789510222222', title: 'Komisario Palmu' })],
    )
    expect(own).toHaveLength(1)
    expect(elsewhere.map((row) => row.title)).toEqual(['Komisario Palmu'])
  })

  it('writes the authors line and the edition line of each group', () => {
    const { mine: own, elsewhere } = lookupRows(
      [
        mine({
          authors: [
            { id: 3, name: 'Väinö Linna' },
            { id: 4, name: 'Toinen' },
          ],
        }),
      ],
      [hit()],
    )
    expect(own[0].authors).toBe('Väinö Linna, Toinen')
    // `EffectiveBook` stores no binding.
    expect(own[0].edition).toBe('1954 · WSOY')
    expect(elsewhere[0].authors).toBe('Mika Waltari')
    expect(elsewhere[0].edition).toBe('nidottu · 1945 · WSOY')
  })

  it('leaves no stray separator for a hit with a year alone', () => {
    const { elsewhere } = lookupRows(
      [],
      [hit({ binding: undefined, publisher: undefined, authors: [] })],
    )
    expect(elsewhere[0].edition).toBe('1945')
    expect(elsewhere[0].authors).toBe('')
  })

  it('takes a cover from the preview route only when a source had one', () => {
    const { mine: own, elsewhere } = lookupRows(
      [mine({ coverUrl: '/api/media/file/cover.jpg' })],
      [hit({ hasCover: true }), hit({ isbn13: '9789510222222' })],
    )
    expect(own[0].cover).toBe('/api/media/file/cover.jpg')
    expect(elsewhere[0].cover).toBe('/data/cover/9789511111118')
    expect(elsewhere[1].cover).toBe(null)
  })

  it('ends an own row with the first lent copy’s borrower, and no other row', () => {
    const lent = copy({
      copyId: 12,
      loan: { loanId: 4, person: { id: 5, name: 'Hilla' }, since: '2026-01-02' },
    })
    const { mine: own, elsewhere } = lookupRows(
      [
        mine({}, [copy(), lent]),
        // An ordered copy is never lent, open loan or not.
        mine({ bookId: 2 }, [{ ...lent, status: 'ordered' }]),
      ],
      [hit()],
    )
    expect(own.map((row) => row.lentTo)).toEqual(['Hilla', null])
    expect(elsewhere[0].lentTo).toBe(null)
  })
})
