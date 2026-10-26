'use server'

import { revalidatePath } from 'next/cache'

import type { Corners } from '@/lib/catalogue/corners'
import { editBook, type BookEdits, type EditBookInput } from '@/lib/catalogue/editBook'
import { removeCover, setCover } from '@/lib/catalogue/setCover'
import { DomainError, runAction, type ActionResult, type ErrorCode } from '@/lib/errors'
import { requireUserOrThrow } from '@/lib/payload/context'
import { isRowId } from '@/lib/payload/ref'

import { isPlainObject } from '../../../plainObject'

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
  genres: (value) => Array.isArray(value) && value.every(isRowId),
  publisher: text,
  year: integer,
  language: text,
  pages: integer,
  description: text,
  // Any value: `editBook()` answers a missing or bad ISBN with `INVALID_ISBN`.
  isbn13: () => true,
}

const hasType = (key: string): key is keyof BookEdits => Object.hasOwn(TYPES, key)

/** `EditBookInput['copy']`'s shape: absent, or a copy id with an optional status and location. */
const isCopy = (value: unknown): boolean => {
  if (value === undefined) return true
  if (!isPlainObject(value) || !isRowId(value.id)) return false
  const { status, location } = value
  return (
    (status === undefined || status === 'owned' || status === 'ordered') &&
    (location === undefined ||
      location === null ||
      isRowId(location) ||
      (isPlainObject(location) && typeof location.create === 'string'))
  )
}

type CoverInput = { image: Blob; corners: Corners } | null | undefined

/** `CoverInput`'s shape: absent, `null`, or an image with an array of corners. */
const isCover = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  (isPlainObject(value) && value.image instanceof Blob && Array.isArray(value.corners))

/**
 * Save on Edit book (FR-14, FR-13, FR-28): the draft's changes to one Book
 * and, opened for one of its copies, to that copy. The input comes from the
 * client, so anything but `{ bookId, edits, copy? }` with `bookId` a
 * row id (`isRowId()`) and `edits` a plain object is `VALIDATION`, as is a
 * known key whose value has the wrong type, named in `fields`, and a `copy`
 * not of `EditBookInput['copy']`'s shape, named `copy`. The rest is
 * `editBook()`'s: unknown keys, a blank title, a bad ISBN, refused keys,
 * ordered with a location, the `requireOwnBook()` gate and the copy's owner.
 * Failures come back as they are.
 *
 * `cover` (AD-14, D-4) is absent, `null` to remove the cover, or
 * `{ image, corners }` from the crop step, else `VALIDATION` naming `cover`.
 * After `editBook()`, `removeCover()` or `setCover()` runs in its own
 * transaction, which checks the corners and the gate: edits that fail write
 * nothing, and a cover refused after them leaves them saved. No Undo. A
 * save purges the client cache, so the page Edit book returns to is fresh.
 */
export async function editBookAction(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await requireUserOrThrow()
    if (typeof input !== 'object' || input === null) throw new DomainError('VALIDATION')
    const { bookId, edits, copy, cover } = input as Record<string, unknown>
    if (!isRowId(bookId)) throw new DomainError('VALIDATION')
    if (!isPlainObject(edits)) throw new DomainError('VALIDATION')
    const fields: Record<string, ErrorCode> = {}
    for (const [key, value] of Object.entries(edits)) {
      if (hasType(key) && value !== undefined && !TYPES[key](value)) fields[key] = 'VALIDATION'
    }
    if (!isCopy(copy)) fields.copy = 'VALIDATION'
    if (!isCover(cover)) fields.cover = 'VALIDATION'
    if (Object.keys(fields).length > 0) throw new DomainError('VALIDATION', { fields })
    await editBook(ctx, { bookId, edits: edits as BookEdits, copy: copy as EditBookInput['copy'] })
    const change = cover as CoverInput
    if (change === null) await removeCover(ctx, bookId)
    else if (change) await setCover(ctx, bookId, change.image, change.corners)
    // The close is history back (to Book detail or the list), which would
    // otherwise reuse the page from before the save.
    revalidatePath('/', 'layout')
    return null
  })
}
