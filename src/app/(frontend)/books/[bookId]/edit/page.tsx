import { getTranslations } from 'next-intl/server'
import { ViewTransition } from 'react'

import { canEditShared } from '@/access/roles'
import { getEffectiveBooks, type EffectiveBook } from '@/lib/books/effectiveBook'
import { requireOwnBook } from '@/lib/books/requireOwnBook'
import { listGenres } from '@/lib/catalogue/listGenres'
import { listLocations } from '@/lib/copies/locations'
import { DomainError } from '@/lib/errors'
import { requireUser, type Context } from '@/lib/payload/context'

import { EditBookScreen } from './EditBookScreen'
import type { EffectiveEdits } from './MoreDetails'
import { NotHeld } from './NotHeld'
import { MAX_ID, savedCopy } from './savedCopy'

/** The Book as the viewer sees it, or `undefined` when they do not hold it (AD-7). */
async function heldBook(ctx: Context, bookId: number): Promise<EffectiveBook | undefined> {
  try {
    await requireOwnBook(ctx, bookId)
  } catch (err) {
    if (err instanceof DomainError && err.code === 'NOT_FOUND') return undefined
    throw err
  }
  return (await getEffectiveBooks(ctx, [bookId])).get(bookId)
}

/** The Book's values in the shape of `BookEdits`, which the draft is compared with. */
function effectiveEdits(book: EffectiveBook): EffectiveEdits {
  const edits: EffectiveEdits = {
    title: book.title,
    subtitle: book.subtitle,
    authors: book.authors.map(({ name }) => name),
    series: book.series?.name ?? null,
    seriesIndex: book.seriesIndex,
    genres: book.genres.map(({ id }) => id).sort((a, b) => a - b),
    publisher: book.publisher,
    year: book.year,
    language: book.language,
    pages: book.pages,
    description: book.description,
  }
  if (book.isbn13 !== null) edits.isbn13 = book.isbn13
  return edits
}

/**
 * Edit book (EXPERIENCE.md, Edit book), a full-screen task at
 * `/books/[bookId]/edit`. The wrapper sits in the page, as on `/scan`, so the
 * task slides in and away with the route. An id that is not digits, a Book
 * the viewer holds no copy of, or one they can no longer read is "not held":
 * the toast "Not in library" over the section.
 *
 * With `?copy=` naming one of the viewer's copies of this Book (Edit on the
 * save toast), the first screen also shows that copy's status and location,
 * over the viewer's locations; any other `?copy=` is ignored, with no error.
 *
 * The page decides what More details may change: the ISBN on the viewer's
 * own private Book; the system genres there and, for the admin, on a shared
 * Book, with every system genre as the options.
 */
export default async function EditBookPage({
  params,
  searchParams,
}: PageProps<'/books/[bookId]/edit'>) {
  const ctx = await requireUser()
  const { bookId: param } = await params
  // Above Postgres `integer` the count would fail rather than find nothing.
  const bookId = /^\d+$/.test(param) && Number(param) <= MAX_ID ? Number(param) : Number.NaN
  const book = await heldBook(ctx, bookId)
  if (!book) return <NotHeld />

  const t = await getTranslations()
  const sources = await getTranslations('sources')
  const key = book.source as Parameters<typeof sources>[0] | null
  const source =
    key !== null && sources.has(key) ? t('answer.from', { source: sources(key) }) : null

  const isbnEditable = book.visibility === 'private'
  const genresEditable = isbnEditable || canEditShared(ctx.user)
  const genreOptions = genresEditable ? await listGenres(ctx) : null
  const copy = await savedCopy(ctx, book.bookId, (await searchParams).copy)
  const locations = copy ? await listLocations(ctx) : []

  return (
    <ViewTransition enter="task-enter" exit="task-exit" default="none">
      <EditBookScreen
        bookId={book.bookId}
        title={book.title}
        authors={book.authors.map(({ name }) => name).join(', ')}
        source={source}
        cover={book.coverUrl}
        effective={effectiveEdits(book)}
        isbnEditable={isbnEditable}
        genreOptions={genreOptions}
        genres={book.genres}
        themes={book.themes}
        copy={copy}
        locations={locations}
      />
    </ViewTransition>
  )
}
