import { OVERRIDABLE_BOOK_FIELDS, type OverridableBookField } from '@/fields/bookFields'
import { normaliseText } from '@/fields/sortName'
import { DomainError, type ErrorCode } from '@/lib/errors'
import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import { idOf } from '@/lib/payload/ref'
import { withTransaction } from '@/lib/payload/transaction'
import type { UserBook } from '@/payload-types'

/**
 * Spine, AD-6: the override fields as `user-books` stores them, by id only
 * (name matching is `findOrCreateByName()`'s, the caller's). A key present
 * overrides the Book's field with its value, `null` (or `[]` for `authors`)
 * meaning cleared; an absent or `undefined` key is left as is.
 */
export type BookOverrides = Partial<{
  [K in OverridableBookField]: K extends 'authors'
    ? number[]
    : K extends 'series'
      ? number | null
      : NonNullable<UserBook[K]> | null
}>

/**
 * One write to the viewer's own row on a Book. `overrides` and
 * `dropOverrides` are two inputs because "clear the title" and "stop
 * overriding the title" are different outcomes under AD-6: a user's edit
 * sends the first; an admin's edit of the shared Book sends the second to
 * drop the admin's own override of that field (D5), since this writer reaches
 * only the caller's row. `rating` moves `ratedAt` with it (AD-18).
 */
export type UserBookChanges = {
  overrides?: BookOverrides
  dropOverrides?: readonly OverridableBookField[]
  read?: boolean
  rating?: number | null
}

/** What one write stores: the override fields, `overridden`, the flag, the rating and its time. */
type RowData = Partial<
  Pick<UserBook, OverridableBookField | 'overridden' | 'read' | 'rating' | 'ratedAt'>
>
type Stored = BookOverrides[OverridableBookField]

/**
 * Spine, Text input: `normaliseText()`, the description multiline, `''`
 * stored as `null` (cleared). A relation list is deduplicated:
 * `user_books_rels` has no unique index, and a repeated id would show the
 * author twice.
 */
const normalise = (key: OverridableBookField, value: Stored): Stored => {
  if (Array.isArray(value)) return [...new Set(value)]
  if (typeof value !== 'string') return value
  const text = normaliseText(value, { multiline: key === 'description' })
  return text === '' ? null : text
}

/**
 * Spine, AD-6 and AD-18: the one writer of `user-books`. Finds the viewer's
 * row for the Book, creates it on the first write and updates it after,
 * inside the caller's transaction or one of its own (AD-16). `overridden`
 * after the write is the row's current list, plus the keys of `overrides`,
 * minus `dropOverrides`, in `OVERRIDABLE_BOOK_FIELDS` order; a key in both
 * `overrides` and `dropOverrides` is overridden. A dropped field's stored
 * value is set to `null`. A state-only write (`read`, `rating`) sends those
 * fields alone and leaves the override fields and `overridden` untouched.
 * The read-modify-write of `overridden` is unlocked, so two concurrent
 * override writes on one row can lose the earlier list.
 *
 * A Book always has a title (`books.title` is required), so a `title`
 * override that normalises to `null` fails with `VALIDATION` on `title`
 * before any read or write. Overrides exist only on shared Books: on a
 * private one they fail with `VALIDATION` naming each key, before any write;
 * an unreadable Book fails that visibility read with `NotFound`. A state-only
 * or drop-only write reads no Book, so on an unreadable Book the collection's
 * `book` relation refuses the create with a Payload `ValidationError` on
 * `book`. No ownership gate applies here: any Book the viewer can read gets a
 * row; `requireOwnBook()` (E21) is the caller's gate for client-supplied ids.
 *
 * The row is lazy: a change set with nothing to store creates none.
 * Validation stays with the collection (`rating` range, `overridden`
 * members, readable relation targets); a lost race between two first writes
 * surfaces as the unique index's `ValidationError`, unchanged.
 */
export async function upsertUserBook(
  ctx: Context,
  bookId: number,
  changes: UserBookChanges,
): Promise<void> {
  const { overrides, read, rating } = changes
  const overriding = OVERRIDABLE_BOOK_FIELDS.filter((key) => overrides?.[key] !== undefined)
  const drop = new Set<OverridableBookField>(changes.dropOverrides ?? [])
  const touchesOverrides = overriding.length > 0 || drop.size > 0
  const hasState = read !== undefined || rating !== undefined
  if (!touchesOverrides && !hasState) return
  if (overrides?.title !== undefined && normalise('title', overrides.title) === null) {
    throw new DomainError('VALIDATION', { fields: { title: 'VALIDATION' } })
  }

  /** The override fields and `overridden` as one write leaves them, from the row's current list. */
  const overrideData = (current: UserBook['overridden']): RowData => {
    const listed = new Set<OverridableBookField>(current ?? [])
    const entries: [OverridableBookField, Stored][] = []
    for (const key of OVERRIDABLE_BOOK_FIELDS) {
      const value = overrides?.[key]
      if (value !== undefined) {
        entries.push([key, normalise(key, value)])
        listed.add(key)
      } else if (drop.has(key)) {
        entries.push([key, null])
        listed.delete(key)
      }
    }
    return {
      // `fromEntries` loses the key-to-value pairing; the stored shape restores it.
      ...(Object.fromEntries(entries) as Partial<Pick<UserBook, OverridableBookField>>),
      overridden: OVERRIDABLE_BOOK_FIELDS.filter((key) => listed.has(key)),
    }
  }

  await withTransaction(ctx, async (tx) => {
    if (overriding.length > 0) {
      const book = await gateway.findByID(tx, {
        collection: 'books',
        id: bookId,
        select: { visibility: true },
        depth: 0,
      })
      if (book.visibility !== 'shared') {
        const fields: Record<string, ErrorCode> = {}
        for (const key of overriding) fields[key] = 'VALIDATION'
        throw new DomainError('VALIDATION', { fields })
      }
    }

    // `user-books` access already scopes the find to the viewer (AD-6).
    const { docs } = await gateway.find(tx, {
      collection: 'user-books',
      where: { book: { equals: bookId } },
      limit: 1,
      depth: 0,
    })
    const row: UserBook | undefined = docs[0]
    if (!row && overriding.length === 0 && !hasState) return

    const data: RowData = touchesOverrides ? overrideData(row?.overridden) : {}
    if (read !== undefined) data.read = read
    if (rating !== undefined) {
      data.rating = rating
      data.ratedAt = rating === null ? null : new Date().toISOString()
    }

    if (row) {
      await gateway.updateByID(tx, { collection: 'user-books', id: row.id, data, depth: 0 })
    } else {
      // `owner` is what Payload's create type requires; the hook sets it from the request.
      await gateway.create(tx, {
        collection: 'user-books',
        data: { owner: tx.user.id, book: bookId, ...data },
        depth: 0,
      })
    }
  })
}

/**
 * Spine, AD-5, AD-6 and D-8: moves the viewer's `user-books` row from a Book
 * that is going away to the Book replacing it, in the caller's transaction or
 * one of its own (AD-16); used when a private Book merges into the shared
 * Book with its ISBN (FR-12). Reaches only the viewer's own rows.
 *
 * Without a row on `toBookId`, the row on `fromBookId` is re-pointed to it.
 * With a row on both, the target's row stays: it takes `read: true` if either
 * row has it, and the moved row's `rating` and `ratedAt` when it has no
 * rating; the `from` row is then deleted. Then `overrides` are written
 * through `upsertUserBook()` for the fields the target row does not already
 * override, so the target must already be shared.
 */
export async function mergeUserBook(
  ctx: Context,
  fromBookId: number,
  toBookId: number,
  overrides: BookOverrides,
): Promise<void> {
  await withTransaction(ctx, async (tx) => {
    // `user-books` access already scopes the find to the viewer (AD-6).
    const { docs } = await gateway.find(tx, {
      collection: 'user-books',
      where: { book: { in: [fromBookId, toBookId] } },
      depth: 0,
      limit: 2,
      pagination: false,
    })
    const from = docs.find((row) => idOf(row.book) === fromBookId)
    const to = docs.find((row) => idOf(row.book) === toBookId)

    if (from && !to) {
      await gateway.updateByID(tx, {
        collection: 'user-books',
        id: from.id,
        data: { book: toBookId },
        depth: 0,
      })
    } else if (from && to) {
      const data: RowData = {}
      if (from.read && !to.read) data.read = true
      if (to.rating == null && from.rating != null) {
        data.rating = from.rating
        data.ratedAt = from.ratedAt ?? null
      }
      await gateway.deleteByID(tx, { collection: 'user-books', id: from.id, depth: 0 })
      if (Object.keys(data).length > 0) {
        await gateway.updateByID(tx, { collection: 'user-books', id: to.id, data, depth: 0 })
      }
    }

    const kept = new Set<OverridableBookField>(to?.overridden ?? [])
    // `fromEntries` loses the key-to-value pairing; the picked keys keep it.
    const fresh = Object.fromEntries(
      OVERRIDABLE_BOOK_FIELDS.filter((key) => !kept.has(key)).map((key) => [key, overrides[key]]),
    ) as BookOverrides
    await upsertUserBook(tx, toBookId, { overrides: fresh })
  })
}
