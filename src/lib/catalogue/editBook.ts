import { canEditShared } from '@/access/roles'
import { OVERRIDABLE_BOOK_FIELDS, type OverridableBookField } from '@/fields/bookFields'
import { requireOwnBook } from '@/lib/books/requireOwnBook'
import { type BookOverrides, upsertUserBook } from '@/lib/books/upsertUserBook'
import { DomainError, type ErrorCode } from '@/lib/errors'
import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import { assertLive, withTransaction } from '@/lib/payload/transaction'

import { system } from './system'

/**
 * Spine, Structural Seed (`src/lib/catalogue`): the fields one edit changes,
 * only those the user changed. `null` clears a field; a key whose value is
 * `undefined` is absent. `authors`, `series` and `isbn13` join with their
 * stories (4.3, 4.4).
 */
export type BookEdits = Partial<{
  title: string
  subtitle: string | null
  seriesIndex: number | null
  genres: number[] // system genre ids: shared Books for the admin
  publisher: string | null
  year: number | null
  language: string | null
  pages: number | null
  description: string | null
}>

export type EditBookInput = { bookId: number; edits: BookEdits }

type EditKey = keyof BookEdits
type ScalarKey = Exclude<EditKey, 'genres'>

const EDIT_KEYS: readonly EditKey[] = [
  'title',
  'subtitle',
  'seriesIndex',
  'publisher',
  'year',
  'language',
  'pages',
  'description',
  'genres',
]

const isEditKey = (key: string): key is EditKey => (EDIT_KEYS as readonly string[]).includes(key)

const isOverridable = (key: EditKey): key is ScalarKey & OverridableBookField =>
  (OVERRIDABLE_BOOK_FIELDS as readonly string[]).includes(key)

/** Text input convention: trimmed and NFC-normalised, `''` stored as `null`. */
const normalise = <T>(value: T): T | null => {
  if (typeof value !== 'string') return value
  const text = value.trim().normalize('NFC')
  return text === '' ? null : (text as T)
}

const invalid = (keys: Iterable<string>): DomainError => {
  const fields: Record<string, ErrorCode> = {}
  for (const key of keys) fields[key] = 'VALIDATION'
  return new DomainError('VALIDATION', { fields })
}

/**
 * Spine, AD-5, AD-6 and D-8: the only path that changes a saved Book's values.
 * `edits` is sparse: only keys whose value is not `undefined` are written,
 * `null` clears, and nothing is compared with stored values. Text is trimmed
 * and NFC-normalised, `''` stored as `null`; `genres` is deduplicated.
 *
 * Before any read, an unknown key (`themes` included: themes are never
 * edited), `genres` from a non-admin and a cleared `title` fail with
 * `VALIDATION` naming each key, so a rejected edit reveals nothing about the
 * Book. Then, in one transaction: `requireOwnBook()` (`NOT_FOUND` unless the
 * viewer holds the Book) and the Book's visibility as the viewer reads it. An
 * empty edit passes the gate and writes nothing. A held Book the viewer can no
 * longer read (a shared Book the admin made private) fails that read with
 * `NOT_FOUND`. A private Book fails with `VALIDATION` naming each submitted
 * key until its edit lands (4.4).
 *
 * On a shared Book, the admin (`canEditShared`) writes the shared Book with
 * system privileges and drops their own override of each edited field;
 * anyone else's edit becomes their overrides (`upsertUserBook()`), and the
 * shared Book does not change. Field limits stay with the collections.
 * There is no Undo: no undo token, no restore.
 */
export async function editBook(ctx: Context, { bookId, edits }: EditBookInput): Promise<void> {
  const admin = canEditShared(ctx.user)
  const rejected = new Set<string>()
  const changes: BookEdits = {}
  for (const [key, value] of Object.entries(edits)) {
    if (value === undefined) continue
    if (!isEditKey(key) || (key === 'genres' && !admin)) {
      rejected.add(key)
    } else if (key === 'genres') {
      changes.genres = [...new Set(value as number[])]
    } else {
      const stored = normalise(value)
      if (key === 'title' && stored === null) rejected.add(key)
      else Object.assign(changes, { [key]: stored })
    }
  }
  if (rejected.size > 0) throw invalid(rejected)

  const keys = EDIT_KEYS.filter((key) => changes[key] !== undefined)

  await withTransaction(ctx, async (tx) => {
    await requireOwnBook(tx, bookId)
    if (keys.length === 0) return
    const book = await gateway.findByID(tx, {
      collection: 'books',
      id: bookId,
      select: { visibility: true },
      depth: 0,
    })
    if (book.visibility !== 'shared') throw invalid(keys)

    const overridable = keys.filter(isOverridable)
    if (admin) {
      assertLive(tx)
      await tx.req.payload.update({
        collection: 'books',
        id: bookId,
        data: changes,
        ...system(tx),
      })
      await upsertUserBook(tx, bookId, { dropOverrides: overridable })
    } else {
      // `genres` was rejected above, so every key is an override field.
      const overrides: BookOverrides = Object.fromEntries(
        overridable.map((key) => [key, changes[key]]),
      )
      await upsertUserBook(tx, bookId, { overrides })
    }
  })
}
