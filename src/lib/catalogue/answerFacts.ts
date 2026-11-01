import type { CopyLine, EntryLine, Holdings } from '@/lib/books/holdings'

// Spine, Structural Seed (Shared shapes, `src/lib/catalogue`).

/** The Answer's heading: the first fact that applies (FR-20). */
export type AnswerHeading = 'inLibrary' | 'ordered' | 'onWishlist' | 'notInLibrary'

/**
 * One remaining fact. The whole source row travels with it, so a surface can
 * apply `isLent()` and name the location, the note or the list itself; `lib`
 * states no wording.
 */
export type AnswerFactLine = { kind: 'copy'; copy: CopyLine } | { kind: 'entry'; entry: EntryLine }

/** What the Answer states about a Book: one heading and every other fact as a line. */
export type AnswerFacts = { heading: AnswerHeading; lines: AnswerFactLine[] }

/**
 * FR-20: the one place the Answer's facts are stated, for the Answer screen
 * (Story 8.2) and Lookup's result rows (Story 8.8). `AnswerHeading` covers the
 * holdings-derived headings only: Not found and Couldn't look it up come from
 * `LookupResult`, and FR-20's "In {friend}'s library" is Phase 2/3, so a
 * heading that does not follow from what the viewer holds belongs there, not
 * in this union. Story 8.2 retires the two call sites this supersedes:
 * `ScanOutcome` in `src/app/(frontend)/scan/answer.ts`, whose `inLibrary`
 * still means any copy, ordered ones included, and `copyLines()` beside it —
 * note that `AnswerFactLine.copy` is the whole `CopyLine`, not the
 * `AnswerCopy` projection `copyLines()` takes. Heading precedence, first
 * that applies: `inLibrary` when at least one copy is `owned` (a lent copy is
 * an owned copy), else `ordered` when there is at least one copy (all of them
 * ordered), else `onWishlist` when there is at least one entry, else
 * `notInLibrary`. The heading consumes no line: every copy gets a line, then
 * every entry, each in `Holdings` order (oldest first, ties by id — AD-9's
 * `getHoldings()` sorts them, and this function reads its output rather than
 * the rows). `Holdings.entries` holds open entries only, the viewer's own and
 * those for a Person alike (H14), and both give `onWishlist`: nothing is
 * filtered here. Pure and synchronous; the input is not mutated.
 */
export function answerFacts(holdings: Holdings): AnswerFacts {
  const { copies, entries } = holdings
  const heading: AnswerHeading = copies.some((copy) => copy.status === 'owned')
    ? 'inLibrary'
    : copies.some((copy) => copy.status === 'ordered')
      ? 'ordered'
      : entries.length > 0
        ? 'onWishlist'
        : 'notInLibrary'
  return {
    heading,
    lines: [
      ...copies.map((copy): AnswerFactLine => ({ kind: 'copy', copy })),
      ...entries.map((entry): AnswerFactLine => ({ kind: 'entry', entry })),
    ],
  }
}
