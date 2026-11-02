import { coverUrl } from '@/lib/books/coverUrl'
import type { SearchDraft } from '@/lib/catalogue/searchBooks'
import type { MyBook } from '@/lib/shelf/query'

import { isLent } from '../../isLent'

/** One Lookup result row, ready to draw: the row component holds no logic. */
export type LookupRowData = {
  href: string
  cover: string | null
  title: string
  language: string | null
  authors: string
  edition: string
  lentTo: string | null
}

/** The parts that exist, joined; `BookRow`'s meta separator. */
const joined = (parts: (string | number | null | undefined)[]): string =>
  parts.filter((part) => part !== null && part !== undefined && part !== '').join(' · ')

const names = (authors: { name: string }[]): string =>
  authors.map((author) => author.name).join(', ')

/**
 * EXPERIENCE.md, Lookup: the two result groups, "In your library" first.
 *
 * An own row addresses `/scan?book=<bookId>`, which asks no source and counts
 * no lookup (AD-9), whether or not the Book has an ISBN; an Elsewhere row
 * addresses `/scan?isbn=<isbn13>`. A hit whose ISBN-13 is the effective
 * ISBN-13 of a Book in the own group is dropped: one book is one row, and the
 * own group is the answer for it. A Book without an ISBN can never be dropped.
 *
 * The cover is the own Book's stored cover, or, for a hit, the preview route
 * for its ISBN when a source had one (`hasCover`) and `null` otherwise, so the
 * placeholder stands in where nothing can be served; a source's own URL never
 * reaches the browser (AD-14). The edition line is `binding · year ·
 * publisher` for a hit and `year · publisher` for an own Book, which stores no
 * binding. The own row's ending is its first lent copy's borrower (FR-37).
 *
 * Pure and hook-free: the page passes what the two searches answered, in the
 * order they answered it, and no ordering happens here.
 */
export function lookupRows(
  own: readonly MyBook[],
  hits: readonly SearchDraft[],
): { mine: LookupRowData[]; elsewhere: LookupRowData[] } {
  const mine = own.map(({ book, mine: holdings }) => ({
    href: `/scan?book=${book.bookId}`,
    cover: book.coverUrl,
    title: book.title,
    language: book.language,
    authors: names(book.authors),
    edition: joined([book.year, book.publisher]),
    lentTo: holdings.copies.find(isLent)?.loan.person.name ?? null,
  }))

  const held = new Set(own.flatMap(({ book }) => (book.isbn13 === null ? [] : [book.isbn13])))
  const elsewhere = hits
    .filter((hit) => !held.has(hit.isbn13))
    .map((hit) => ({
      href: `/scan?isbn=${encodeURIComponent(hit.isbn13)}`,
      cover: hit.hasCover ? coverUrl({ isbn13: hit.isbn13 }) : null,
      title: hit.title,
      // A hit carries no language; the placeholder hyphenates in Finnish.
      language: null,
      authors: names(hit.authors),
      edition: joined([hit.binding, hit.year, hit.publisher]),
      lentTo: null,
    }))

  return { mine, elsewhere }
}
