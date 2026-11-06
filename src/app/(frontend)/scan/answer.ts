import { normaliseIsbn } from '@/fields/isbn'
import { coverUrl } from '@/lib/books/coverUrl'
import { answerFacts, type AnswerFactLine, type AnswerHeading } from '@/lib/catalogue/answerFacts'
import type { Draft, LookupResult } from '@/lib/catalogue/lookupBook'
import type { CandidateId } from '@/lib/catalogue/pick'
import { DomainError } from '@/lib/errors'
import type { SourceId } from '@/lib/metadata/source'
import { isRowId } from '@/lib/payload/ref'

import type { MyBook } from '@/lib/shelf/query'

import { isLent } from '../isLent'

/**
 * One source candidate in the edition picker (EXPERIENCE.md, Answer, Several
 * editions; D-7), each part `null` when the candidate has none. `cover` is
 * its pre-save preview, `title` and `language` its own, for the cover
 * placeholder.
 */
export type AnswerEdition = {
  title: string
  language: string | null
  binding: string | null
  year: number | null
  publisher: string | null
  pages: number | null
  cover: string | null
}

/**
 * The Book an Answer shows (EXPERIENCE.md, Answer). `source` is the source
 * id, `null` for a shared Book; `newAuthors`, `newSeries` and `newGenres` are the rows a
 * save would create; `isbn13` is the ISBN the Answer was asked for, `null`
 * for a held Book that has none (I12), in which case the saves target the
 * Book by id instead, with `pick`, the source candidate shown when there are
 * several (`undefined` for one candidate or a Book that exists), and
 * `candidate`,
 * the shown candidate's identity, so the save uses that record or none
 * (AD-11; `undefined` for a Book that exists). `editions` lists
 * every candidate in order when there are two or more, else it is empty.
 * `failed` names the sources that didn't answer the lookup that found the
 * candidate (`[]` for a Book that exists).
 * Nothing here comes from a user record.
 */
export type AnswerBook = {
  isbn13: string | null
  title: string
  language: string | null
  authors: string[]
  publisher: string | null
  year: number | null
  pages: number | null
  cover: string | null
  source: string | null
  newAuthors: string[]
  newSeries: string | null
  newGenres: string[]
  pick: number | undefined
  candidate: CandidateId | undefined
  editions: AnswerEdition[]
  failed: SourceId[]
}

/**
 * An Answer that carries an ISBN: every Answer a lookup by ISBN produces,
 * `notInLibrary()`'s included. The edition picker, the pre-save cover preview
 * and Add to wishlist all address the ISBN, so they take this.
 */
export type SourceAnswer = AnswerBook & { isbn13: string }

/**
 * What a held Answer shows (FR-16, FR-20): the Book, the heading
 * `answerFacts()` gave the viewer's holdings, and every remaining fact as a
 * line, in `Holdings` order. `bookId` is the Book Open book shows in the
 * collection. `lookAgain`: the In library Answer on the viewer's own private
 * Book with an ISBN (the lookup never answers with another user's), so Look
 * it up again shows (EXPERIENCE.md, Answer screens: that Link is In
 * library's alone).
 */
export type HeldAnswer = AnswerBook & {
  bookId: number
  heading: Exclude<AnswerHeading, 'notInLibrary'>
  lookAgain: boolean
  facts: AnswerFactLine[]
}

type ExistingResult = Extract<LookupResult, { kind: 'existing' }>

/**
 * The edition picker's candidates in order (D-7), each cover the pre-save
 * preview at its index (`recordCoverPreview()` holds the URLs). For the
 * Answer and Look it up again.
 */
export function answerEditions(isbn13: string, drafts: readonly Draft[]): AnswerEdition[] {
  return drafts.map((draft, i) => ({
    title: draft.title,
    language: draft.language ?? null,
    binding: draft.binding ?? null,
    year: draft.year ?? null,
    publisher: draft.publisher ?? null,
    pages: draft.pages ?? null,
    cover: draft.hasCover ? coverUrl({ isbn13, pick: i }) : null,
  }))
}

/** A Book the viewer can read: no source line, and a save creates nothing new. */
const existingBook = (book: ExistingResult['book'], isbn13: string | null): AnswerBook => ({
  isbn13,
  title: book.title,
  language: book.language,
  authors: book.authors.map(({ name }) => name),
  publisher: book.publisher,
  year: book.year,
  pages: book.pages,
  cover: book.coverUrl,
  source: null,
  newAuthors: [],
  newSeries: null,
  newGenres: [],
  pick: undefined,
  candidate: undefined,
  editions: [],
  failed: [],
})

/**
 * The Not in library Answer for a lookup, or `null` when another Answer
 * applies: the picked source candidate, or a Book the viewer can read and
 * holds nothing of. `isbn13` is the ISBN asked for, so a Book whose own
 * `isbn13` is unset still answers (`held()` takes the same). Heading
 * precedence is `answerFacts()`': anything the viewer holds of the Book,
 * a copy or an open entry, belongs to `held()`.
 */
export function notInLibrary(result: LookupResult, isbn13: string): SourceAnswer | null {
  switch (result.kind) {
    case 'existing': {
      const { book, mine } = result
      if (answerFacts(mine).heading !== 'notInLibrary') return null
      return { ...existingBook(book, isbn13), isbn13 }
    }
    case 'source': {
      const { candidates, pick } = result
      const draft = candidates[pick]
      if (!draft) return null
      const { series } = result.matches
      // With one candidate there is nothing to pick: the save sends none.
      const several = candidates.length > 1
      return {
        // Every candidate carries the ISBN asked for (the `Source` contract).
        isbn13,
        title: draft.title,
        language: draft.language ?? null,
        authors: draft.authors.map(({ name }) => name),
        publisher: draft.publisher ?? null,
        year: draft.year ?? null,
        pages: draft.pages ?? null,
        cover: draft.hasCover ? coverUrl(several ? { isbn13, pick } : { isbn13 }) : null,
        source: draft.source,
        newAuthors: result.matches.authors.filter(({ id }) => id === null).map(({ name }) => name),
        newSeries: series !== null && series.id === null ? series.name : null,
        newGenres: result.matches.genres.filter(({ id }) => id === null).map(({ name }) => name),
        pick: several ? pick : undefined,
        candidate: { source: draft.source, recordId: draft.recordId },
        editions: several ? answerEditions(isbn13, candidates) : [],
        failed: result.failed,
      }
    }
    default:
      return null
  }
}

/**
 * The held Answer (FR-16, FR-20, FR-30): a Book the viewer holds a copy or an
 * open wishlist entry of, with `answerFacts()`'s heading -- In library,
 * Ordered or On wishlist -- and its lines. `null` for anything else: a
 * `source` result, and an `existing` one the viewer holds nothing of, which is
 * `notInLibrary()`'s. `isbn13` is the ISBN asked for, which Add to library and
 * Add another copy save; `null` when the Answer was asked for by Book id
 * (I12), and then the saves target the Book by id. `lookAgain` needs an
 * ISBN: `lookupAgain()` is `NOT_FOUND` without one, and Book detail shows
 * the "needs an ISBN" line in place of the Link for such a Book.
 */
export function held(result: LookupResult, isbn13: string | null): HeldAnswer | null {
  if (result.kind !== 'existing') return null
  const { book, mine } = result
  const { heading, lines } = answerFacts(mine)
  if (heading === 'notInLibrary') return null
  return {
    ...existingBook(book, isbn13),
    bookId: book.bookId,
    heading,
    lookAgain: isbn13 !== null && heading === 'inLibrary' && book.visibility === 'private',
    facts: lines,
  }
}

/** The catalogue strings the Answer's lines are built from; `source` is `undefined` for an id with no label. */
export type AnswerText = {
  source: (id: string) => string | undefined
  from: (source: string) => string
  pages: (pages: number) => string
  newAuthor: (name: string) => string
  newSeries: (name: string) => string
  newGenre: (name: string) => string
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
    ...answer.newGenres.map(text.newGenre),
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

/** The catalogue strings a held Answer's fact lines are built from. */
export type FactText = {
  copy: (status: 'owned' | 'ordered') => string
  copyAt: (location: string, status: 'owned' | 'ordered') => string
  lent: (person: string) => string
  onList: (list: string) => string
  onListFor: (list: string, person: string) => string
}

/**
 * One fact line: `text`, then the lent marker and `lent` when `lent` is not
 * `null`. A lent copy's `text` is its location's name, `''` with none.
 * `receive` is the copy id an ordered copy's Received Link acts on, `null` on
 * every other line.
 */
export type AnswerLine = { text: string; lent: string | null; receive: number | null }

/**
 * A line per fact, in `answerFacts()` order: a copy's location and status, or
 * the status alone with no location; a lent copy's is its location, if any,
 * and "Lent · {person}"; an ordered copy's carries its own `receive`. An
 * entry's names its list, and its recipient too when it has one.
 */
export function factLines(facts: readonly AnswerFactLine[], text: FactText): AnswerLine[] {
  return facts.map((fact) => {
    if (fact.kind === 'entry') {
      const { wishlist, forPerson } = fact.entry
      return {
        text:
          forPerson === null
            ? text.onList(wishlist.name)
            : text.onListFor(wishlist.name, forPerson.name),
        lent: null,
        receive: null,
      }
    }
    const { copy } = fact
    const location = copy.location?.name ?? null
    // An ordered copy is never lent (`isLent`), so the two never meet.
    if (isLent(copy)) {
      return { text: location ?? '', lent: text.lent(copy.loan.person.name), receive: null }
    }
    return {
      text: location === null ? text.copy(copy.status) : text.copyAt(location, copy.status),
      lent: null,
      receive: copy.status === 'ordered' ? copy.copyId : null,
    }
  })
}

/**
 * Another edition the viewer holds, for the Answer's notice (FR-20; option B
 * of `mockups/other-edition-options.html`): a different Book of the same work
 * that the viewer has a copy of. `edition` is "publisher · year", the parts
 * that exist (empty when none); `facts` are that Book's copies alone, for
 * `factLines()`; `title` and `language` feed the cover placeholder.
 */
export type OtherEdition = {
  bookId: number
  cover: string | null
  title: string
  language: string | null
  edition: string
  facts: AnswerFactLine[]
}

/**
 * The notice's rows, one per Book in `otherEditions()` order. Only copies
 * make a line: an entry on the other Book never counts as holding it.
 */
export function otherEditionRows(books: readonly MyBook[]): OtherEdition[] {
  return books.map(({ book, mine }) => ({
    bookId: book.bookId,
    cover: book.coverUrl,
    title: book.title,
    language: book.language,
    edition: [book.publisher, book.year === null ? null : String(book.year)]
      .filter((part) => part)
      .join(' · '),
    facts: mine.copies.map((copy): AnswerFactLine => ({ kind: 'copy', copy })),
  }))
}

/**
 * What `/scan` was asked for, in order: `isbn`, the text as typed when it is
 * not blank (Go on an empty field is no submission); else `book`, a Book id
 * when the value is a row id (the Answer for a Book with no ISBN, I12); else
 * `title` when the key is present, even empty (Add without ISBN opens
 * `?title=`). An earlier param wins, so an address with both `isbn` and
 * `book` answers the ISBN. A `book` that is not a row id is ignored and the
 * next param is read. With an `isbn`, `pick` is the edition picked (D-7)
 * when it is digits, else left out. A repeated key counts by its first value.
 */
export function scanParams(params: Record<string, string | string[] | undefined>): {
  isbn?: string
  book?: number
  title?: string
  pick?: number
} {
  const isbn = first(params.isbn)
  if (isbn?.trim()) {
    const pick = first(params.pick)
    return pick !== undefined && /^\d+$/.test(pick) ? { isbn, pick: Number(pick) } : { isbn }
  }
  const book = first(params.book)
  if (book !== undefined && /^\d+$/.test(book) && isRowId(Number(book))) {
    return { book: Number(book) }
  }
  const title = first(params.title)
  return title === undefined ? {} : { title }
}

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value

export type ScanOutcome =
  | { kind: 'held'; answer: HeldAnswer }
  | { kind: 'notInLibrary'; answer: SourceAnswer }
  | { kind: 'notFound'; isbn13: string | null; title: string }
  | { kind: 'unavailable'; isbn13: string; failed: SourceId[] }
  | { kind: 'notHeld' }
  | { kind: 'scan'; error?: 'INVALID_ISBN' | 'RATE_LIMITED' }

/**
 * What `/scan?isbn=` renders for `isbn`, the text as typed: the held Answer
 * (In library, Ordered or On wishlist), the Not in library Answer, the Not
 * found Answer when no source knows the ISBN (with it in 13 digits: the lookup
 * has accepted the text), Couldn't look it up when a source failed and none
 * had it (with the ISBN likewise, and the failed sources in the lookup's
 * order: AD-9), or Scan, with the field error or rate-limit toast the lookup
 * refused with. Any other error propagates to Next's error handling.
 *
 * NFR-1, "a scan never resets silently": every finished lookup ends on an
 * Answer. The Answers take the normalised ISBN asked for rather than the
 * found Book's, so no `existing` result falls through; a `source` result whose
 * picked candidate has gone since (a `pick` the outcome no longer holds) ends
 * on Not found with that ISBN. A bare `{ kind: 'scan' }` is returned nowhere.
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
  // The lookup accepted the text, so this cannot refuse it.
  const isbn13 = normaliseIsbn(isbn)
  if (result.kind === 'none') return { kind: 'notFound', isbn13, title: '' }
  if (result.kind === 'unavailable') {
    return { kind: 'unavailable', isbn13, failed: result.failed }
  }
  const holding = held(result, isbn13)
  if (holding) return { kind: 'held', answer: holding }
  const answer = notInLibrary(result, isbn13)
  return answer ? { kind: 'notInLibrary', answer } : { kind: 'notFound', isbn13, title: '' }
}

/**
 * What `/scan?book=<bookId>` renders (I12): the held Answer -- In library,
 * Ordered or On wishlist -- for a Book the viewer holds, carrying the Book's
 * own ISBN, so a Book with one behaves exactly as its `?isbn=` Answer would
 * and a Book with none still gets an Answer. A Book the viewer holds
 * nothing of ends on `notHeld`: the page renders Scan with the "Not in
 * library" notice, as the section does for the same address, so NFR-1's "a
 * scan never resets silently" holds. That covers the lookup's `NOT_FOUND`
 * (not the viewer's Book, or not a row id) and an `existing` result the
 * viewer holds nothing of -- a holding lost between the gate and the read.
 * Any other error propagates to Next's error handling.
 */
export async function answerForBook(lookup: () => Promise<LookupResult>): Promise<ScanOutcome> {
  let result: LookupResult
  try {
    result = await lookup()
  } catch (err) {
    if (err instanceof DomainError && err.code === 'NOT_FOUND') return { kind: 'notHeld' }
    throw err
  }
  // The Book's own ISBN, so a Book that has one saves and looks itself up by
  // it exactly as the `?isbn=` Answer does (AD-5); `null` for one with none.
  const isbn13 = result.kind === 'existing' ? result.book.isbn13 : null
  const holding = held(result, isbn13)
  return holding ? { kind: 'held', answer: holding } : { kind: 'notHeld' }
}
