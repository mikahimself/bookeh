import type { EffectiveBook } from '@/lib/books/effectiveBook'
import type { CopyLine } from '@/lib/books/holdings'
import type { SearchDraft } from '@/lib/catalogue/searchBooks'
import type { MyBook } from '@/lib/shelf/query'

/**
 * The shapes Lookup's two groups are built from (Story 8.8), in one place so a
 * new `EffectiveBook` or `SearchDraft` field is filled once. Mock-free: both
 * the builder's spec and the page's spec import it, and the page's spec mocks
 * at module scope.
 */

export const book = (over: Partial<EffectiveBook> = {}): EffectiveBook => ({
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

export const copy = (over: Partial<CopyLine> = {}): CopyLine => ({
  copyId: 11,
  status: 'owned',
  location: { id: 2, name: 'Tampere' },
  note: null,
  loan: null,
  acquiredAt: '2026-10-12',
  price: null,
  ...over,
})

/** One of the viewer's own Books, holding the given copies and no entries. */
export const mine = (over: Partial<EffectiveBook> = {}, copies: CopyLine[] = [copy()]): MyBook => ({
  book: book(over),
  mine: { copies, entries: [] },
})

export const hit = (over: Partial<SearchDraft> = {}): SearchDraft => ({
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
