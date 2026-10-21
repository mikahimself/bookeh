import { getTranslations } from 'next-intl/server'
import { ViewTransition } from 'react'

import { getEffectiveBooks, type EffectiveBook } from '@/lib/books/effectiveBook'
import { requireOwnBook } from '@/lib/books/requireOwnBook'
import { DomainError } from '@/lib/errors'
import { requireUser, type Context } from '@/lib/payload/context'

import { EditBookScreen } from './EditBookScreen'
import { NotHeld } from './NotHeld'

/** Postgres `integer`'s largest value, the widest id a Book can have. */
const MAX_ID = 2147483647

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

/**
 * Edit book (EXPERIENCE.md, Edit book), a full-screen task at
 * `/books/[bookId]/edit`. The wrapper sits in the page, as on `/scan`, so the
 * task slides in and away with the route. An id that is not digits, a Book
 * the viewer holds no copy of, or one they can no longer read is "not held":
 * the toast "Not in library" over the section.
 */
export default async function EditBookPage({ params }: PageProps<'/books/[bookId]/edit'>) {
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

  return (
    <ViewTransition enter="task-enter" exit="task-exit" default="none">
      <EditBookScreen
        bookId={book.bookId}
        title={book.title}
        authors={book.authors.map(({ name }) => name).join(', ')}
        source={source}
        cover={book.coverUrl}
      />
    </ViewTransition>
  )
}
