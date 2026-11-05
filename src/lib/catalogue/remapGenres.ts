import { canEditShared } from '@/access/roles'
import { DomainError } from '@/lib/errors'
import type { RawMetadata } from '@/lib/metadata/source'
import type { Context } from '@/lib/payload/context'
import { assertLive, withTransaction } from '@/lib/payload/transaction'

import { mapSubjectsToGenres } from './mapSubjectsToGenres'
import { system } from './system'

const PAGE = 100

/**
 * Spine, AD-5: the admin's re-run of `mapSubjectsToGenres()` over stored raw
 * data. A user who fails `canEditShared` gets `NOT_FOUND` before any read. In
 * one transaction it pages through shared Books by id and sets `genres` on
 * those with none when the stored `rawMetadata` maps to some; a Book that has
 * genres, or has no `rawMetadata`, is untouched. Returns the Books scanned and
 * updated. Not undoable.
 */
export async function remapGenres(ctx: Context): Promise<{ scanned: number; updated: number }> {
  if (!canEditShared(ctx.user)) throw new DomainError('NOT_FOUND')

  return withTransaction(ctx, async (tx) => {
    const { payload } = tx.req
    let scanned = 0
    let updated = 0
    let after = 0
    for (;;) {
      assertLive(tx)
      const { docs } = await payload.find({
        collection: 'books',
        where: { and: [{ visibility: { equals: 'shared' } }, { id: { greater_than: after } }] },
        select: { genres: true, rawMetadata: true },
        sort: 'id',
        limit: PAGE,
        pagination: false,
        ...system(tx),
      })
      for (const book of docs) {
        scanned += 1
        if ((book.genres ?? []).length > 0 || !book.rawMetadata) continue
        const genres = await mapSubjectsToGenres(tx, book.rawMetadata as RawMetadata)
        if (genres.length === 0) continue
        assertLive(tx)
        await payload.update({ collection: 'books', id: book.id, data: { genres }, ...system(tx) })
        updated += 1
      }
      const last = docs.at(-1)
      if (!last || docs.length < PAGE) break
      after = last.id
    }
    return { scanned, updated }
  })
}
