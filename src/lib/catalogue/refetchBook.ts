import { canEditShared } from '@/access/roles'
import { requireOwnBook } from '@/lib/books/requireOwnBook'
import { DomainError } from '@/lib/errors'
import { lookupSources } from '@/lib/metadata/lookup'
import type { SourceId } from '@/lib/metadata/source'
import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import { assertLive, onRollback, withTransaction } from '@/lib/payload/transaction'
import type { Book } from '@/payload-types'

import { attachCover, discardCover, storeCover } from './covers'
import { findByName, findOrCreateByName } from './findOrCreateByName'
import { limitLookups } from './lookupLimit'
import { chooseCandidate } from './pick'
import { system } from './system'

/** The shared Book fields re-fetch fills, in the order it reports them. */
export type RefetchField =
  | 'subtitle'
  | 'authors'
  | 'series'
  | 'seriesIndex'
  | 'publisher'
  | 'year'
  | 'pages'
  | 'language'
  | 'description'
  | 'cover'
  | 'themes'

/**
 * `filled`: the fields set, the number of themes added and the source that
 * answered first; `nothing`: no source has the ISBN or nothing was empty;
 * `unavailable`: the sources that failed.
 */
export type RefetchResult =
  | { kind: 'filled'; fields: RefetchField[]; themes: number; source: SourceId }
  | { kind: 'nothing' }
  | { kind: 'unavailable'; failed: SourceId[] }

type BookData = Partial<Omit<Book, 'id' | 'updatedAt' | 'createdAt'>>

const isEmpty = (value: unknown): boolean =>
  value === null ||
  value === undefined ||
  value === '' ||
  (Array.isArray(value) && value.length === 0)

/**
 * Spine, AD-5 and FR-19: the admin's re-fetch of a shared Book. The gate is
 * `setCover()`'s: `requireOwnBook()`, then a gateway read; a Book that is not
 * shared, or a user who fails `canEditShared`, is `NOT_FOUND` before any
 * source is asked. Then `limitLookups()` (`RATE_LIMITED`) and a fresh
 * `lookupSources()`, which skips the cache read; `none` is `nothing`,
 * `unavailable` is returned with its failed sources, and a `found` outcome
 * gives `chooseCandidate()`'s default candidate: `rawMetadata` keeps no record
 * id, so the edition picked at save time cannot be found again.
 *
 * With no cover on the Book and a cover URL on the candidate, `storeCover()`
 * downloads it before the transaction opens (AD-14). In the transaction the
 * Book is read again and only the fields still empty (`null`, `''` or `[]`)
 * that the candidate has are set; a value, an uploaded cover included, is
 * never overwritten. Authors and series are matched or created among shared
 * records (`findOrCreateByName()`), and `rawMetadata` and `source` are filled
 * along when null, unreported. A downloaded cover that is not used is
 * discarded, as is one whose transaction rolls back. Nothing to fill is
 * `nothing`, with no write. Never touches `user-books`, copies or genres
 * (genres are re-run from stored subjects by the genre stories). Not undoable.
 */
export async function refetchBook(ctx: Context, bookId: number): Promise<RefetchResult> {
  await requireOwnBook(ctx, bookId)
  // `find`, not `findByID`: a Book the viewer cannot read is no match, not a thrown `NotFound`.
  const { docs } = await gateway.find(ctx, {
    collection: 'books',
    where: { id: { equals: bookId } },
    select: { visibility: true, isbn13: true, cover: true },
    limit: 1,
    pagination: false,
    depth: 0,
  })
  const gated = docs[0]
  if (!gated || gated.visibility !== 'shared' || !canEditShared(ctx.user)) {
    throw new DomainError('NOT_FOUND')
  }
  const { isbn13 } = gated
  // A shared Book comes from a source and so has an ISBN; one from the back office may not.
  if (!isbn13) return { kind: 'nothing' }

  limitLookups(ctx)
  const outcome = await lookupSources(isbn13, { fresh: true })
  if (outcome.kind === 'none') return { kind: 'nothing' }
  if (outcome.kind === 'unavailable') return { kind: 'unavailable', failed: outcome.failed }

  const { candidate, raw } = chooseCandidate(outcome)
  const downloaded =
    isEmpty(gated.cover) && candidate.coverUrl !== undefined
      ? await storeCover(ctx, isbn13, candidate.coverUrl)
      : undefined

  return withTransaction<RefetchResult>(ctx, async (tx) => {
    const { payload } = tx.req
    if (downloaded) onRollback(tx, () => discardCover(payload, downloaded))

    assertLive(tx)
    const book = (
      await payload.find({
        collection: 'books',
        where: { id: { equals: bookId } },
        limit: 1,
        pagination: false,
        ...system(tx),
      })
    ).docs[0]
    if (!book || book.visibility !== 'shared') throw new DomainError('NOT_FOUND')

    const data: BookData = {}
    const fields: RefetchField[] = []
    const fill = <F extends RefetchField>(field: F, value: BookData[F] | undefined) => {
      if (value === undefined || !isEmpty(book[field])) return
      Object.assign(data, { [field]: value })
      fields.push(field)
    }

    fill('subtitle', candidate.subtitle)
    if (isEmpty(book.authors) && candidate.authors.length > 0) {
      // One after the other: calls on one context never run concurrently (AD-16).
      const authors: number[] = []
      for (const { name, sortName } of candidate.authors) {
        const input = sortName === undefined ? { name } : { name, sortName }
        const { id } = await findOrCreateByName(tx, 'authors', 'shared', input)
        if (!authors.includes(id)) authors.push(id)
      }
      fill('authors', authors)
    }
    // The index fills only with the candidate's series: the Book's own, or the one filled here.
    let sameSeries = false
    if (candidate.series !== undefined) {
      if (isEmpty(book.series)) {
        const { id } = await findOrCreateByName(tx, 'series', 'shared', { name: candidate.series })
        fill('series', id)
        sameSeries = true
      } else {
        sameSeries =
          (await findByName(tx, 'series', 'shared', candidate.series))?.id === book.series
      }
    }
    if (sameSeries) fill('seriesIndex', candidate.seriesIndex)
    fill('publisher', candidate.publisher)
    fill('year', candidate.year)
    fill('pages', candidate.pages)
    fill('language', candidate.language)
    fill('description', candidate.description)
    if (downloaded) {
      if (isEmpty(book.cover)) fill('cover', await attachCover(tx, downloaded, 'shared'))
      else await discardCover(payload, downloaded)
    }
    fill('themes', candidate.themes.length > 0 ? candidate.themes : undefined)

    if (fields.length === 0) return { kind: 'nothing' }
    if (isEmpty(book.rawMetadata)) data.rawMetadata = raw
    if (isEmpty(book.source)) data.source = candidate.source

    assertLive(tx)
    await payload.update({ collection: 'books', id: bookId, data, ...system(tx) })
    return {
      kind: 'filled',
      fields,
      themes: fields.includes('themes') ? candidate.themes.length : 0,
      source: candidate.source,
    }
  })
}
