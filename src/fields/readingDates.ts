/** Calendar dates shared by the `user-books` and `copies` collections and the books and copies services. */
const helsinkiDate = new Intl.DateTimeFormat('en', {
  timeZone: 'Europe/Helsinki',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function helsinkiToday(now: Date = new Date()): string {
  const parts = helsinkiDate.formatToParts(now)
  const part = (type: 'year' | 'month' | 'day') => parts.find((p) => p.type === type)?.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

/** Reject normalized impossible days, rather than letting Date roll them forward. */
export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T12:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

/** Day-only inputs and stored/admin ISO dates, read by their UTC calendar date. */
export function readingDate(value: unknown): string | null {
  if (isCalendarDate(value)) return value
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return null
  if (!isCalendarDate(value.slice(0, 10))) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10)
}

export const noonUtc = (day: string): string => `${day}T12:00:00.000Z`

/** UTC day differences count calendar days, including across DST changes. */
export const finishedDays = (start: string, finish: string): number =>
  Math.max(1, Math.round((Date.parse(noonUtc(finish)) - Date.parse(noonUtc(start))) / 86_400_000))
