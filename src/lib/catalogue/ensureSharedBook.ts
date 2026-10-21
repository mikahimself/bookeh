import { normaliseIsbn } from '@/fields/isbn'
import type { Context } from '@/lib/payload/context'
import { assertLive, onRollback, withTransaction } from '@/lib/payload/transaction'
import type { Restore, Undone } from '@/lib/undo/undo'

import { attachCover, deleteMediaRow, discardCover, type DownloadedCover } from './covers'
import { findOrCreateByName, type FoundOrCreated } from './findOrCreateByName'
import { isUnreferenced } from './isUnreferenced'
import { mapSubjectsToGenres } from './mapSubjectsToGenres'
import type { Chosen } from './pick'
import { system } from './system'

/**
 * Spine, AD-5 and FR-18: the shared Book for an ISBN, created from `chosen`
 * when there is none. `chosen` is the candidate `chooseCandidate()` took from
 * the outcome the save resolved before its transaction opened (AD-11), so no
 * source is asked here and no value comes from the client. The Book keeps the
 * ISBN asked for, and its `rawMetadata` is `chosen.raw`. The caller has
 * clipped the candidate to the field limits (R6), so an over-long source
 * value never fails the write. An existing shared Book is returned as it is:
 * no write (re-fetch is admin-only, FR-19). Authors and series are matched or
 * created among shared rows only, so a shared Book references shared records
 * only (AD-4).
 *
 * `INVALID_ISBN` before any read. Runs in the caller's transaction or one of
 * its own (AD-16). A lost race between two concurrent creates surfaces as the
 * unique index's `ValidationError`, unchanged (AD-19).
 *
 * `cover` is the file `storeCover()` stored before the transaction opened
 * (AD-14): a created Book gets its `media` row in this transaction. The file
 * is removed when the transaction rolls back, and at once when a shared Book
 * already exists.
 *
 * Undo (AD-11, AD-20): the restore of a found Book does nothing. The restore
 * of a created one deletes, in this order and each only when `isUnreferenced()`
 * finds no row of any user referencing it, the Book, the authors and the
 * series this call created, and the cover's `media` row; rows that were
 * matched are never deleted. The `media` row goes through `deleteMediaRow()`,
 * which leaves the file to `sweepOrphanMedia()`.
 */
export async function ensureSharedBook(
  ctx: Context,
  isbn13: string,
  chosen: Chosen,
  cover?: DownloadedCover,
): Promise<Undone<FoundOrCreated>> {
  const isbn = normaliseIsbn(isbn13)

  return withTransaction(ctx, async (tx) => {
    const { payload } = tx.req
    if (cover) onRollback(tx, () => discardCover(payload, cover))

    assertLive(tx)
    const { docs } = await payload.find({
      collection: 'books',
      where: { and: [{ isbn13: { equals: isbn } }, { visibility: { equals: 'shared' } }] },
      select: { isbn13: true },
      limit: 1,
      pagination: false,
      ...system(tx),
    })
    if (docs[0]) {
      if (cover) await discardCover(payload, cover)
      return { data: { id: docs[0].id, created: false }, restore: async () => {} }
    }

    const { candidate: picked, raw } = chosen

    // One after the other: calls on one context never run concurrently (AD-16).
    const authors: number[] = []
    const createdAuthors: number[] = []
    for (const { name, sortName } of picked.authors) {
      const input = sortName === undefined ? { name } : { name, sortName }
      const { id, created } = await findOrCreateByName(tx, 'authors', 'shared', input)
      if (!authors.includes(id)) authors.push(id)
      if (created) createdAuthors.push(id)
    }
    const matchedSeries =
      picked.series === undefined
        ? undefined
        : await findOrCreateByName(tx, 'series', 'shared', { name: picked.series })
    const series = matchedSeries?.id
    const createdSeries = matchedSeries?.created ? matchedSeries.id : undefined
    const genres = await mapSubjectsToGenres(tx, raw)
    const coverId = cover === undefined ? undefined : await attachCover(tx, cover)

    assertLive(tx)
    const book = await payload.create({
      collection: 'books',
      data: {
        isbn13: isbn,
        title: picked.title,
        ...(picked.subtitle !== undefined && { subtitle: picked.subtitle }),
        authors,
        ...(series !== undefined && { series }),
        ...(picked.seriesIndex !== undefined && { seriesIndex: picked.seriesIndex }),
        ...(picked.publisher !== undefined && { publisher: picked.publisher }),
        ...(picked.year !== undefined && { year: picked.year }),
        ...(picked.language !== undefined && { language: picked.language }),
        ...(picked.pages !== undefined && { pages: picked.pages }),
        ...(picked.description !== undefined && { description: picked.description }),
        ...(coverId !== undefined && { cover: coverId }),
        themes: picked.themes,
        genres,
        source: picked.source,
        rawMetadata: raw,
        visibility: 'shared',
      },
      ...system(tx),
    })
    const bookId = book.id
    const restore: Restore = async (rtx) => {
      if (await isUnreferenced(rtx, 'books', bookId)) await deleteRow(rtx, 'books', bookId)
      for (const id of createdAuthors) {
        if (await isUnreferenced(rtx, 'authors', id)) await deleteRow(rtx, 'authors', id)
      }
      if (createdSeries !== undefined && (await isUnreferenced(rtx, 'series', createdSeries))) {
        await deleteRow(rtx, 'series', createdSeries)
      }
      if (coverId !== undefined && (await isUnreferenced(rtx, 'media', coverId))) {
        await deleteMediaRow(rtx, coverId)
      }
    }
    return { data: { id: bookId, created: true }, restore }
  })
}

// By `where`, not by id: a row already gone matches nothing, where a failed
// `deleteByID` (`NotFound`) would end the transaction.
export async function deleteRow(
  tx: Context,
  collection: 'books' | 'authors' | 'series',
  id: number,
): Promise<void> {
  assertLive(tx)
  const { errors } = await tx.req.payload.delete({
    collection,
    where: { id: { equals: id } },
    ...system(tx),
  })
  if (errors.length > 0) {
    throw new Error(
      `Could not delete ${collection} ${id}: ${errors.map((e) => e.message).join('; ')}`,
    )
  }
}
