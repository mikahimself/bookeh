import type { BookEdits, EditBookInput } from '@/lib/catalogue/editBook'

/**
 * Edit book's unsaved changes (EXPERIENCE.md, Edit book): a sparse
 * `BookEdits`, and under `copy` the change to the copy the screen was opened
 * for, per Book in `sessionStorage`, so they survive a trip through sign-in
 * and are gone with the tab. Storage may be blocked (a private window) or
 * hold anything; either way there is no draft, and an entry that is not a
 * JSON object is removed.
 */
export type Draft = BookEdits & { copy?: EditBookInput['copy'] }

const keyFor = (bookId: number): string => `bookeh:edit-book:${bookId}`

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype

/** Whether `draft` holds any change. */
export const isEmpty = (draft: Draft): boolean => Object.keys(draft).length === 0

export function readDraft(bookId: number): Draft {
  let text: string | null
  try {
    text = window.sessionStorage.getItem(keyFor(bookId))
  } catch {
    return {}
  }
  if (text === null) return {}
  try {
    const value: unknown = JSON.parse(text)
    if (isPlainObject(value)) return value as Draft
  } catch {
    // Malformed: removed below.
  }
  clearDraft(bookId)
  return {}
}

/** Stores `draft`; an empty one removes the entry. */
export function writeDraft(bookId: number, draft: Draft): void {
  if (isEmpty(draft)) {
    clearDraft(bookId)
    return
  }
  try {
    window.sessionStorage.setItem(keyFor(bookId), JSON.stringify(draft))
  } catch {
    // Blocked or full: the draft lives only on screen.
  }
}

export function clearDraft(bookId: number): void {
  try {
    window.sessionStorage.removeItem(keyFor(bookId))
  } catch {
    // Blocked: nothing was stored.
  }
}

/**
 * `draft` with `key` set to `value`, or without `key` when `value` equals
 * `effective`, the Book's value as the viewer sees it, or is `undefined`: the
 * draft holds only changed keys. Values compare by their JSON, so equal
 * author lists match.
 */
export function setEdit<K extends keyof Draft>(
  draft: Draft,
  key: K,
  value: Draft[K],
  effective: Draft[K],
): Draft {
  const { [key]: _previous, ...rest } = draft
  return value === undefined || JSON.stringify(value) === JSON.stringify(effective)
    ? rest
    : { ...rest, [key]: value }
}
