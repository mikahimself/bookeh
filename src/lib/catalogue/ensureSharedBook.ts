import { normaliseIsbn } from '@/fields/isbn'
import { DomainError } from '@/lib/errors'
import { lookupSources } from '@/lib/metadata/lookup'
import type { Context } from '@/lib/payload/context'
import { assertLive, withTransaction } from '@/lib/payload/transaction'

import { findOrCreateByName, type FoundOrCreated } from './findOrCreateByName'
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
 */
export async function ensureSharedBook(ctx: Context, isbn13: string): Promise<FoundOrCreated> {
  const isbn = normaliseIsbn(isbn13)

  return withTransaction(ctx, async (tx) => {
    const { payload } = tx.req
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
    if (docs[0]) return { id: docs[0].id, created: false }

    const outcome = await lookupSources(isbn)
    if (outcome.kind === 'none') throw new DomainError('NOT_FOUND')
    if (outcome.kind === 'unavailable') {
      throw new Error(`Sources unavailable: ${outcome.failed.join(', ')}`)
    }
    // `found` always holds at least one candidate.
    const best = outcome.candidates[0]!

    // One after the other: calls on one context never run concurrently (AD-16).
    const authors: number[] = []
    for (const { name, sortName } of best.authors) {
      const input = sortName === undefined ? { name } : { name, sortName }
      const { id } = await findOrCreateByName(tx, 'authors', 'shared', input)
      if (!authors.includes(id)) authors.push(id)
    }
    const series =
      best.series === undefined
        ? undefined
        : (await findOrCreateByName(tx, 'series', 'shared', { name: best.series })).id
    const genres = await mapSubjectsToGenres(tx, outcome.raw)

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
        themes: best.themes,
        genres,
        source: best.source,
        rawMetadata: outcome.raw,
        visibility: 'shared',
      },
      ...system,
    })
    return { id: book.id, created: true }
  })
}
