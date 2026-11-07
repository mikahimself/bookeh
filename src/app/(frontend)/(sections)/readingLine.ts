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

/**
 * How a "since {date}" day is formatted (Currently reading, in the
 * collection's strip and in Stats): day and short month, with the year only
 * when it is not `today`'s.
 */
export function sinceDay(
  date: string,
  today: string,
): Pick<Intl.DateTimeFormatOptions, 'day' | 'month' | 'year'> {
  return {
    day: 'numeric',
    month: 'short',
    ...(date.slice(0, 4) !== today.slice(0, 4) && { year: 'numeric' }),
  }
}

/**
 * FR-58, Most dust collected: how long a Book has waited since `since`, by
 * `today`. Whole calendar years; under a year, whole months; under a month,
 * calendar days (`finishedDays()`, at least 1).
 */
export function unreadFor(
  since: string,
  today: string,
): { unit: 'years' | 'months' | 'days'; n: number } {
  const [sy, sm, sd] = since.split('-').map(Number) as [number, number, number]
  const [ty, tm, td] = today.split('-').map(Number) as [number, number, number]
  const months = (ty - sy) * 12 + tm - sm - (td < sd ? 1 : 0)
  if (months >= 12) return { unit: 'years', n: Math.floor(months / 12) }
  if (months >= 1) return { unit: 'months', n: months }
  return { unit: 'days', n: finishedDays(since, today) }
}
