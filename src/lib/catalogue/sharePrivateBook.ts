import { isAdmin } from '@/access/roles'
import { OVERRIDABLE_BOOK_FIELDS, type OverridableBookField } from '@/fields/bookFields'
import { type BookOverrides, mergeUserBook, upsertUserBook } from '@/lib/books/upsertUserBook'
import { moveCopiesToBook } from '@/lib/copies/moveCopiesToBook'
import { DomainError } from '@/lib/errors'
import { heldOutcome } from '@/lib/metadata/lookup'
import type { SourceResult } from '@/lib/metadata/source'
import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import { assertLive, onRollback } from '@/lib/payload/transaction'
import type { Author, Book, Series } from '@/payload-types'

import {
  attachCover,
  deleteMediaRow,
  discardCover,
  type DownloadedCover,
  storeCover,
} from './covers'
import { deleteRow } from './ensureSharedBook'
import { findBookByIsbn, type HeldBook } from './findBookByIsbn'
import { findOrCreateByName } from './findOrCreateByName'
import { isUnreferenced } from './isUnreferenced'
import { mapSubjectsToGenres } from './mapSubjectsToGenres'
import { type CandidateId, type Chosen, chooseCandidate } from './pick'
import { system } from './system'

// FR-12, AD-4, AD-5 and D-8: a private Book is shared on its creator's next
// save once a source knows its ISBN, or joins the shared Book with that ISBN.

/**
 * What `prepareShare()` fetched for a promote: the chosen candidate, clipped
 * to the field limits, and its raw metadata (`chooseCandidate()`), with its
 * cover.
 */
export type PendingShare = Chosen & { cover?: DownloadedCover }

/**
 * Spine, AD-5, AD-11 and AD-14: the part of a share that runs before the
 * save's transaction opens. `undefined` unless `held` is the user's private
 * Book and the server-held outcome (`heldOutcome()`, the in-process cache
 * alone) is `found`; then the candidate `chooseCandidate()` takes for `pick`
 * and `id` (D-7: `NOT_FOUND` when `id` names a candidate the outcome lacks),
 * clipped so the promote's write and its D-8 comparison see the values
 * stored, and its raw metadata, with the candidate's cover stored by
 * `storeCover()` when the Book has none and the candidate has a `coverUrl`.
 * Never asks the sources; the cover is the only network call.
 */
export async function prepareShare(
  ctx: Context,
  isbn13: string,
  held: HeldBook,
  pick?: number,
  id?: CandidateId,
): Promise<PendingShare | undefined> {
  if (held.visibility !== 'private') return undefined
  const outcome = heldOutcome(isbn13)
  if (outcome?.kind !== 'found') return undefined
  const pending: PendingShare = chooseCandidate(outcome, pick, id)
  const { candidate } = pending
  if (!candidate.coverUrl) return pending

  // A find rather than `findByID`: a Book deleted since is `settleHeldBook()`'s `NOT_FOUND`.
  const { docs } = await gateway.find(ctx, {
    collection: 'books',
    where: { id: { equals: held.id } },
    select: { cover: true },
    depth: 0,
    limit: 1,
    pagination: false,
  })
  if (!docs[0] || docs[0].cover != null) return pending
  const cover = await storeCover(ctx, isbn13, candidate.coverUrl)
  return cover ? { ...pending, cover } : pending
}

/**
 * Spine, AD-5 and AD-11: the Book an `{ isbn13 }` save of a held Book puts
 * its copy on, settled inside the save's transaction. The cover in `pending`
 * is removed if the transaction rolls back. The held Book is read again
 * (`findBookByIsbn()`):
 *
 * - The shared Book: the user's own private Book with the ISBN, if any, is
 *   merged into it (its copies and `user-books` row move, then it is
 *   deleted), and the cover is discarded at once. No held outcome is needed:
 *   the shared Book's values are the target. When any row still references
 *   the private Book after the move, the merge throws a plain `Error`, which
 *   rolls the save back, rather than let Postgres null that reference.
 * - The user's private Book with `pending`: promoted in place. It keeps its
 *   id and takes the candidate's values, with authors and series matched or
 *   created among shared rows; `visibility` becomes shared and the field hook
 *   clears `createdBy`.
 * - The user's private Book without `pending`: unchanged.
 * - None: `NOT_FOUND`.
 *
 * D-8: in a promote or a merge, a field the private Book has a value for
 * that the target (the candidate, or the shared Book) lacks or holds
 * differently becomes the user's override, written after the Book is shared.
 * Text compares by `looseKey()`, so a value that differs only by case,
 * whitespace or punctuation is not kept; numbers compare exactly; `authors`
 * as the ordered loose keys of their names and `series` by the loose key of
 * its name, an override keeping the private Book's own ids. An admin's
 * values are dropped. Afterwards the private authors and series the private
 * Book used, and its cover's `media` row, are deleted when nothing
 * references them (`isUnreferenced()`), so an override keeps its author.
 * Another user's private Book, row or copy is never read or changed.
 */
export async function settleHeldBook(
  tx: Context,
  isbn13: string,
  pending?: PendingShare,
): Promise<number> {
  const { payload } = tx.req
  const cover = pending?.cover
  if (cover) onRollback(tx, () => discardCover(payload, cover))

  const held = await findBookByIsbn(tx, isbn13)
  if (!held) throw new DomainError('NOT_FOUND')

  if (held.visibility === 'shared') {
    if (cover) await discardCover(payload, cover)
    const own = await ownPrivateBook(tx, isbn13)
    if (own !== undefined) await merge(tx, own, held.id)
    return held.id
  }

  if (pending) await promote(tx, held.id, pending)
  return held.id
}

type ScalarField = Exclude<OverridableBookField, 'authors' | 'series'>
const SCALAR_FIELDS = OVERRIDABLE_BOOK_FIELDS.filter(
  (key): key is ScalarField => key !== 'authors' && key !== 'series',
)

/** A Book's overridable values as read for a share, relations populated. */
type BookValues = Pick<Book, 'id' | 'cover' | OverridableBookField>

/** The values a private Book is compared with: scalars present, text and names as loose keys. */
type Comparable = {
  scalars: Partial<Record<ScalarField, string | number>>
  authors: string[]
  series: string | undefined
}

/**
 * D-8 only: NFC, lower-cased, every punctuation, format (soft hyphen,
 * zero-width space), modifier symbol (´ as an apostrophe) and whitespace
 * character removed; accents kept. Not `toNameKey()`, which keys the unique `nameKey`
 * columns and must keep punctuation ("A.B." and "AB" can be two authors).
 */
const looseKey = (text: string) =>
  text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\p{P}\p{Cf}\p{Sk}\s]/gu, '')

const compareKey = (value: string | number) => (typeof value === 'string' ? looseKey(value) : value)

const populated = <T extends Author | Series>(value: number | T | null | undefined): T => {
  if (typeof value !== 'object' || value === null) throw new Error('Relation not populated')
  return value
}

const idOf = (value: number | { id: number }): number =>
  typeof value === 'number' ? value : value.id

function fromBook(book: BookValues): Comparable {
  const scalars: Comparable['scalars'] = {}
  for (const key of SCALAR_FIELDS) {
    const value = book[key]
    if (value !== null && value !== undefined) scalars[key] = compareKey(value)
  }
  return {
    scalars,
    authors: (book.authors ?? []).map((author) => looseKey(populated<Author>(author).name)),
    series: book.series == null ? undefined : looseKey(populated<Series>(book.series).name),
  }
}

function fromCandidate(candidate: SourceResult): Comparable {
  const scalars: Comparable['scalars'] = {}
  for (const key of SCALAR_FIELDS) {
    const value = candidate[key]
    if (value !== undefined) scalars[key] = compareKey(value)
  }
  return {
    scalars,
    authors: candidate.authors.map(({ name }) => looseKey(name)),
    series: candidate.series === undefined ? undefined : looseKey(candidate.series),
  }
}

/** D-8: the private Book's values the target lacks or holds differently, as overrides. */
function differing(own: BookValues, target: Comparable): BookOverrides {
  const mine = fromBook(own)
  const entries: [OverridableBookField, unknown][] = []
  for (const key of SCALAR_FIELDS) {
    const value = mine.scalars[key]
    if (value !== undefined && value !== target.scalars[key]) entries.push([key, own[key]])
  }
  const sameAuthors =
    mine.authors.length === target.authors.length &&
    mine.authors.every((key, i) => key === target.authors[i])
  if (mine.authors.length > 0 && !sameAuthors) {
    entries.push(['authors', (own.authors ?? []).map(idOf)])
  }
  if (mine.series !== undefined && mine.series !== target.series && own.series != null) {
    entries.push(['series', idOf(own.series)])
  }
  // `fromEntries` loses the key-to-value pairing; each value is the Book's own field.
  return Object.fromEntries(entries) as BookOverrides
}

/** The Book's overridable values and cover, with system privileges (the caller's own or a shared Book). */
async function readBook(tx: Context, id: number): Promise<BookValues> {
  assertLive(tx)
  return tx.req.payload.findByID({
    collection: 'books',
    id,
    select: {
      title: true,
      subtitle: true,
      authors: true,
      series: true,
      seriesIndex: true,
      publisher: true,
      year: true,
      language: true,
      pages: true,
      description: true,
      cover: true,
    },
    ...system(tx),
    depth: 1,
    populate: {
      authors: { name: true, visibility: true },
      series: { name: true, visibility: true },
    },
  })
}

/** The id of the user's own private Book with the ISBN; never another user's, the admin's included. */
async function ownPrivateBook(tx: Context, isbn13: string): Promise<number | undefined> {
  const { docs } = await gateway.find(tx, {
    collection: 'books',
    where: {
      and: [
        { isbn13: { equals: isbn13 } },
        { visibility: { equals: 'private' } },
        { createdBy: { equals: tx.user.id } },
      ],
    },
    select: { isbn13: true },
    depth: 0,
    limit: 1,
    pagination: false,
  })
  return docs[0]?.id
}

/** FR-12 and D-8: the private Book takes the candidate's values and becomes shared, same row. */
async function promote(tx: Context, bookId: number, pending: PendingShare): Promise<void> {
  const { payload } = tx.req
  const { candidate: best, raw, cover } = pending
  const own = await readBook(tx, bookId)
  const overrides = isAdmin(tx.user) ? {} : differing(own, fromCandidate(best))

  // As `ensureSharedBook()`: shared rows only, one after the other (AD-16).
  const authors: number[] = []
  for (const { name, sortName } of best.authors) {
    const input = sortName === undefined ? { name } : { name, sortName }
    const { id } = await findOrCreateByName(tx, 'authors', 'shared', input)
    if (!authors.includes(id)) authors.push(id)
  }
  const series =
    best.series === undefined
      ? null
      : (await findOrCreateByName(tx, 'series', 'shared', { name: best.series })).id
  const genres = await mapSubjectsToGenres(tx, raw)
  let coverId: number | undefined
  if (cover && own.cover == null) coverId = await attachCover(tx, cover, 'shared')
  else if (cover) await discardCover(payload, cover)

  assertLive(tx)
  await payload.update({
    collection: 'books',
    id: bookId,
    data: {
      title: best.title,
      subtitle: best.subtitle ?? null,
      authors,
      series,
      seriesIndex: best.seriesIndex ?? null,
      publisher: best.publisher ?? null,
      year: best.year ?? null,
      language: best.language ?? null,
      pages: best.pages ?? null,
      description: best.description ?? null,
      ...(coverId !== undefined && { cover: coverId }),
      themes: best.themes,
      genres,
      source: best.source,
      rawMetadata: raw,
      visibility: 'shared',
    },
    ...system(tx),
  })

  // After the update: overrides exist only on shared Books.
  await upsertUserBook(tx, bookId, { overrides })
  await removeOrphans(tx, own)
}

/**
 * FR-12 and D-8: the private Book's copies and row move to the shared Book,
 * then it is deleted, only when nothing references it any more.
 */
async function merge(tx: Context, ownId: number, sharedId: number): Promise<void> {
  const own = await readBook(tx, ownId)
  const overrides = isAdmin(tx.user) ? {} : differing(own, fromBook(await readBook(tx, sharedId)))
  await moveCopiesToBook(tx, ownId, sharedId)
  await mergeUserBook(tx, ownId, sharedId, overrides)
  // Postgres would null a remaining reference on delete; the throw rolls the save back.
  if (!(await isUnreferenced(tx, 'books', ownId))) {
    throw new Error(`Private Book ${ownId} is still referenced after its merge`)
  }
  await deleteRow(tx, 'books', ownId)
  await removeOrphans(tx, own)
}

/**
 * After a promote or a merge: the private authors and series `own` used, and
 * its cover's `media` row, each deleted when nothing references it. Shared
 * rows are never candidates; a private one an override keeps stays.
 */
async function removeOrphans(tx: Context, own: BookValues): Promise<void> {
  // One after the other: calls on one context never run concurrently (AD-16).
  for (const author of own.authors ?? []) {
    const { id, visibility } = populated<Author>(author)
    if (visibility === 'private' && (await isUnreferenced(tx, 'authors', id))) {
      await deleteRow(tx, 'authors', id)
    }
  }
  if (own.series != null) {
    const { id, visibility } = populated<Series>(own.series)
    if (visibility === 'private' && (await isUnreferenced(tx, 'series', id))) {
      await deleteRow(tx, 'series', id)
    }
  }
  if (own.cover != null) {
    const id = idOf(own.cover)
    if (await isUnreferenced(tx, 'media', id)) await deleteMediaRow(tx, id)
  }
}
