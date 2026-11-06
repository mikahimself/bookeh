import { finishedDays } from '@/fields/readingDates'
import type { UserBookState } from '@/lib/books/effectiveBook'

export type ReadingDates = Pick<UserBookState, 'state' | 'readingSince' | 'finishedAt'>

/** FR-54: what the muted line under Book detail's reading switch says. */
export type ReadingLine =
  | { kind: 'none' }
  | { kind: 'since'; start: string; days: number }
  | { kind: 'range'; start: string; finish: string; days: number }
  | { kind: 'started'; start: string }
  | { kind: 'finished'; finish: string }
  | { kind: 'addDates' }

/** The line for a Book's reading values, `today` being `helsinkiToday()`. */
export function readingLine(
  { state, readingSince, finishedAt }: ReadingDates,
  today: string,
): ReadingLine {
  if (state === 'unread') return { kind: 'none' }
  if (state === 'reading') {
    // Reading is derived from a start date (`readState()`); this branch is for the type only.
    return readingSince
      ? { kind: 'since', start: readingSince, days: finishedDays(readingSince, today) }
      : { kind: 'none' }
  }
  if (readingSince && finishedAt) {
    return {
      kind: 'range',
      start: readingSince,
      finish: finishedAt,
      days: finishedDays(readingSince, finishedAt),
    }
  }
  if (readingSince) return { kind: 'started', start: readingSince }
  if (finishedAt) return { kind: 'finished', finish: finishedAt }
  return { kind: 'addDates' }
}
