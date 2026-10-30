import { ValidationError } from 'payload'

import { canEditShared } from '@/access/roles'
import { OVERRIDABLE_BOOK_FIELDS, type OverridableBookField } from '@/fields/bookFields'
import { toIsbn13 } from '@/fields/isbn'
import { limits } from '@/fields/limits'
import { normaliseName, normaliseText } from '@/fields/sortName'
import { requireOwnBook } from '@/lib/books/requireOwnBook'
import { type BookOverrides, upsertUserBook } from '@/lib/books/upsertUserBook'
import { moveCopies } from '@/lib/copies/moveCopies'
import { setStatus } from '@/lib/copies/updateCopy'
import { DomainError, type ErrorCode } from '@/lib/errors'
import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import { idOf, type Ref } from '@/lib/payload/ref'
import { assertLive, withTransaction } from '@/lib/payload/transaction'
import type { Book } from '@/payload-types'

import { findOrCreateByName, type NameScope } from './findOrCreateByName'
import { system } from './system'

/**
 * Spine, Structural Seed (`src/lib/catalogue`): the fields one edit changes,
 * only those the user changed. `null` clears a field; a key whose value is
 * `undefined` is absent.
 */
export type BookEdits = Partial<{
  title: string
  subtitle: string | null
  authors: string[] // names
  series: string | null // name
  seriesIndex: number | null
  genres: number[] // system genre ids: shared Books for the admin, private Books for their creator
  publisher: string | null
  year: number | null
  language: string | null
  pages: number | null
  description: string | null
  isbn13: string // private Books only; never removed
}>

/**
 * Spine, Shared shapes. `copy` is one of the viewer's copies and only what
 * changes on it: a `status` (with `location` for owned), or a `location`
 * alone.
 */
export type EditBookInput = {
  bookId: number
  edits: BookEdits
  copy?: { id: number; status?: 'owned' | 'ordered'; location?: Ref | null }
}

type EditKey = keyof BookEdits

/** `changes` with author and series names resolved to ids, as the Book and `user-books` store them. */
type Resolved = Omit<BookEdits, 'authors' | 'series'> & {
  authors?: number[]
  series?: number | null
}

const EDIT_KEYS: readonly EditKey[] = [
  'title',
  'subtitle',
  'authors',
  'series',
  'seriesIndex',
  'publisher',
  'year',
  'language',
  'pages',
  'description',
  'genres',
  'isbn13',
]

const isEditKey = (key: string): key is EditKey => (EDIT_KEYS as readonly string[]).includes(key)

const isOverridable = (
  key: EditKey,
): key is Exclude<EditKey, 'genres' | 'isbn13'> & OverridableBookField =>
  (OVERRIDABLE_BOOK_FIELDS as readonly string[]).includes(key)

/** Spine, Text input: `normaliseText()`, the description multiline; `''` stored as `null`. */
const normalise = <T>(key: EditKey, value: T): T | null => {
  if (typeof value !== 'string') return value
  const text = normaliseText(value, { multiline: key === 'description' })
  return text === '' ? null : (text as T)
}

/** `limits` for the text keys that have one, on the normalised value. */
const LIMITS: Partial<Record<EditKey, number>> = {
  title: limits.title,
  subtitle: limits.subtitle,
  description: limits.description,
  publisher: limits.publisher,
  language: limits.language,
  series: limits.name,
}

const invalid = (keys: Iterable<string>): DomainError => {
  const fields: Record<string, ErrorCode> = {}
  for (const key of keys) fields[key] = 'VALIDATION'
  return new DomainError('VALIDATION', { fields })
}

/**
 * The private-scope ISBN index's error (AD-19). Payload takes its path from
 * the constraint detail (`created_by_id, isbn13`), not the field name.
 */
const isIsbnClash = (err: unknown): boolean =>
  err instanceof ValidationError &&
  err.data.errors.some(({ path }: { path: unknown }) => String(path).includes('isbn13'))

/**
 * Spine, AD-5, AD-6, D-8 and FR-14: the only path that changes a saved Book's
 * values. `edits` is sparse: only keys whose value is not `undefined` are
 * written and `null` clears. Text follows the Text input convention
 * (`normaliseText()`: single-line text and names NFC, trimmed, whitespace
 * runs collapsed; the description NFC and trimmed only), `''` stored as
 * `null`; `genres` is deduplicated; `isbn13` is normalised to ISBN-13.
 * `authors: []` and `series: null` (or a blank series) clear.
 *
 * Before any read, an unknown key (`themes` included: themes are never
 * edited), a cleared `title` and an author name blank after normalising fail
 * with `VALIDATION` naming each key, as does a negative `seriesIndex`, `year`
 * or `pages`; a `title`, `subtitle`, `publisher`, `language`, `description`,
 * author or `series` over its `limits` after normalising names its key with
 * `TOO_LONG`, never clipped, as `normaliseManual()` does; and an `isbn13`
 * that is not an ISBN (blank and `null` included) names it with
 * `INVALID_ISBN`, so a rejected edit reveals nothing about the Book. Then,
 * in one transaction: `requireOwnBook()` (`NOT_FOUND` unless the viewer
 * holds the Book) and the Book's visibility and creator as the viewer reads
 * them. An empty edit passes the gate and writes nothing. A held Book the viewer can no longer
 * read (a shared Book the admin made private) fails that read with
 * `NOT_FOUND`. On a shared Book, `isbn13`, and `genres` from a non-admin,
 * then fail with `VALIDATION` naming each.
 *
 * Only then, inside the transaction, `authors` and `series` names resolve to
 * ids one by one, in order, through `findOrCreateByName()` (AD-5): the
 * admin's on a shared Book in the `'shared'` scope, every other edit's in the
 * `'private'` scope. Author ids keep first-occurrence order without repeats.
 * A rejected edit therefore creates no author or series; an author or series
 * an edit unlinks stays in place.
 *
 * A private Book is edited only by its creator; anyone else who holds it (the
 * admin) gets `NOT_FOUND`. The creator's edit, `genres` and `isbn13`
 * included, is one system write to the Book itself, with no override. An ISBN
 * another of the creator's private Books has fails on the private-scope
 * unique index (AD-19), rethrown as `VALIDATION` on `isbn13`; there is no
 * pre-check, and the new ISBN starts no share or merge (AD-5).
 *
 * On a shared Book, the admin (`canEditShared`) writes the shared Book with
 * system privileges and drops their own override of each edited field.
 * Anyone else's edit is compared, normalised and resolved, with the shared
 * Book's stored value: a field that differs becomes their override, and one
 * equal to it (scalars exactly, `authors` as the ordered ids, `series` by id)
 * drops their override of that field, in one `upsertUserBook()` write. The
 * shared Book does not change.
 *
 * `copy` (FR-13, FR-28) is written in the same transaction, after the Book's
 * edits, so a failure in either leaves both unchanged. A `status` goes
 * through `setStatus()` (owned without a `location` takes the default), a
 * `location` alone through `moveCopies()`, whose restore is dropped; both
 * refuse a copy that is not the viewer's with `NOT_FOUND`. Ordered on a copy
 * with an open loan fails in `setStatus()` with `VALIDATION` on `status`, and
 * the Book's edit rolls back with it. `moveCopies()`
 * skips an ordered copy, which this one caller turns back into `VALIDATION`
 * on `location` (the Book's edit rolls back with it). Ordered together with a
 * `location` fails with `VALIDATION` on `location` before any read. An empty
 * edit with a `copy` still writes the copy.
 *
 * There is no Undo: no undo token, no restore.
 */
export async function editBook(
  ctx: Context,
  { bookId, edits, copy }: EditBookInput,
): Promise<void> {
  const admin = canEditShared(ctx.user)
  const rejected = new Map<string, ErrorCode>()
  const changes: BookEdits = {}
  for (const [key, value] of Object.entries(edits)) {
    if (value === undefined) continue
    if (!isEditKey(key)) {
      rejected.set(key, 'VALIDATION')
    } else if (key === 'genres') {
      changes.genres = [...new Set(value as number[])]
    } else if (key === 'isbn13') {
      const isbn13 = typeof value === 'string' ? toIsbn13(value) : null
      if (isbn13 === null) rejected.set(key, 'INVALID_ISBN')
      else changes.isbn13 = isbn13
    } else if (key === 'authors') {
      const names: unknown = value
      const normalised =
        Array.isArray(names) && names.every((name) => typeof name === 'string')
          ? names.map(normaliseName)
          : undefined
      if (normalised === undefined || normalised.includes('')) rejected.set(key, 'VALIDATION')
      else if (normalised.some((name) => name.length > limits.name)) rejected.set(key, 'TOO_LONG')
      else changes.authors = normalised
    } else {
      const stored = normalise(key, value)
      const max = LIMITS[key]
      if (key === 'title' && stored === null) rejected.set(key, 'VALIDATION')
      else if (typeof stored === 'number' && stored < 0) rejected.set(key, 'VALIDATION')
      else if (typeof stored === 'string' && max !== undefined && stored.length > max) {
        rejected.set(key, 'TOO_LONG')
      } else Object.assign(changes, { [key]: stored })
    }
  }
  if (copy?.status === 'ordered' && copy.location !== undefined)
    rejected.set('location', 'VALIDATION')
  if (rejected.size > 0) {
    throw new DomainError('VALIDATION', { fields: Object.fromEntries(rejected) })
  }

  await withTransaction(ctx, async (tx) => {
    await requireOwnBook(tx, bookId)
    await writeBook(tx, bookId, changes, admin)
    if (copy) await writeCopy(tx, copy)
  })
}

/** The Book's part of `editBook()`, in its transaction: nothing for an empty edit. */
async function writeBook(
  tx: Context,
  bookId: number,
  changes: BookEdits,
  admin: boolean,
): Promise<void> {
  const keys = EDIT_KEYS.filter((key) => changes[key] !== undefined)
  if (keys.length === 0) return
  // The overridable values too: a non-admin's edit is compared with them.
  const book = await gateway.findByID(tx, {
    collection: 'books',
    id: bookId,
    select: {
      visibility: true,
      createdBy: true,
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
    },
    depth: 0,
  })
  const own = book.visibility !== 'shared'
  if (own) {
    if (idOf(book.createdBy) !== tx.user.id) throw new DomainError('NOT_FOUND')
  } else {
    const refused = keys.filter((key) => key === 'isbn13' || (key === 'genres' && !admin))
    if (refused.length > 0) throw invalid(refused)
  }

  // One after the other: calls on one context never run concurrently (AD-16).
  const scope: NameScope = admin && !own ? 'shared' : 'private'
  const { authors: authorNames, series: seriesName, ...rest } = changes
  const data: Resolved = rest
  if (authorNames !== undefined) {
    const authors: number[] = []
    for (const name of authorNames) {
      const { id } = await findOrCreateByName(tx, 'authors', scope, { name })
      if (!authors.includes(id)) authors.push(id)
    }
    data.authors = authors
  }
  if (seriesName !== undefined) {
    data.series =
      seriesName === null
        ? null
        : (await findOrCreateByName(tx, 'series', scope, { name: seriesName })).id
  }

  if (own) {
    assertLive(tx)
    try {
      await tx.req.payload.update({
        collection: 'books',
        id: bookId,
        data,
        ...system(tx),
      })
    } catch (err) {
      if (changes.isbn13 !== undefined && isIsbnClash(err)) {
        throw new DomainError('VALIDATION', { fields: { isbn13: 'VALIDATION' } })
      }
      throw err
    }
    return
  }

  const overridable = keys.filter(isOverridable)
  if (admin) {
    assertLive(tx)
    await tx.req.payload.update({
      collection: 'books',
      id: bookId,
      data,
      ...system(tx),
    })
    await upsertUserBook(tx, bookId, { dropOverrides: overridable })
  } else {
    // `genres` and `isbn13` were refused above, so every key is an override field.
    const differs = overridable.filter((key) => !sameAsShared(key, data[key], book))
    const overrides: BookOverrides = Object.fromEntries(differs.map((key) => [key, data[key]]))
    const dropOverrides = overridable.filter((key) => !differs.includes(key))
    await upsertUserBook(tx, bookId, { overrides, dropOverrides })
  }
}

/**
 * Whether an edited, resolved value equals the shared Book's stored one (read
 * at depth 0), stored text normalised as the edit is.
 */
function sameAsShared(
  key: OverridableBookField,
  value: Resolved[OverridableBookField],
  book: Pick<Book, OverridableBookField>,
): boolean {
  if (key === 'authors') {
    const ids = (book.authors ?? []).map(idOf)
    const edited = (value ?? []) as number[]
    return ids.length === edited.length && ids.every((id, i) => id === edited[i])
  }
  if (key === 'series') return (idOf(book.series) ?? null) === (value ?? null)
  return (normalise(key, book[key]) ?? null) === (value ?? null)
}

/** The copy's part of `editBook()`, in its transaction. */
async function writeCopy(tx: Context, copy: NonNullable<EditBookInput['copy']>): Promise<void> {
  if (copy.status === 'ordered') await setStatus(tx, copy.id, { status: 'ordered' })
  else if (copy.status === 'owned') {
    await setStatus(tx, copy.id, { status: 'owned', location: copy.location })
  } else if (copy.location !== undefined) {
    const { data } = await moveCopies(tx, [copy.id], copy.location)
    if (data.skipped.length > 0) throw invalid(['location'])
  }
}
