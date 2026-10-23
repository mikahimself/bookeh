import { OVERRIDABLE_BOOK_FIELDS, type OverridableBookField } from '@/fields/bookFields'
import type { BookOverrides } from '@/lib/books/upsertUserBook'
import type { SourceResult } from '@/lib/metadata/source'
import type { Author, Book, Series } from '@/payload-types'

// D-8: which of a private Book's hand-entered values a share keeps as the
// user's overrides. Pure; `sharePrivateBook.ts` reads the Books and writes.

type ScalarField = Exclude<OverridableBookField, 'authors' | 'series'>
const SCALAR_FIELDS = OVERRIDABLE_BOOK_FIELDS.filter(
  (key): key is ScalarField => key !== 'authors' && key !== 'series',
)

/** A Book's overridable values as read for a share, relations populated. */
export type BookValues = Pick<Book, 'id' | 'cover' | OverridableBookField>

/** The values a private Book is compared with: scalars present, text and names as loose keys. */
export type Comparable = {
  scalars: Partial<Record<ScalarField, string | number>>
  authors: string[]
  series: string | undefined
}

/**
 * D-8 only: NFC, lower-cased, every punctuation, format (soft hyphen,
 * zero-width space), modifier symbol (´ as an apostrophe) and whitespace
 * character removed; accents kept. Not `toNameKey()`, which keys the unique `nameKey`
 * columns and must keep punctuation ("A.B." and "AB" can be two authors).
 */
const looseKey = (text: string) =>
  text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\p{P}\p{Cf}\p{Sk}\s]/gu, '')

const compareKey = (value: string | number) => (typeof value === 'string' ? looseKey(value) : value)

export const populated = <T extends Author | Series>(value: number | T | null | undefined): T => {
  if (typeof value !== 'object' || value === null) throw new Error('Relation not populated')
  return value
}

export const idOf = (value: number | { id: number }): number =>
  typeof value === 'number' ? value : value.id

export function fromBook(book: BookValues): Comparable {
  const scalars: Comparable['scalars'] = {}
  for (const key of SCALAR_FIELDS) {
    const value = book[key]
    if (value !== null && value !== undefined) scalars[key] = compareKey(value)
  }
  return {
    scalars,
    authors: (book.authors ?? []).map((author) => looseKey(populated<Author>(author).name)),
    series: book.series == null ? undefined : looseKey(populated<Series>(book.series).name),
  }
}

export function fromCandidate(candidate: SourceResult): Comparable {
  const scalars: Comparable['scalars'] = {}
  for (const key of SCALAR_FIELDS) {
    const value = candidate[key]
    if (value !== undefined) scalars[key] = compareKey(value)
  }
  return {
    scalars,
    authors: candidate.authors.map(({ name }) => looseKey(name)),
    series: candidate.series === undefined ? undefined : looseKey(candidate.series),
  }
}

/** D-8: the private Book's values the target lacks or holds differently, as overrides. */
export function differing(own: BookValues, target: Comparable): BookOverrides {
  const mine = fromBook(own)
  const entries: [OverridableBookField, unknown][] = []
  for (const key of SCALAR_FIELDS) {
    const value = mine.scalars[key]
    if (value !== undefined && value !== target.scalars[key]) entries.push([key, own[key]])
  }
  const sameAuthors =
    mine.authors.length === target.authors.length &&
    mine.authors.every((key, i) => key === target.authors[i])
  if (mine.authors.length > 0 && !sameAuthors) {
    entries.push(['authors', (own.authors ?? []).map(idOf)])
  }
  if (mine.series !== undefined && mine.series !== target.series && own.series != null) {
    entries.push(['series', idOf(own.series)])
  }
  // `fromEntries` loses the key-to-value pairing; each value is the Book's own field.
  return Object.fromEntries(entries) as BookOverrides
}
