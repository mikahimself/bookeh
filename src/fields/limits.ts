/**
 * The length limits of the Book, author and series text fields, in UTF-16
 * units as Payload's `maxLength` counts them. The schema declares them and
 * `lib/catalogue` clips source values to them before a shared Book is written.
 */
export const limits = {
  title: 500,
  subtitle: 500,
  description: 10_000,
  /** An author's or a series' name. */
  name: 200,
} as const

/**
 * `value` cut to at most `max` UTF-16 units, never ending in a lone high
 * surrogate; a cut value also loses its trailing whitespace. A value within
 * `max` comes back unchanged.
 */
export function clip(value: string, max: number): string {
  if (value.length <= max) return value
  const cut = value.slice(0, max)
  const last = cut.charCodeAt(cut.length - 1)
  return (last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut).trimEnd()
}
