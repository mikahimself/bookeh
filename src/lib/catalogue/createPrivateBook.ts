import { normaliseIsbn } from '@/fields/isbn'
import { limits } from '@/fields/limits'
import { toNameKey } from '@/fields/nameKey'
import { normaliseName } from '@/fields/sortName'
import { DomainError, type ErrorCode } from '@/lib/errors'
import type { Context } from '@/lib/payload/context'
import { assertLive, withTransaction } from '@/lib/payload/transaction'
import type { Restore, Undone } from '@/lib/undo/undo'

import { deleteRow } from './ensureSharedBook'
import { findOrCreateByName } from './findOrCreateByName'
import { isUnreferenced } from './isUnreferenced'
import { system } from './system'

/** Spine, Structural Seed: a Book typed by hand, as the client sends it. */
export type ManualEntry = { isbn?: string; title: string; authors: string[] }

/** `ManualEntry` after `normaliseManual()`; `isbn13` absent when there is no ISBN. */
export type NormalisedEntry = { isbn13?: string; title: string; authors: string[] }

/**
 * FR-12: checks and normalises a manual entry; pure. The title and each author
 * are NFC, trimmed, whitespace runs collapsed (`normaliseName()`). Blank
 * authors are dropped, and repeats by `toNameKey()`, keeping the first. A
 * blank title and no author left fail together in one `VALIDATION` with
 * `title` and/or `authors` in `fields`, as `VALIDATION`; a title over
 * `limits.title` or any author over `limits.name` after normalising is marked
 * there as `TOO_LONG` instead, never clipped (R6). Only then the ISBN: absent
 * or blank means none; anything else must normalise (`INVALID_ISBN`).
 */
export function normaliseManual(manual: ManualEntry): NormalisedEntry {
  const title = normaliseName(manual.title)
  const authors: string[] = []
  const keys = new Set<string>()
  for (const raw of manual.authors) {
    const name = normaliseName(raw)
    const key = toNameKey(name)
    if (name === '' || keys.has(key)) continue
    keys.add(key)
    authors.push(name)
  }

  const fields: Record<string, ErrorCode> = {}
  if (title === '') fields.title = 'VALIDATION'
  else if (title.length > limits.title) fields.title = 'TOO_LONG'
  if (authors.length === 0) fields.authors = 'VALIDATION'
  else if (authors.some((name) => name.length > limits.name)) fields.authors = 'TOO_LONG'
  if (Object.keys(fields).length > 0) throw new DomainError('VALIDATION', { fields })

  const isbn = manual.isbn?.trim() ?? ''
  return isbn === '' ? { title, authors } : { isbn13: normaliseIsbn(isbn), title, authors }
}

/**
 * Spine, AD-4, AD-5 and FR-12: a private Book from a normalised manual entry,
 * created with system privileges in the caller's transaction or one of its
 * own (AD-16). The client's title and authors are the only client values a
 * Book ever takes, which is why the Book is private: `createdBy` is
 * `ctx.req.user` (the `visibility` field hook). Authors are matched or
 * created through `findOrCreateByName()` in the private scope, one after the
 * other in typed order: a shared row first, then the user's own private row,
 * else a new private row of the user's; never another user's row, and never
 * with a `sortName`, which could land client text on a shared row.
 *
 * The Book has `isbn13` only when the entry has one, and no `source`,
 * `rawMetadata`, cover, series or genres. Nothing is matched here: a Book
 * without an ISBN is never merged (FR-12), and a held Book with the ISBN is
 * the caller's to find first. A second private Book of the user's with the
 * same ISBN surfaces as the unique index's `ValidationError` (AD-19).
 *
 * Undo (AD-11, AD-20): the restore deletes the Book, then the authors this
 * call created, each only when `isUnreferenced()` finds no row of any user
 * referencing it; matched authors are never deleted.
 */
export async function createPrivateBook(
  ctx: Context,
  manual: NormalisedEntry,
): Promise<Undone<{ id: number }>> {
  return withTransaction(ctx, async (tx) => {
    const { payload } = tx.req

    const authors: number[] = []
    const createdAuthors: number[] = []
    for (const name of manual.authors) {
      const { id, created } = await findOrCreateByName(tx, 'authors', 'private', { name })
      authors.push(id)
      if (created) createdAuthors.push(id)
    }

    assertLive(tx)
    const book = await payload.create({
      collection: 'books',
      data: {
        title: manual.title,
        authors,
        ...(manual.isbn13 !== undefined && { isbn13: manual.isbn13 }),
        visibility: 'private',
      },
      ...system(tx),
    })
    const bookId = book.id
    const restore: Restore = async (rtx) => {
      if (await isUnreferenced(rtx, 'books', bookId)) await deleteRow(rtx, 'books', bookId)
      for (const id of createdAuthors) {
        if (await isUnreferenced(rtx, 'authors', id)) await deleteRow(rtx, 'authors', id)
      }
    }
    return { data: { id: bookId }, restore }
  })
}
