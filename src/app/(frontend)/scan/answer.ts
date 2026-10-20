import { normaliseIsbn } from '@/fields/isbn'
import { coverUrl } from '@/lib/books/coverUrl'
import type { LookupResult } from '@/lib/catalogue/lookupBook'
import { DomainError } from '@/lib/errors'
import type { SourceId } from '@/lib/metadata/source'

/**
 * One source candidate in the edition picker (EXPERIENCE.md, Answer, Several
 * editions; D-7), each part `null` when the candidate has none. `cover` is
 * its pre-save preview, `title` its own title for the cover placeholder.
 */
export type AnswerEdition = {
  title: string
  binding: string | null
  year: number | null
  publisher: string | null
  pages: number | null
  cover: string | null
}

/**
 * The Book an Answer shows (EXPERIENCE.md, Answer). `source` is the source
 * id, `null` for a shared Book; `newAuthors` and `newSeries` are the rows a
 * save would create; `isbn13` is what Add to library and Add another copy
 * save, with `pick`, the source candidate shown when there are several
 * (`undefined` for one candidate or a Book that exists). `editions` lists
 * every candidate in order when there are two or more, else it is empty.
 * Nothing here comes from a user record.
 */
export type AnswerBook = {
  isbn13: string
  title: string
  authors: string[]
  publisher: string | null
  year: number | null
  pages: number | null
  cover: string | null
  source: string | null
  newAuthors: string[]
  newSeries: string | null
  pick: number | undefined
  editions: AnswerEdition[]
}

/** One of the viewer's copies on the In library Answer: its location's name, if any, and status. */
export type AnswerCopy = { location: string | null; status: 'owned' | 'ordered' }

/** What the In library Answer shows: the Book and the viewer's copies, oldest first. */
export type InLibrary = AnswerBook & { copies: AnswerCopy[] }

type ExistingResult = Extract<LookupResult, { kind: 'existing' }>

/** A Book the viewer can read: no source line, and a save creates nothing new. */
const existingBook = (book: ExistingResult['book'], isbn13: string): AnswerBook => ({
  isbn13,
  title: book.title,
  authors: book.authors.map(({ name }) => name),
  publisher: book.publisher,
  year: book.year,
  pages: book.pages,
  cover: book.coverUrl,
  source: null,
  newAuthors: [],
  newSeries: null,
  pick: undefined,
  editions: [],
})

/**
 * The Not in library Answer for a lookup, or `null` when another Answer
 * applies: the picked source candidate, or a Book the viewer can read and
 * holds nothing of. Epic 8's `answerFacts` takes over heading precedence.
 * A Book with no ISBN has none: the lookup found it by its ISBN.
 */
export function notInLibrary(result: LookupResult): AnswerBook | null {
  switch (result.kind) {
    case 'existing': {
      const { book, mine } = result
      if (book.isbn13 === null || mine.copies.length > 0 || mine.entries.length > 0) return null
      return existingBook(book, book.isbn13)
    }
    case 'source': {
      const { candidates, pick } = result
      const draft = candidates[pick]
      if (!draft) return null
      const { series } = result.matches
      // Every candidate carries the ISBN asked for (the `Source` contract).
      const { isbn13 } = draft
      // With one candidate there is nothing to pick: the save sends none.
      const several = candidates.length > 1
      return {
        isbn13,
        title: draft.title,
        authors: draft.authors.map(({ name }) => name),
        publisher: draft.publisher ?? null,
        year: draft.year ?? null,
        pages: draft.pages ?? null,
        cover: draft.hasCover ? coverUrl(several ? { isbn13, pick } : { isbn13 }) : null,
        source: draft.source,
        newAuthors: result.matches.authors.filter(({ id }) => id === null).map(({ name }) => name),
        newSeries: series !== null && series.id === null ? series.name : null,
        pick: several ? pick : undefined,
        editions: !several
          ? []
          : candidates.map((candidate, i) => ({
              title: candidate.title,
              binding: candidate.binding ?? null,
              year: candidate.year ?? null,
              publisher: candidate.publisher ?? null,
              pages: candidate.pages ?? null,
              cover: candidate.hasCover ? coverUrl({ isbn13, pick: i }) : null,
            })),
      }
    }
    default:
      return null
  }
}

/**
 * The In library Answer (FR-16, FR-20, FR-30): a Book the viewer holds at
 * least one copy of, with each copy's location and status in Holdings order.
 * `null` for anything else; a Book held only by wishlist entries is On
 * wishlist's (Epic 7/8). A Book with no ISBN has none, as in `notInLibrary`.
 * Any copy counts, ordered included, so an ordered-only holding shows In
 * library with an "Ordered" line until the Ordered heading arrives (Story
 * 8.2, as Story 4.9's AC says).
 */
export function inLibrary(result: LookupResult): InLibrary | null {
  if (result.kind !== 'existing') return null
  const { book, mine } = result
  if (book.isbn13 === null || mine.copies.length === 0) return null
  return {
    ...existingBook(book, book.isbn13),
    copies: mine.copies.map(({ location, status }) => ({
      location: location?.name ?? null,
      status,
    })),
  }
}

/** The catalogue strings the Answer's lines are built from; `source` is `undefined` for an id with no label. */
export type AnswerText = {
  source: (id: string) => string | undefined
  from: (source: string) => string
  pages: (pages: number) => string
  newAuthor: (name: string) => string
  newSeries: (name: string) => string
}

/**
 * The Answer's text lines: the authors joined ", ", the edition parts that
 * exist joined " · " (empty when none), and the source line followed by a note
 * per record a save would create. A source the catalogue has no label for
 * shows its id.
 */
export function answerLines(
  answer: AnswerBook,
  text: AnswerText,
): { authors: string; edition: string; notes: string[] } {
  const edition = [
    answer.publisher,
    answer.year === null ? null : String(answer.year),
    answer.pages === null ? null : text.pages(answer.pages),
  ]
    .filter((part) => part)
    .join(' · ')
  const notes = [
    ...(answer.source === null ? [] : [text.from(text.source(answer.source) ?? answer.source)]),
    ...answer.newAuthors.map(text.newAuthor),
    ...(answer.newSeries === null ? [] : [text.newSeries(answer.newSeries)]),
  ]
  return { authors: answer.authors.join(', '), edition, notes }
}

/** The catalogue strings an edition's line is built from. */
export type EditionText = {
  pages: (pages: number) => string
  unnamed: (n: number) => string
}

/**
 * The edition picker's row for candidate `index`: the parts that exist
 * (binding, year, publisher, pages) joined " · ", or its number from 1 when
 * it has none, so every row can still be told apart.
 */
export function editionLine(edition: AnswerEdition, index: number, text: EditionText): string {
  const line = [
    edition.binding,
    edition.year === null ? null : String(edition.year),
    edition.publisher,
    edition.pages === null ? null : text.pages(edition.pages),
  ]
    .filter((part) => part)
    .join(' · ')
  return line || text.unnamed(index + 1)
}

/**
 * The edition picker's rows in order: each `editionLine()`, and a line that
 * another row also has gets its number appended, so no two rows read the same.
 */
export function editionLines(editions: AnswerEdition[], text: EditionText): string[] {
  const lines = editions.map((edition, index) => editionLine(edition, index, text))
  return lines.map((line, index) =>
    lines.indexOf(line) === lines.lastIndexOf(line) ? line : `${line} · ${text.unnamed(index + 1)}`,
  )
}

/** The catalogue strings the In library Answer's copy lines are built from. */
export type CopyText = {
  copy: (status: AnswerCopy['status']) => string
  copyAt: (location: string, status: AnswerCopy['status']) => string
}

/** A line per copy, in order: its location and status, or the status alone with no location. */
export function copyLines(copies: AnswerCopy[], text: CopyText): string[] {
  return copies.map(({ location, status }) =>
    location === null ? text.copy(status) : text.copyAt(location, status),
  )
}

/**
 * What `/scan` was asked for: `isbn`, the text as typed when it is not blank
 * (Go on an empty field is no submission), else `title` when the key is
 * present, even empty (Add without ISBN opens `?title=`). With an `isbn`,
 * `title` is ignored. With an `isbn`, `pick` is the edition picked (D-7)
 * when it is digits, else left out. A repeated key counts by its first value.
 */
export function scanParams(params: Record<string, string | string[] | undefined>): {
  isbn?: string
  title?: string
  pick?: number
} {
  const isbn = first(params.isbn)
  if (isbn?.trim()) {
    const pick = first(params.pick)
    return pick !== undefined && /^\d+$/.test(pick) ? { isbn, pick: Number(pick) } : { isbn }
  }
  const title = first(params.title)
  return title === undefined ? {} : { title }
}

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value

export type ScanOutcome =
  | { kind: 'inLibrary'; answer: InLibrary }
  | { kind: 'notInLibrary'; answer: AnswerBook }
  | { kind: 'notFound'; isbn13: string | null; title: string }
  | { kind: 'unavailable'; isbn13: string; failed: SourceId[] }
  | { kind: 'scan'; error?: 'INVALID_ISBN' | 'RATE_LIMITED' }

/**
 * What `/scan?isbn=` renders for `isbn`, the text as typed: the In library
 * Answer, the Not in library Answer, the Not found Answer when no source
 * knows the ISBN (with it in 13 digits: the lookup has accepted the text),
 * Couldn't look it up when a source failed and none had it (with the ISBN
 * likewise, and the failed sources in the lookup's order: AD-9), or Scan,
 * with the field error or rate-limit toast the lookup refused with. Any other
 * error propagates to Next's error handling.
 */
export async function answerFor(
  isbn: string,
  lookup: (isbn: string) => Promise<LookupResult>,
): Promise<ScanOutcome> {
  let result: LookupResult
  try {
    result = await lookup(isbn)
  } catch (err) {
    if (
      err instanceof DomainError &&
      (err.code === 'INVALID_ISBN' || err.code === 'RATE_LIMITED')
    ) {
      return { kind: 'scan', error: err.code }
    }
    throw err
  }
  if (result.kind === 'none') return { kind: 'notFound', isbn13: normaliseIsbn(isbn), title: '' }
  if (result.kind === 'unavailable') {
    return { kind: 'unavailable', isbn13: normaliseIsbn(isbn), failed: result.failed }
  }
  const held = inLibrary(result)
  if (held) return { kind: 'inLibrary', answer: held }
  const answer = notInLibrary(result)
  return answer ? { kind: 'notInLibrary', answer } : { kind: 'scan' }
}
