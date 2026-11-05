import { canEditShared } from '@/access/roles'
import { toNameKey } from '@/fields/nameKey'
import { genreName } from '@/lib/books/genreName'
import { DomainError } from '@/lib/errors'
import type { Context } from '@/lib/payload/context'
import { normalisedName } from '@/lib/payload/ownedName'
import { idOf, isRowId } from '@/lib/payload/ref'
import { assertLive, withTransaction } from '@/lib/payload/transaction'

import { system } from './system'

type Tx = Parameters<Parameters<typeof withTransaction>[1]>[0]

/** A system genre as the admin manages it: both names and the number of Books it classifies. */
export type GenreUse = { id: number; name: string; nameFi: string | null; books: number }

type GenreRow = { id: number; name: string; nameFi?: string | null }

async function allGenres(tx: Tx): Promise<GenreRow[]> {
  assertLive(tx)
  const { docs } = await tx.req.payload.find({
    collection: 'genres',
    select: { name: true, nameFi: true },
    pagination: false,
    ...system(tx),
  })
  return docs
}

/** Fails with `NOT_FOUND` unless every id is a row id of an existing genre. */
function assertGenres(rows: GenreRow[], ...ids: number[]): void {
  if (!ids.every((id) => isRowId(id) && rows.some((row) => row.id === id))) {
    throw new DomainError('NOT_FOUND')
  }
}

/**
 * Fails with `NAME_TAKEN` and the other genre's id when `name`'s key is the
 * English or Finnish name of a genre other than `exceptId`: Finna matches a
 * term against both, so one key must mean one genre.
 */
function assertFree(rows: GenreRow[], name: string, exceptId?: number): void {
  const key = toNameKey(name)
  const taken = rows.find(
    (row) =>
      row.id !== exceptId &&
      (toNameKey(row.name) === key || (row.nameFi != null && toNameKey(row.nameFi) === key)),
  )
  if (taken) throw new DomainError('NAME_TAKEN', { conflictId: taken.id })
}

function assertAdmin(ctx: Context): void {
  if (!canEditShared(ctx.user)) throw new DomainError('NOT_FOUND')
}

/** The ids of every Book, shared or private, classified as genre `id`. */
async function booksOf(tx: Tx, id: number) {
  assertLive(tx)
  const { docs } = await tx.req.payload.find({
    collection: 'books',
    where: { genres: { equals: id } },
    select: { genres: true },
    pagination: false,
    ...system(tx),
  })
  return docs
}

/**
 * Spine, AD-5, FR-17: adds a system genre with an English name and, when
 * given, a Finnish one. Admin only: anyone else fails with `NOT_FOUND` before
 * any read. A blank or over-long name fails with `VALIDATION` on `name` (or
 * `nameFi`); a name that is already the English or Finnish name of a genre
 * fails with `NAME_TAKEN` and that genre's id. Runs in the caller's
 * transaction or one of its own (AD-16). Not undoable.
 */
export async function addGenre(ctx: Context, name: string, nameFi?: string): Promise<number> {
  assertAdmin(ctx)
  const english = normalisedName(name, 'name')
  const finnish = nameFi?.trim() ? normalisedName(nameFi, 'nameFi') : null

  return withTransaction(ctx, async (tx) => {
    const rows = await allGenres(tx)
    assertFree(rows, english)
    if (finnish !== null && toNameKey(finnish) !== toNameKey(english)) assertFree(rows, finnish)
    const created = await tx.req.payload.create({
      collection: 'genres',
      data: { name: english, nameFi: finnish, nameKey: '' },
      ...system(tx),
    })
    return created.id
  })
}

/**
 * Spine, AD-5, FR-17: renames a system genre's English name. Admin only;
 * anyone else, or an id that is no genre, fails with `NOT_FOUND`. Blank or
 * over-long fails with `VALIDATION` on `name`; a name that is the English or
 * Finnish name of another genre fails with `NAME_TAKEN` and its id, so the
 * caller can offer a merge. A case-only rename succeeds. Not undoable.
 */
export async function renameGenre(ctx: Context, id: number, name: string): Promise<void> {
  assertAdmin(ctx)
  if (!isRowId(id)) throw new DomainError('NOT_FOUND')
  const english = normalisedName(name, 'name')

  await withTransaction(ctx, async (tx) => {
    const rows = await allGenres(tx)
    assertGenres(rows, id)
    assertFree(rows, english, id)
    assertLive(tx)
    await tx.req.payload.update({
      collection: 'genres',
      id,
      data: { name: english },
      ...system(tx),
    })
  })
}

/**
 * Spine, AD-5, FR-17: sets, or with a blank `nameFi` clears, a system genre's
 * Finnish name. Same gate and failures as `renameGenre()`, on `nameFi`.
 */
export async function setGenreNameFi(ctx: Context, id: number, nameFi: string): Promise<void> {
  assertAdmin(ctx)
  if (!isRowId(id)) throw new DomainError('NOT_FOUND')
  const finnish = nameFi.trim() ? normalisedName(nameFi, 'nameFi') : null

  await withTransaction(ctx, async (tx) => {
    const rows = await allGenres(tx)
    assertGenres(rows, id)
    if (finnish !== null) assertFree(rows, finnish, id)
    assertLive(tx)
    await tx.req.payload.update({
      collection: 'genres',
      id,
      data: { nameFi: finnish },
      ...system(tx),
    })
  })
}

/**
 * Spine, AD-5, FR-17: merges system genre `sourceId` into `targetId`. Admin
 * only; anyone else, or an id that is no genre, fails with `NOT_FOUND`; the
 * same id twice fails with `VALIDATION`; both before any write. Every Book
 * classified as the source, shared or private, gets the target in its place
 * (once, keeping its order), then the source is deleted, in one transaction.
 * Reads and writes no `user-books`, copy or tag (D-6). Not undoable.
 */
export async function mergeGenre(ctx: Context, sourceId: number, targetId: number): Promise<void> {
  assertAdmin(ctx)
  if (!isRowId(sourceId) || !isRowId(targetId)) throw new DomainError('NOT_FOUND')
  if (sourceId === targetId) throw new DomainError('VALIDATION')

  await withTransaction(ctx, async (tx) => {
    assertGenres(await allGenres(tx), sourceId, targetId)
    // One after the other: calls on one context never run concurrently (AD-16).
    for (const book of await booksOf(tx, sourceId)) {
      const ids = (book.genres ?? []).map((genre) => idOf(genre))
      const merged = [...new Set(ids.map((id) => (id === sourceId ? targetId : id)))]
      assertLive(tx)
      await tx.req.payload.update({
        collection: 'books',
        id: book.id,
        data: { genres: merged },
        ...system(tx),
      })
    }
    assertLive(tx)
    await tx.req.payload.delete({ collection: 'genres', id: sourceId, ...system(tx) })
  })
}

/**
 * Spine, AD-5, FR-17: deletes a system genre, removing it from every Book
 * first, in one transaction. Same gate as `mergeGenre()`. Reads and writes no
 * private row of any user (D-6). Not undoable.
 */
export async function deleteGenre(ctx: Context, id: number): Promise<void> {
  assertAdmin(ctx)
  if (!isRowId(id)) throw new DomainError('NOT_FOUND')

  await withTransaction(ctx, async (tx) => {
    assertGenres(await allGenres(tx), id)
    for (const book of await booksOf(tx, id)) {
      const rest = (book.genres ?? []).map((genre) => idOf(genre)).filter((other) => other !== id)
      assertLive(tx)
      await tx.req.payload.update({
        collection: 'books',
        id: book.id,
        data: { genres: rest },
        ...system(tx),
      })
    }
    assertLive(tx)
    await tx.req.payload.delete({ collection: 'genres', id, ...system(tx) })
  })
}

/**
 * Spine, AD-5, FR-17: every system genre with both names and the number of
 * Books, shared or private, classified as it (zero included), sorted by the
 * viewer's display name in their language. Admin only: anyone else fails with
 * `NOT_FOUND`.
 */
export async function genreUse(ctx: Context): Promise<GenreUse[]> {
  assertAdmin(ctx)
  return withTransaction(ctx, async (tx) => {
    const rows = await allGenres(tx)
    const { language } = tx.user
    const collator = new Intl.Collator(language)
    const uses: (GenreUse & { label: string })[] = []
    for (const row of rows) {
      assertLive(tx)
      const { totalDocs } = await tx.req.payload.count({
        collection: 'books',
        where: { genres: { equals: row.id } },
        ...system(tx),
      })
      uses.push({
        id: row.id,
        name: row.name,
        nameFi: row.nameFi || null,
        books: totalDocs,
        label: genreName(row, language),
      })
    }
    return uses
      .sort((a, b) => collator.compare(a.label, b.label))
      .map(({ label: _label, ...use }) => use)
  })
}
