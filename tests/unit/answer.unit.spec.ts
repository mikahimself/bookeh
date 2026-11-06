import { describe, expect, it } from 'vitest'

import {
  answerFor,
  answerForBook,
  answerLines,
  editionLine,
  editionLines,
  factLines,
  held,
  type AnswerEdition,
  notInLibrary,
  scanParams,
  type AnswerBook,
  type AnswerText,
  type FactText,
} from '@/app/(frontend)/scan/answer'
import type { EffectiveBook } from '@/lib/books/effectiveBook'
import type { CopyLine, EntryLine, Holdings } from '@/lib/books/holdings'
import type { AnswerFactLine } from '@/lib/catalogue/answerFacts'
import type { Draft, LookupResult } from '@/lib/catalogue/lookupBook'
import { DomainError } from '@/lib/errors'

const ISBN = '9789510396353'

const draft = (over: Partial<Draft> = {}): Draft => ({
  isbn13: '9789510396353',
  title: 'Tuntematon sotilas',
  authors: [{ name: 'Väinö Linna', sortName: 'Linna, Väinö' }],
  subjects: [],
  themes: [],
  source: 'finna',
  recordId: 'helka.1',
  hasCover: true,
  ...over,
})

const book: EffectiveBook = {
  bookId: 7,
  isbn13: '9789510396353',
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
  acquiredAt: '2026-10-12',
  price: null,
  ...over,
})

const loan: CopyLine['loan'] = {
  loanId: 11,
  person: { id: 12, name: 'Antti' },
  since: '2026-10-01',
}

const entry: EntryLine = { entryId: 1, wishlist: { id: 2, name: 'Toiveet' }, forPerson: null }

const entryFor: EntryLine = {
  entryId: 2,
  wishlist: { id: 3, name: 'Lahjat' },
  forPerson: { id: 12, name: 'Antti' },
}

describe('notInLibrary', () => {
  it('shows the picked candidate, its preview cover, what a save would create and the editions', () => {
    const result: LookupResult = {
      kind: 'source',
      candidates: [
        draft({ title: 'Other edition', binding: 'nidottu', hasCover: false }),
        draft({ publisher: 'WSOY', year: 2014, pages: 480, recordId: 'helka.2' }),
      ],
      pick: 1,
      matches: {
        authors: [{ name: 'Väinö Linna', id: null }],
        series: { name: 'Sotaromaanit', id: 4 },
        genres: [
          { name: 'Fiction', id: 1 },
          { name: 'Weird Science', id: null },
        ],
      },
      failed: [],
    }
    expect(notInLibrary(result, ISBN)).toEqual({
      isbn13: '9789510396353',
      title: 'Tuntematon sotilas',
      language: null,
      authors: ['Väinö Linna'],
      publisher: 'WSOY',
      year: 2014,
      pages: 480,
      cover: '/data/cover/9789510396353?pick=1',
      source: 'finna',
      newAuthors: ['Väinö Linna'],
      newSeries: null,
      newGenres: ['Weird Science'],
      pick: 1,
      candidate: { source: 'finna', recordId: 'helka.2' },
      editions: [
        {
          title: 'Other edition',
          language: null,
          binding: 'nidottu',
          year: null,
          publisher: null,
          pages: null,
          cover: null,
        },
        {
          title: 'Tuntematon sotilas',
          language: null,
          binding: null,
          year: 2014,
          publisher: 'WSOY',
          pages: 480,
          cover: '/data/cover/9789510396353?pick=1',
        },
      ],
      failed: [],
    })
  })

  it('leaves out a missing cover and edition parts, and names a new series', () => {
    const answer = notInLibrary(
      {
        kind: 'source',
        candidates: [draft({ hasCover: false, year: 2014, pages: 1, source: 'fixture' })],
        pick: 0,
        matches: {
          authors: [{ name: 'Väinö Linna', id: 3 }],
          series: { name: 'Uusi', id: null },
          genres: [],
        },
        failed: ['finna'],
      },
      ISBN,
    )
    expect(answer).toMatchObject({
      cover: null,
      publisher: null,
      year: 2014,
      pages: 1,
      source: 'fixture',
      newAuthors: [],
      newSeries: 'Uusi',
      newGenres: [],
      // One candidate: nothing about editions, and no pick to send, but its identity.
      pick: undefined,
      candidate: { source: 'fixture', recordId: 'helka.1' },
      editions: [],
      failed: ['finna'],
    })
  })

  it('answers a Book the viewer holds nothing of, with no source line or notes', () => {
    expect(
      notInLibrary(
        { kind: 'existing', book: { ...book, coverUrl: '/api/media/file/c.jpg' }, mine: nothing },
        ISBN,
      ),
    ).toEqual({
      isbn13: '9789510396353',
      title: 'Tuntematon sotilas',
      language: 'fi',
      authors: ['Väinö Linna'],
      publisher: 'WSOY',
      year: 2014,
      pages: 480,
      cover: '/api/media/file/c.jpg',
      source: null,
      newAuthors: [],
      newSeries: null,
      newGenres: [],
      pick: undefined,
      candidate: undefined,
      editions: [],
      failed: [],
    })
  })

  it('is not the answer for a Book the viewer holds anything of, or the other kinds', () => {
    expect(
      notInLibrary({ kind: 'existing', book, mine: { copies: [copy()], entries: [] } }, ISBN),
    ).toBeNull()
    expect(
      notInLibrary(
        { kind: 'existing', book, mine: { copies: [copy({ status: 'ordered' })], entries: [] } },
        ISBN,
      ),
    ).toBeNull()
    expect(
      notInLibrary({ kind: 'existing', book, mine: { copies: [], entries: [entry] } }, ISBN),
    ).toBeNull()
    expect(notInLibrary({ kind: 'none' }, ISBN)).toBeNull()
    expect(notInLibrary({ kind: 'unavailable', failed: ['finna'] }, ISBN)).toBeNull()
  })

  it("answers with the ISBN asked for, not the found Book's", () => {
    expect(
      notInLibrary({ kind: 'existing', book: { ...book, isbn13: null }, mine: nothing }, ISBN),
    ).toMatchObject({ isbn13: ISBN })
  })
})

describe('held', () => {
  it('carries the heading answerFacts gives, the Book and every fact as a line', () => {
    const copies = [
      copy({ copyId: 4, location: { id: 9, name: 'Tampere' } }),
      copy({ copyId: 3, status: 'ordered' }),
    ]
    expect(held({ kind: 'existing', book, mine: { copies, entries: [entry] } }, ISBN)).toEqual({
      isbn13: ISBN,
      title: 'Tuntematon sotilas',
      language: 'fi',
      authors: ['Väinö Linna'],
      publisher: 'WSOY',
      year: 2014,
      pages: 480,
      cover: null,
      source: null,
      newAuthors: [],
      newSeries: null,
      newGenres: [],
      pick: undefined,
      candidate: undefined,
      editions: [],
      failed: [],
      bookId: 7,
      heading: 'inLibrary',
      lookAgain: false,
      facts: [
        { kind: 'copy', copy: copies[0] },
        { kind: 'copy', copy: copies[1] },
        { kind: 'entry', entry },
      ],
    })
  })

  it.each([
    ['inLibrary', { copies: [copy()], entries: [] }],
    ['inLibrary', { copies: [copy({ loan })], entries: [] }],
    [
      'ordered',
      {
        copies: [copy({ status: 'ordered' }), copy({ copyId: 2, status: 'ordered' })],
        entries: [],
      },
    ],
    ['ordered', { copies: [copy({ status: 'ordered' })], entries: [entry] }],
    ['onWishlist', { copies: [], entries: [entry] }],
    ['onWishlist', { copies: [], entries: [entryFor] }],
  ] as [string, Holdings][])('heads the Answer %s', (heading, mine) => {
    expect(held({ kind: 'existing', book, mine }, ISBN)).toMatchObject({ heading })
  })

  it("offers Look it up again on the viewer's own private Book, In library only", () => {
    const own = { ...book, visibility: 'private' as const }
    expect(
      held({ kind: 'existing', book: own, mine: { copies: [copy()], entries: [] } }, ISBN),
    ).toMatchObject({ lookAgain: true })
    expect(
      held({ kind: 'existing', book, mine: { copies: [copy()], entries: [] } }, ISBN),
    ).toMatchObject({ lookAgain: false })
    expect(
      held(
        {
          kind: 'existing',
          book: own,
          mine: { copies: [copy({ status: 'ordered' })], entries: [] },
        },
        ISBN,
      ),
    ).toMatchObject({ lookAgain: false })
    expect(
      held({ kind: 'existing', book: own, mine: { copies: [], entries: [entry] } }, ISBN),
    ).toMatchObject({ lookAgain: false })
  })

  it("answers with the ISBN asked for, not the found Book's", () => {
    expect(
      held(
        {
          kind: 'existing',
          book: { ...book, isbn13: null },
          mine: { copies: [copy()], entries: [] },
        },
        ISBN,
      ),
    ).toMatchObject({ isbn13: ISBN })
  })

  // I12: asked for by Book id, there is no ISBN, so Look it up again cannot run.
  it('carries no ISBN, and no Look it up again, when asked for by Book id', () => {
    expect(
      held(
        {
          kind: 'existing',
          book: { ...book, isbn13: null, visibility: 'private' },
          mine: { copies: [copy()], entries: [] },
        },
        null,
      ),
    ).toMatchObject({ isbn13: null, heading: 'inLibrary', lookAgain: false })
  })

  it('is not the answer when the viewer holds nothing, or for the other kinds', () => {
    expect(held({ kind: 'existing', book, mine: nothing }, ISBN)).toBeNull()
    expect(
      held(
        {
          kind: 'source',
          candidates: [draft()],
          pick: 0,
          matches: { authors: [], series: null, genres: [] },
          failed: [],
        },
        ISBN,
      ),
    ).toBeNull()
    expect(held({ kind: 'none' }, ISBN)).toBeNull()
    expect(held({ kind: 'unavailable', failed: ['finna'] }, ISBN)).toBeNull()
  })
})

describe('factLines', () => {
  const text: FactText = {
    copy: (status) => status,
    copyAt: (location, status) => `${location} · ${status}`,
    lent: (person) => `Lent · ${person}`,
    onList: (list) => `On ${list}`,
    onListFor: (list, person) => `On ${list} · for ${person}`,
  }
  const copyFact = (over: Partial<CopyLine> = {}): AnswerFactLine => ({
    kind: 'copy',
    copy: copy(over),
  })

  it('gives a line per fact in order, the location only when there is one', () => {
    expect(
      factLines(
        [
          copyFact({ copyId: 4, location: { id: 9, name: 'Tampere' } }),
          copyFact({ copyId: 2 }),
          copyFact({ copyId: 5, location: { id: 8, name: 'Mökki' }, loan }),
          // Its own borrower, not the line before's.
          copyFact({ copyId: 6, loan: { ...loan, loanId: 12, person: { id: 13, name: 'Leena' } } }),
          { kind: 'entry', entry },
          { kind: 'entry', entry: entryFor },
        ],
        text,
      ),
    ).toEqual([
      { text: 'Tampere · owned', lent: null, receive: null },
      { text: 'owned', lent: null, receive: null },
      { text: 'Mökki', lent: 'Lent · Antti', receive: null },
      { text: '', lent: 'Lent · Leena', receive: null },
      { text: 'On Toiveet', lent: null, receive: null },
      { text: 'On Lahjat · for Antti', lent: null, receive: null },
    ])
  })

  it("carries each ordered copy's own id for its Received Link", () => {
    expect(
      factLines(
        [
          copyFact({ copyId: 3, status: 'ordered' }),
          copyFact({ copyId: 8, status: 'ordered', location: { id: 9, name: 'Tampere' } }),
        ],
        text,
      ),
    ).toEqual([
      { text: 'ordered', lent: null, receive: 3 },
      { text: 'Tampere · ordered', lent: null, receive: 8 },
    ])
  })
})

describe('answerLines', () => {
  const text: AnswerText = {
    source: (id) => ({ finna: 'Finna', google: 'Google Books' })[id],
    from: (source) => `From ${source}`,
    pages: (pages) => `${pages} ${pages === 1 ? 'page' : 'pages'}`,
    newAuthor: (name) => `New author · ${name}`,
    newSeries: (name) => `New series · ${name}`,
    newGenre: (name) => `New genre · ${name}`,
  }
  const answer = (over: Partial<AnswerBook> = {}): AnswerBook => ({
    isbn13: '9789510396353',
    title: 'Muumipeikko ja pyrstötähti',
    language: 'fi',
    authors: ['Tove Jansson', 'Kristiina Kivivuori'],
    publisher: 'WSOY',
    year: 2014,
    pages: 180,
    cover: null,
    source: 'finna',
    newAuthors: ['Kristiina Kivivuori'],
    newSeries: 'Muumit',
    newGenres: ['Weird Science'],
    pick: 0,
    candidate: undefined,
    editions: [],
    failed: [],
    ...over,
  })

  it('names the source and each record a save would create', () => {
    expect(answerLines(answer(), text)).toEqual({
      authors: 'Tove Jansson, Kristiina Kivivuori',
      edition: 'WSOY · 2014 · 180 pages',
      notes: [
        'From Finna',
        'New author · Kristiina Kivivuori',
        'New series · Muumit',
        'New genre · Weird Science',
      ],
    })
  })

  it('skips missing edition parts and shows an unlabelled source by its id', () => {
    const lines = answerLines(
      answer({
        publisher: null,
        pages: 1,
        source: 'fixture',
        newAuthors: [],
        newSeries: null,
        newGenres: [],
      }),
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
          newGenres: [],
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
    ['a Book id', { book: '7' }, { book: 7 }],
    ['an ISBN with a Book id', { isbn: ISBN, book: '7' }, { isbn: ISBN }],
    ['a Book id with a title', { book: '7', title: 'x' }, { book: 7 }],
    ['a Book id that is not digits', { book: 'abc', title: 'x' }, { title: 'x' }],
    ['a Book id that is not digits, alone', { book: 'abc' }, {}],
    ['a Book id that is not a row id', { book: '0', title: 'x' }, { title: 'x' }],
    ['a Book id past the row-id range', { book: '99999999999', title: 'x' }, { title: 'x' }],
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
    language: 'en',
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
  it('answers held for anything the viewer holds, else Not in library', async () => {
    await expect(
      answerFor(ISBN, async () => ({
        kind: 'existing',
        book,
        mine: { copies: [copy()], entries: [] },
      })),
    ).resolves.toMatchObject({
      kind: 'held',
      answer: { title: 'Tuntematon sotilas', heading: 'inLibrary' },
    })
    await expect(
      answerFor(ISBN, async () => ({
        kind: 'existing',
        book,
        mine: { copies: [copy({ status: 'ordered' })], entries: [] },
      })),
    ).resolves.toMatchObject({ kind: 'held', answer: { heading: 'ordered' } })
    // Story 7.17's Not in library stopgap, retired (Epic 7 retrospective decision 2).
    await expect(
      answerFor(ISBN, async () => ({
        kind: 'existing',
        book,
        mine: { copies: [], entries: [entryFor] },
      })),
    ).resolves.toMatchObject({ kind: 'held', answer: { heading: 'onWishlist' } })
    await expect(
      answerFor(ISBN, async () => ({ kind: 'existing', book, mine: nothing })),
    ).resolves.toMatchObject({ kind: 'notInLibrary', answer: { title: 'Tuntematon sotilas' } })
  })

  // NFR-1: a scan never resets silently. Every `LookupResult` shape, named.
  it.each([
    ['an owned copy', { kind: 'existing', book, mine: { copies: [copy()], entries: [] } }],
    [
      'an ordered copy',
      { kind: 'existing', book, mine: { copies: [copy({ status: 'ordered' })], entries: [] } },
    ],
    ['an open entry', { kind: 'existing', book, mine: { copies: [], entries: [entry] } }],
    ['a Book held nothing of', { kind: 'existing', book, mine: nothing }],
    [
      'a Book whose own isbn13 is unset',
      { kind: 'existing', book: { ...book, isbn13: null }, mine: nothing },
    ],
    [
      'a source candidate',
      {
        kind: 'source',
        candidates: [draft()],
        pick: 0,
        matches: { authors: [], series: null, genres: [] },
        failed: [],
      },
    ],
    [
      'a picked candidate that has gone',
      {
        kind: 'source',
        candidates: [],
        pick: 0,
        matches: { authors: [], series: null, genres: [] },
        failed: [],
      },
    ],
    ['no source knowing the ISBN', { kind: 'none' }],
    ['a source that failed', { kind: 'unavailable', failed: ['finna'] }],
  ] as [string, LookupResult][])('ends on an Answer for %s', async (_, result) => {
    const outcome = await answerFor(ISBN, async () => result)
    expect(outcome.kind).not.toBe('scan')
  })

  it('ends on Not found when the picked candidate has gone', async () => {
    await expect(
      answerFor(ISBN, async () => ({
        kind: 'source',
        candidates: [],
        pick: 0,
        matches: { authors: [], series: null, genres: [] },
        failed: [],
      })),
    ).resolves.toEqual({ kind: 'notFound', isbn13: ISBN, title: '' })
  })

  it('answers Not found with the ISBN in 13 digits when no source knows it', async () => {
    await expect(answerFor('951-0-39707-5', async () => ({ kind: 'none' }))).resolves.toEqual({
      kind: 'notFound',
      isbn13: '9789510397077',
      title: '',
    })
  })

  it("answers Couldn't look it up with the ISBN in 13 digits and the failed sources in order", async () => {
    await expect(
      answerFor('951-0-39707-5', async () => ({
        kind: 'unavailable',
        failed: ['google', 'finna'],
      })),
    ).resolves.toEqual({
      kind: 'unavailable',
      isbn13: '9789510397077',
      failed: ['google', 'finna'],
    })
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

// I12: `/scan?book=` ends on the held Answer or back on Scan with the notice.
describe('answerForBook', () => {
  it('answers held with no ISBN for a Book that has none', async () => {
    await expect(
      answerForBook(async () => ({
        kind: 'existing',
        book: { ...book, isbn13: null },
        mine: { copies: [copy()], entries: [] },
      })),
    ).resolves.toMatchObject({
      kind: 'held',
      answer: { bookId: 7, isbn13: null, heading: 'inLibrary' },
    })
  })

  // A Book with an ISBN must behave as its `?isbn=` Answer does: the saves
  // target the ISBN, and Look it up again is offered on the viewer's own
  // private Book.
  it("carries the Book's own ISBN when it has one", async () => {
    await expect(
      answerForBook(async () => ({
        kind: 'existing',
        book: { ...book, visibility: 'private' },
        mine: { copies: [copy()], entries: [] },
      })),
    ).resolves.toMatchObject({
      kind: 'held',
      answer: { isbn13: book.isbn13, heading: 'inLibrary', lookAgain: true },
    })
    await expect(
      answerForBook(async () => ({
        kind: 'existing',
        book,
        mine: { copies: [], entries: [entry] },
      })),
    ).resolves.toMatchObject({ kind: 'held', answer: { heading: 'onWishlist' } })
  })

  it('ends on Scan with the notice when the viewer holds nothing of it', async () => {
    await expect(
      answerForBook(async () => ({ kind: 'existing', book, mine: nothing })),
    ).resolves.toEqual({ kind: 'notHeld' })
  })

  it('ends on Scan with the notice for a Book that is not the viewer’s', async () => {
    await expect(
      answerForBook(async () => {
        throw new DomainError('NOT_FOUND')
      }),
    ).resolves.toEqual({ kind: 'notHeld' })
  })

  it('lets any other error through', async () => {
    await expect(
      answerForBook(async () => {
        throw new DomainError('SAVE_FAILED')
      }),
    ).rejects.toMatchObject(new DomainError('SAVE_FAILED'))
  })
})
