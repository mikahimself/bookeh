import { describe, expect, it } from 'vitest'

import {
  answerFor,
  answerLines,
  copyLines,
  editionLine,
  editionLines,
  type AnswerEdition,
  inLibrary,
  notInLibrary,
  scanParams,
  type AnswerBook,
  type AnswerText,
} from '@/app/(frontend)/scan/answer'
import type { EffectiveBook } from '@/lib/books/effectiveBook'
import type { CopyLine, Holdings } from '@/lib/books/holdings'
import type { Draft, LookupResult } from '@/lib/catalogue/lookupBook'
import { DomainError } from '@/lib/errors'

const ISBN = '9789510396358'

const draft = (over: Partial<Draft> = {}): Draft => ({
  isbn13: '9789510396358',
  title: 'Tuntematon sotilas',
  authors: [{ name: 'Väinö Linna', sortName: 'Linna, Väinö' }],
  subjects: [],
  themes: [],
  source: 'finna',
  hasCover: true,
  ...over,
})

const book: EffectiveBook = {
  bookId: 7,
  isbn13: '9789510396358',
  visibility: 'shared',
  source: 'finna',
  title: 'Tuntematon sotilas',
  subtitle: null,
  authors: [{ id: 3, name: 'Väinö Linna' }],
  series: null,
  seriesIndex: null,
  genres: [],
  themes: [],
  publisher: 'WSOY',
  year: 2014,
  language: 'fi',
  pages: 480,
  description: null,
  coverUrl: null,
  overridden: [],
}

const nothing: Holdings = { copies: [], entries: [] }

const copy = (over: Partial<CopyLine> = {}): CopyLine => ({
  copyId: 1,
  status: 'owned',
  location: null,
  note: null,
  loan: null,
  ...over,
})

const entry = { entryId: 1, wishlist: { id: 2, name: 'Toiveet' }, forPerson: null }

describe('notInLibrary', () => {
  it('shows the picked candidate, its preview cover, what a save would create and the editions', () => {
    const result: LookupResult = {
      kind: 'source',
      candidates: [
        draft({ title: 'Other edition', binding: 'nidottu', hasCover: false }),
        draft({ publisher: 'WSOY', year: 2014, pages: 480 }),
      ],
      pick: 1,
      matches: {
        authors: [{ name: 'Väinö Linna', id: null }],
        series: { name: 'Sotaromaanit', id: 4 },
      },
    }
    expect(notInLibrary(result)).toEqual({
      isbn13: '9789510396358',
      title: 'Tuntematon sotilas',
      authors: ['Väinö Linna'],
      publisher: 'WSOY',
      year: 2014,
      pages: 480,
      cover: '/data/cover/9789510396358?pick=1',
      source: 'finna',
      newAuthors: ['Väinö Linna'],
      newSeries: null,
      pick: 1,
      editions: [
        {
          title: 'Other edition',
          binding: 'nidottu',
          year: null,
          publisher: null,
          pages: null,
          cover: null,
        },
        {
          title: 'Tuntematon sotilas',
          binding: null,
          year: 2014,
          publisher: 'WSOY',
          pages: 480,
          cover: '/data/cover/9789510396358?pick=1',
        },
      ],
    })
  })

  it('leaves out a missing cover and edition parts, and names a new series', () => {
    const answer = notInLibrary({
      kind: 'source',
      candidates: [draft({ hasCover: false, year: 2014, pages: 1, source: 'fixture' })],
      pick: 0,
      matches: { authors: [{ name: 'Väinö Linna', id: 3 }], series: { name: 'Uusi', id: null } },
    })
    expect(answer).toMatchObject({
      cover: null,
      publisher: null,
      year: 2014,
      pages: 1,
      source: 'fixture',
      newAuthors: [],
      newSeries: 'Uusi',
      // One candidate: nothing about editions, and no pick to send.
      pick: undefined,
      editions: [],
    })
  })

  it('answers a Book the viewer holds nothing of, with no source line or notes', () => {
    expect(
      notInLibrary({
        kind: 'existing',
        book: { ...book, coverUrl: '/api/media/file/c.jpg' },
        mine: nothing,
      }),
    ).toEqual({
      isbn13: '9789510396358',
      title: 'Tuntematon sotilas',
      authors: ['Väinö Linna'],
      publisher: 'WSOY',
      year: 2014,
      pages: 480,
      cover: '/api/media/file/c.jpg',
      source: null,
      newAuthors: [],
      newSeries: null,
      pick: undefined,
      editions: [],
    })
  })

  it('is not the answer for a held Book or the other kinds', () => {
    expect(
      notInLibrary({ kind: 'existing', book, mine: { copies: [copy()], entries: [] } }),
    ).toBeNull()
    expect(
      notInLibrary({ kind: 'existing', book, mine: { copies: [], entries: [entry] } }),
    ).toBeNull()
    // The lookup found the Book by its ISBN, so this cannot happen.
    expect(
      notInLibrary({ kind: 'existing', book: { ...book, isbn13: null }, mine: nothing }),
    ).toBeNull()
    expect(notInLibrary({ kind: 'none' })).toBeNull()
    expect(notInLibrary({ kind: 'unavailable', failed: ['finna'] })).toBeNull()
  })
})

describe('inLibrary', () => {
  it('lists each copy in Holdings order, with its location name and status', () => {
    const copies = [
      copy({ copyId: 4, location: { id: 9, name: 'Tampere' } }),
      copy({ copyId: 2 }),
      copy({ copyId: 3, status: 'ordered' }),
    ]
    expect(inLibrary({ kind: 'existing', book, mine: { copies, entries: [] } })).toEqual({
      isbn13: '9789510396358',
      title: 'Tuntematon sotilas',
      authors: ['Väinö Linna'],
      publisher: 'WSOY',
      year: 2014,
      pages: 480,
      cover: null,
      source: null,
      newAuthors: [],
      newSeries: null,
      pick: undefined,
      editions: [],
      copies: [
        { location: 'Tampere', status: 'owned' },
        { location: null, status: 'owned' },
        { location: null, status: 'ordered' },
      ],
    })
  })

  it('is not the answer without a copy, without an ISBN, or for the other kinds', () => {
    expect(inLibrary({ kind: 'existing', book, mine: nothing })).toBeNull()
    expect(inLibrary({ kind: 'existing', book, mine: { copies: [], entries: [entry] } })).toBeNull()
    expect(
      inLibrary({
        kind: 'existing',
        book: { ...book, isbn13: null },
        mine: { copies: [copy()], entries: [] },
      }),
    ).toBeNull()
    expect(
      inLibrary({
        kind: 'source',
        candidates: [draft()],
        pick: 0,
        matches: { authors: [], series: null },
      }),
    ).toBeNull()
    expect(inLibrary({ kind: 'none' })).toBeNull()
    expect(inLibrary({ kind: 'unavailable', failed: ['finna'] })).toBeNull()
  })
})

describe('copyLines', () => {
  it('gives a line per copy in order, with the location only when there is one', () => {
    expect(
      copyLines(
        [
          { location: 'Tampere', status: 'owned' },
          { location: null, status: 'owned' },
          { location: null, status: 'ordered' },
        ],
        {
          copy: (status) => status,
          copyAt: (location, status) => `${location} · ${status}`,
        },
      ),
    ).toEqual(['Tampere · owned', 'owned', 'ordered'])
  })
})

describe('answerLines', () => {
  const text: AnswerText = {
    source: (id) => ({ finna: 'Finna', google: 'Google Books' })[id],
    from: (source) => `From ${source}`,
    pages: (pages) => `${pages} ${pages === 1 ? 'page' : 'pages'}`,
    newAuthor: (name) => `New author · ${name}`,
    newSeries: (name) => `New series · ${name}`,
  }
  const answer = (over: Partial<AnswerBook> = {}): AnswerBook => ({
    isbn13: '9789510396358',
    title: 'Muumipeikko ja pyrstötähti',
    authors: ['Tove Jansson', 'Kristiina Kivivuori'],
    publisher: 'WSOY',
    year: 2014,
    pages: 180,
    cover: null,
    source: 'finna',
    newAuthors: ['Kristiina Kivivuori'],
    newSeries: 'Muumit',
    pick: 0,
    editions: [],
    ...over,
  })

  it('names the source and each record a save would create', () => {
    expect(answerLines(answer(), text)).toEqual({
      authors: 'Tove Jansson, Kristiina Kivivuori',
      edition: 'WSOY · 2014 · 180 pages',
      notes: ['From Finna', 'New author · Kristiina Kivivuori', 'New series · Muumit'],
    })
  })

  it('skips missing edition parts and shows an unlabelled source by its id', () => {
    const lines = answerLines(
      answer({ publisher: null, pages: 1, source: 'fixture', newAuthors: [], newSeries: null }),
      text,
    )
    expect(lines.edition).toBe('2014 · 1 page')
    expect(lines.notes).toEqual(['From fixture'])
  })

  it('has no source line or notes for a Book, and empty lines for missing parts', () => {
    expect(
      answerLines(
        answer({
          authors: [],
          publisher: null,
          year: null,
          pages: null,
          source: null,
          newAuthors: [],
          newSeries: null,
        }),
        text,
      ),
    ).toEqual({ authors: '', edition: '', notes: [] })
  })
})

describe('scanParams', () => {
  it.each([
    ['an ISBN', { isbn: '951-0-39707-5' }, { isbn: '951-0-39707-5' }],
    ['Add without ISBN (an empty title)', { title: '' }, { title: '' }],
    ['a title', { title: 'Kotiseutu' }, { title: 'Kotiseutu' }],
    ['an ISBN with a title', { isbn: ISBN, title: 'x' }, { isbn: ISBN }],
    ['a blank ISBN with a title', { isbn: '  ', title: 'x' }, { title: 'x' }],
    ['a blank ISBN', { isbn: '' }, {}],
    ['nothing', {}, {}],
    ['repeated keys', { title: ['a', 'b'] }, { title: 'a' }],
    ['an ISBN with a pick', { isbn: ISBN, pick: '1' }, { isbn: ISBN, pick: 1 }],
    ['a pick that is not digits', { isbn: ISBN, pick: '-1' }, { isbn: ISBN }],
    ['a pick without an ISBN', { title: 'x', pick: '1' }, { title: 'x' }],
  ])('reads %s', (_, params, expected) => {
    expect(scanParams(params)).toEqual(expected)
  })
})

describe('editionLine', () => {
  const text = {
    pages: (pages: number) => `${pages} pages`,
    unnamed: (n: number) => `Edition ${n}`,
  }
  const edition = (over: Partial<AnswerEdition>): AnswerEdition => ({
    title: 'A Game of Thrones',
    binding: null,
    year: null,
    publisher: null,
    pages: null,
    cover: null,
    ...over,
  })

  it('joins the parts that exist, binding first', () => {
    expect(
      editionLine(
        edition({ binding: 'nidottu', year: 2012, publisher: 'Otava', pages: 690 }),
        0,
        text,
      ),
    ).toBe('nidottu · 2012 · Otava · 690 pages')
    expect(editionLine(edition({ year: 2012, pages: 690 }), 0, text)).toBe('2012 · 690 pages')
  })

  it('names an edition with no parts by its number', () => {
    expect(editionLine(edition({ cover: '/c' }), 1, text)).toBe('Edition 2')
  })

  it('numbers the rows whose lines would read the same', () => {
    expect(
      editionLines(
        [
          edition({ year: 2012, pages: 690 }),
          edition({ binding: 'nidottu', year: 2012 }),
          edition({ year: 2012, pages: 690 }),
        ],
        text,
      ),
    ).toEqual(['2012 · 690 pages · Edition 1', 'nidottu · 2012', '2012 · 690 pages · Edition 3'])
  })
})

describe('answerFor', () => {
  it('answers In library for a held copy, Not in library for nothing held, else Scan', async () => {
    await expect(
      answerFor(ISBN, async () => ({
        kind: 'existing',
        book,
        mine: { copies: [copy()], entries: [] },
      })),
    ).resolves.toMatchObject({
      kind: 'inLibrary',
      answer: { title: 'Tuntematon sotilas', copies: [{ location: null, status: 'owned' }] },
    })
    await expect(
      answerFor(ISBN, async () => ({ kind: 'existing', book, mine: nothing })),
    ).resolves.toMatchObject({ kind: 'notInLibrary', answer: { title: 'Tuntematon sotilas' } })
    await expect(
      answerFor(ISBN, async () => ({
        kind: 'existing',
        book,
        mine: { copies: [], entries: [entry] },
      })),
    ).resolves.toEqual({ kind: 'scan' })
  })

  it('answers Not found with the ISBN in 13 digits when no source knows it', async () => {
    await expect(answerFor('951-0-39707-5', async () => ({ kind: 'none' }))).resolves.toEqual({
      kind: 'notFound',
      isbn13: '9789510397077',
      title: '',
    })
  })

  it('keeps Scan when a source could not answer', async () => {
    await expect(
      answerFor(ISBN, async () => ({ kind: 'unavailable', failed: ['finna'] })),
    ).resolves.toEqual({ kind: 'scan' })
  })

  it.each(['INVALID_ISBN', 'RATE_LIMITED'] as const)('keeps Scan with %s', async (code) => {
    await expect(
      answerFor(ISBN, async () => {
        throw new DomainError(code)
      }),
    ).resolves.toEqual({ kind: 'scan', error: code })
  })

  it('rethrows anything else', async () => {
    const internal = new DomainError('INTERNAL')
    await expect(
      answerFor(ISBN, async () => {
        throw internal
      }),
    ).rejects.toBe(internal)
    await expect(
      answerFor(ISBN, async () => {
        throw new Error('db down')
      }),
    ).rejects.toThrow('db down')
  })
})
