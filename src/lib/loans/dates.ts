import { timeZone } from '@/i18n/locale'

// Spine, Consistency Conventions → Dates: a loan date is a calendar date, sent
// as `YYYY-MM-DD` and stored at 12:00 UTC by the `loans` collection. 6.6 adds
// the read-back here.

const helsinkiDate = new Intl.DateTimeFormat('en', {
  timeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Today's calendar date in `Europe/Helsinki` at `now`, as `YYYY-MM-DD`. */
export function helsinkiToday(now: Date = new Date()): string {
  // From the parts, not `format()`: a locale's date pattern is CLDR data that changes.
  const parts = helsinkiDate.formatToParts(now)
  const part = (type: 'year' | 'month' | 'day') => parts.find((p) => p.type === type)?.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

/** Whether `value` is a `YYYY-MM-DD` string that names a real day. */
export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}
