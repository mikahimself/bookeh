import { normaliseIsbn } from '@/fields/isbn'
import { DomainError } from '@/lib/errors'
import { lookupSources } from '@/lib/metadata/lookup'
import type { Context } from '@/lib/payload/context'
import { assertLive, onRollback, withTransaction } from '@/lib/payload/transaction'
import type { Restore, Undone } from '@/lib/undo/undo'

import { attachCover, discardCover, type DownloadedCover } from './covers'
import { findOrCreateByName, type FoundOrCreated } from './findOrCreateByName'
import { isUnreferenced } from './isUnreferenced'
import { mapSubjectsToGenres } from './mapSubjectsToGenres'

/**
 * Spine, AD-5 and FR-18: the shared Book for an ISBN, created from the
 * server-held source outcome when there is none. Values come only from
 * `lookupSources()` (the in-process cache, the sources again on a miss),
 * never from the client; the best candidate is always used. An existing
 * shared Book is returned as it is: no source call, no write (re-fetch is
 * admin-only, FR-19). Authors and series are matched or created among shared
 * rows only, so a shared Book references shared records only (AD-4).
 *
 * `INVALID_ISBN` before any read; `NOT_FOUND` when no source knows the ISBN;
 * a plain `Error` (logged `INTERNAL`) when a source could not be asked. Runs
 * in the caller's transaction or one of its own (AD-16). A lost race between
 * two concurrent creates surfaces as the unique index's `ValidationError`,
 * unchanged (AD-19).
 *
 * `cover` is the file `downloadCover()` stored before the transaction opened
 * (AD-14): a created Book gets its `media` row in this transaction. The file
 * is removed when the transaction rolls back, and at once when a shared Book
 * already exists.
 *
 * Undo (AD-11, AD-20): the restore of a found Book does nothing. The restore
 * of a created one deletes, in this order and each only when `isUnreferenced()`
 * finds no row of any user referencing it, the Book, the authors and the
 * series this call created, and the cover's `media` row; rows that were
 * matched are never deleted. The `media` row goes through `payload.db`, which
 * deletes the row and leaves the file: Payload unlinks an upload's file before
 * its delete and outside the transaction, so a restore that rolls back would
 * leave the row without its file. `sweepOrphanMedia()` removes the file on the
 * next start.
 */
export async function ensureSharedBook(
  ctx: Context,
  isbn13: string,
  cover?: DownloadedCover,
): Promise<Undone<FoundOrCreated>> {
  const isbn = normaliseIsbn(isbn13)

  return withTransaction(ctx, async (tx) => {
    const { payload } = tx.req
    if (cover) onRollback(tx, () => discardCover(payload, cover))
    const system = { req: tx.req, overrideAccess: true, depth: 0 } as const

    assertLive(tx)
    const { docs } = await payload.find({
      collection: 'books',
      where: { and: [{ isbn13: { equals: isbn } }, { visibility: { equals: 'shared' } }] },
      select: { isbn13: true },
      limit: 1,
      pagination: false,
      ...system,
    })
    if (docs[0]) {
      if (cover) await discardCover(payload, cover)
      return { data: { id: docs[0].id, created: false }, restore: async () => {} }
    }

    const outcome = await lookupSources(isbn)
    if (outcome.kind === 'none') throw new DomainError('NOT_FOUND')
    if (outcome.kind === 'unavailable') {
      throw new Error(`Sources unavailable: ${outcome.failed.join(', ')}`)
    }
    // `found` always holds at least one candidate.
    const best = outcome.candidates[0]!

    // One after the other: calls on one context never run concurrently (AD-16).
    const authors: number[] = []
    const createdAuthors: number[] = []
    for (const { name, sortName } of best.authors) {
      const input = sortName === undefined ? { name } : { name, sortName }
      const { id, created } = await findOrCreateByName(tx, 'authors', 'shared', input)
      if (!authors.includes(id)) authors.push(id)
      if (created) createdAuthors.push(id)
    }
    const matchedSeries =
      best.series === undefined
        ? undefined
        : await findOrCreateByName(tx, 'series', 'shared', { name: best.series })
    const series = matchedSeries?.id
    const createdSeries = matchedSeries?.created ? matchedSeries.id : undefined
    const genres = await mapSubjectsToGenres(tx, outcome.raw)
    const coverId = cover === undefined ? undefined : await attachCover(tx, cover)

    assertLive(tx)
    const book = await payload.create({
      collection: 'books',
      data: {
        isbn13: isbn,
        title: best.title,
        ...(best.subtitle !== undefined && { subtitle: best.subtitle }),
        authors,
        ...(series !== undefined && { series }),
        ...(best.seriesIndex !== undefined && { seriesIndex: best.seriesIndex }),
        ...(best.publisher !== undefined && { publisher: best.publisher }),
        ...(best.year !== undefined && { year: best.year }),
        ...(best.language !== undefined && { language: best.language }),
        ...(best.pages !== undefined && { pages: best.pages }),
        ...(best.description !== undefined && { description: best.description }),
        ...(coverId !== undefined && { cover: coverId }),
        themes: best.themes,
        genres,
        source: best.source,
        rawMetadata: outcome.raw,
        visibility: 'shared',
      },
      ...system,
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
        assertLive(rtx)
        await rtx.req.payload.db.deleteMany({
          collection: 'media',
          where: { id: { equals: coverId } },
          req: rtx.req,
        })
      }
    }
    return { data: { id: bookId, created: true }, restore }
  })
}

// By `where`, not by id: a row already gone matches nothing, where a failed
// `deleteByID` (`NotFound`) would end the transaction.
async function deleteRow(
  tx: Context,
  collection: 'books' | 'authors' | 'series',
  id: number,
): Promise<void> {
  assertLive(tx)
  const { errors } = await tx.req.payload.delete({
    collection,
    where: { id: { equals: id } },
    overrideAccess: true,
    req: tx.req,
    depth: 0,
  })
  if (errors.length > 0) {
    throw new Error(
      `Could not delete ${collection} ${id}: ${errors.map((e) => e.message).join('; ')}`,
    )
  }
}
