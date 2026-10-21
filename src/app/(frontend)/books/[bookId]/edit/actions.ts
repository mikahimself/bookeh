'use server'

import { editBook, type BookEdits, type EditBookInput } from '@/lib/catalogue/editBook'
import { DomainError, runAction, type ActionResult, type ErrorCode } from '@/lib/errors'
import { requireUserOrThrow } from '@/lib/payload/context'

const text = (value: unknown): boolean => typeof value === 'string' || value === null
const integer = (value: unknown): boolean =>
  value === null || (typeof value === 'number' && Number.isInteger(value))

/** The type each `BookEdits` key's value must have; one entry per key. */
const TYPES: { [K in keyof Required<BookEdits>]: (value: unknown) => boolean } = {
  title: (value) => typeof value === 'string',
  subtitle: text,
  authors: (value) => Array.isArray(value) && value.every((name) => typeof name === 'string'),
  series: text,
  seriesIndex: integer,
  genres: (value) =>
    Array.isArray(value) && value.every((id) => typeof id === 'number' && Number.isInteger(id)),
  publisher: text,
  year: integer,
  language: text,
  pages: integer,
  description: text,
  // Any value: `editBook()` answers a missing or bad ISBN with `INVALID_ISBN`.
  isbn13: () => true,
}

const hasType = (key: string): key is keyof BookEdits => Object.hasOwn(TYPES, key)

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value))

const id = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0

/** `EditBookInput['copy']`'s shape: absent, or a copy id with an optional status and location. */
const isCopy = (value: unknown): boolean => {
  if (value === undefined) return true
  if (!isPlainObject(value) || !id(value.id)) return false
  const { status, location } = value
  return (
    (status === undefined || status === 'owned' || status === 'ordered') &&
    (location === undefined ||
      location === null ||
      id(location) ||
      (isPlainObject(location) && typeof location.create === 'string'))
  )
}

/**
 * Save on Edit book (FR-14, FR-13, FR-28): the draft's changes to one Book
 * and, opened for one of its copies, to that copy. The input comes from the
 * client, so anything but `{ bookId, edits, copy? }` with `bookId` a
 * positive safe integer and `edits` a plain object is `VALIDATION`, as is a
 * known key whose value has the wrong type, named in `fields`, and a `copy`
 * not of `EditBookInput['copy']`'s shape, named `copy`. The rest is
 * `editBook()`'s: unknown keys, a blank title, a bad ISBN, refused keys,
 * ordered with a location, the `requireOwnBook()` gate and the copy's owner.
 * Failures come back as they are.
 */
export async function editBookAction(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await requireUserOrThrow()
    if (typeof input !== 'object' || input === null) throw new DomainError('VALIDATION')
    const { bookId, edits, copy } = input as Record<string, unknown>
    if (!id(bookId)) throw new DomainError('VALIDATION')
    if (!isPlainObject(edits)) throw new DomainError('VALIDATION')
    const fields: Record<string, ErrorCode> = {}
    for (const [key, value] of Object.entries(edits)) {
      if (hasType(key) && value !== undefined && !TYPES[key](value)) fields[key] = 'VALIDATION'
    }
    if (!isCopy(copy)) fields.copy = 'VALIDATION'
    if (Object.keys(fields).length > 0) throw new DomainError('VALIDATION', { fields })
    await editBook(ctx, { bookId, edits: edits as BookEdits, copy: copy as EditBookInput['copy'] })
    return null
  })
}
