import { OVERRIDABLE_BOOK_FIELDS, type OverridableBookField } from '@/fields/bookFields'
import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import { idOf } from '@/lib/payload/ref'
import type { Book, UserBook } from '@/payload-types'

import { coverUrl } from './coverUrl'
import { genreName } from './genreName'

// Spine, Structural Seed (Shared shapes, `src/lib/books`).

/** A related record as the surface shows it. */
export type Named = { id: number; name: string }

/**
 * Spine, AD-6: a Book as the viewer sees it, their `user-books` overrides laid
 * over the shared values. The only Book shape surface code receives; it never
 * carries `rawMetadata` (AD-9). `source` is a `SourceId` from `lib/metadata`,
 * which `lib/books` does not import.
 */
export type EffectiveBook = {
  bookId: number
  isbn13: string | null
  visibility: 'shared' | 'private'
  source: string | null
  title: string
  subtitle: string | null
  authors: Named[]
  series: Named | null
  seriesIndex: number | null
  genres: Named[] // system genres
  themes: string[]
  publisher: string | null
  year: number | null
  language: string | null
  pages: number | null
  description: string | null
  coverUrl: string | null
  overridden: string[]
}

export type TagKind = 'tag' | 'genre' | 'theme'

/**
 * The viewer's own state on a Book. Declared with `EffectiveBook` as the spine
 * places it; `tags` is typed now and its reader arrives with the tag stories
 * (E11, G-stories), which also add the `tags` collection it reads from.
 */
export type UserBookState = {
  read: boolean
  rating: number | null
  tags: (Named & { kind: TagKind })[]
}

/** The ten override fields, as both `books` and `user-books` carry them. */
type Overridable = Pick<UserBook, OverridableBookField>
type Picked = { [K in OverridableBookField]: NonNullable<Overridable[K]> | null }

/** A populated relation, or `undefined` for an id Payload left unpopulated (unreadable target). */
const populated = <T extends { id: number }>(
  value: number | T | null | undefined,
): T | undefined => (typeof value === 'object' && value !== null ? value : undefined)

const toNamed = ({ id, name }: Named): Named => ({ id, name })

/** A Book as the reader selects it: without `rawMetadata` (AD-9) and `createdBy`. */
type BookDoc = Omit<Book, 'rawMetadata' | 'createdBy'>

/**
 * The merge, AD-6: a field is overridden iff its name is in the row's
 * `overridden`; then the row's stored value applies, an empty one meaning
 * cleared. A stored value whose name is not listed is ignored; no row means no
 * overrides. One pass over `OVERRIDABLE_BOOK_FIELDS`, so the field set and
 * this reader stay one declaration.
 */
function toEffectiveBook(book: BookDoc, row: UserBook | undefined, ctx: Context): EffectiveBook {
  const overridden = row?.overridden ?? []
  const listed = new Set<string>(overridden)
  // Payload keeps `''` for text fields; a cleared one is `null` here.
  const pick = (key: OverridableBookField) => {
    const from: Overridable | undefined = listed.has(key) ? row : book
    const value = from?.[key]
    return value === undefined || value === '' ? null : value
  }
  // `fromEntries` loses the key-to-value pairing; `Picked` restores it.
  const picked = Object.fromEntries(
    OVERRIDABLE_BOOK_FIELDS.map((key) => [key, pick(key)]),
  ) as Picked

  const { authors, series: pickedSeries, ...scalars } = picked
  const cover = populated(book.cover)
  const series = populated(pickedSeries)
  return {
    bookId: book.id,
    isbn13: book.isbn13 ?? null,
    visibility: book.visibility,
    source: book.source ?? null,
    ...scalars,
    title: picked.title ?? '',
    authors: (authors ?? []).flatMap((author) => {
      const doc = populated(author)
      return doc ? [toNamed(doc)] : []
    }),
    series: series ? toNamed(series) : null,
    genres: (book.genres ?? []).flatMap((genre) => {
      const doc = populated(genre)
      return doc ? [{ id: doc.id, name: genreName(doc, ctx.user.language) }] : []
    }),
    themes: book.themes ?? [],
    coverUrl: cover?.filename ? coverUrl({ filename: cover.filename }) : null,
    overridden,
  }
}

/**
 * Spine, AD-6: the one reader of a Book as the viewer sees it, keyed by Book
 * id. Ids the viewer cannot read (another user's private Book, AD-4) are
 * absent, not an error: the gateway's `find` on `books` applies that scope,
 * and its `find` on `user-books` reaches the viewer's own rows alone, so no
 * `owner` condition is needed. Both reads populate one level so relations
 * arrive as docs; an unreadable target stays an id and is dropped.
 */
export async function getEffectiveBooks(
  ctx: Context,
  bookIds: readonly number[],
): Promise<Map<number, EffectiveBook>> {
  const result = new Map<number, EffectiveBook>()
  if (bookIds.length === 0) return result

  const ids = [...bookIds]
  // AD-9 holds at the query: `rawMetadata` is not read even for the admin,
  // and `createdBy` is not populated.
  const { docs: books } = await gateway.find(ctx, {
    collection: 'books',
    where: { id: { in: ids } },
    select: { rawMetadata: false, createdBy: false },
    depth: 1,
    pagination: false,
  })
  if (books.length === 0) return result

  const { docs: rows } = await gateway.find(ctx, {
    collection: 'user-books',
    where: { book: { in: books.map((book) => book.id) } },
    depth: 1,
    pagination: false,
  })
  const rowByBook = new Map(rows.map((row) => [idOf(row.book), row]))

  for (const book of books) {
    result.set(book.id, toEffectiveBook(book, rowByBook.get(book.id), ctx))
  }
  return result
}
