import { coverUrl } from '@/lib/books/coverUrl'
import type { LookupResult } from '@/lib/catalogue/lookupBook'
import { DomainError } from '@/lib/errors'

/**
 * What the Not in library Answer shows (EXPERIENCE.md, Answer). `source` is
 * the source id, `null` for a shared Book; `newAuthors` and `newSeries` are
 * the rows a save would create. Nothing here comes from a user record.
 */
export type NotInLibrary = {
  title: string
  authors: string[]
  publisher: string | null
  year: number | null
  pages: number | null
  cover: string | null
  source: string | null
  newAuthors: string[]
  newSeries: string | null
}

/**
 * The Not in library Answer for a lookup, or `null` when another Answer
 * applies: the picked source candidate, or a Book the viewer can read and
 * holds nothing of. Epic 8's `answerFacts` takes over heading precedence.
 */
export function notInLibrary(result: LookupResult): NotInLibrary | null {
  switch (result.kind) {
    case 'existing': {
      const { book, mine } = result
      if (mine.copies.length > 0 || mine.entries.length > 0) return null
      return {
        title: book.title,
        authors: book.authors.map(({ name }) => name),
        publisher: book.publisher,
        year: book.year,
        pages: book.pages,
        cover: book.coverUrl,
        source: null,
        newAuthors: [],
        newSeries: null,
      }
    }
    case 'source': {
      const draft = result.candidates[result.pick]
      if (!draft) return null
      const { series } = result.matches
      return {
        title: draft.title,
        authors: draft.authors.map(({ name }) => name),
        publisher: draft.publisher ?? null,
        year: draft.year ?? null,
        pages: draft.pages ?? null,
        cover: draft.hasCover ? coverUrl({ isbn13: draft.isbn13 }) : null,
        source: draft.source,
        newAuthors: result.matches.authors.filter(({ id }) => id === null).map(({ name }) => name),
        newSeries: series !== null && series.id === null ? series.name : null,
      }
    }
    default:
      return null
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
  answer: NotInLibrary,
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

export type ScanOutcome =
  | { kind: 'answer'; answer: NotInLibrary }
  | { kind: 'scan'; error?: 'INVALID_ISBN' | 'RATE_LIMITED' }

/**
 * What `/scan?isbn=` renders: the Not in library Answer, or Scan, with the
 * field error or rate-limit toast the lookup refused with. Any other error
 * propagates to Next's error handling.
 */
export async function answerFor(lookup: () => Promise<LookupResult>): Promise<ScanOutcome> {
  let result: LookupResult
  try {
    result = await lookup()
  } catch (err) {
    if (
      err instanceof DomainError &&
      (err.code === 'INVALID_ISBN' || err.code === 'RATE_LIMITED')
    ) {
      return { kind: 'scan', error: err.code }
    }
    throw err
  }
  const answer = notInLibrary(result)
  return answer ? { kind: 'answer', answer } : { kind: 'scan' }
}
