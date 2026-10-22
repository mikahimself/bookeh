/**
 * Spine, AD-7, "keep my place": per shelf query (its `shelfHref` without
 * `book`), how many rows the collection held and where it was scrolled, in
 * `sessionStorage`. Never row data. Storage may be blocked (a private window)
 * or hold anything; either way there is no place, and the list starts at the
 * top with the first page.
 */
export type Place = { rows: number; scrollY: number }

const keyFor = (href: string): string => `bookeh:shelf-place:${href}`

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

export function readPlace(href: string): Place | null {
  let text: string | null
  try {
    text = window.sessionStorage.getItem(keyFor(href))
  } catch {
    return null
  }
  if (text === null) return null
  try {
    const value: unknown = JSON.parse(text)
    if (typeof value !== 'object' || value === null) return null
    const { rows, scrollY } = value as Record<string, unknown>
    return isCount(rows) && isCount(scrollY) ? { rows, scrollY } : null
  } catch {
    return null
  }
}

export function writePlace(href: string, { rows, scrollY }: Place): void {
  try {
    window.sessionStorage.setItem(keyFor(href), JSON.stringify({ rows, scrollY }))
  } catch {
    // Blocked or full: the place is not kept.
  }
}
