import { getLocale, getTranslations } from 'next-intl/server'
import { Fragment, type ReactNode } from 'react'

import type { EffectiveBook } from '@/lib/books/effectiveBook'
import { languageName } from '@/lib/books/languageName'

import { Cover } from '../components/Cover'

import { FilterChip } from './FilterChip'

/**
 * Book detail's header (EXPERIENCE.md, Book detail; DESIGN.md, Detail
 * panel), shared with the opened wishlist entry: the cover beside the title,
 * then the authors and the series with its number, each a Filter chip
 * (`FilterChip`), and the muted edition line (publisher · year · pages ·
 * language), each left out when empty. `children` follow the edition line in
 * the text column.
 */
export async function BookHeader({
  book,
  children,
}: {
  book: EffectiveBook
  children?: ReactNode
}) {
  const t = await getTranslations()
  const edition = [
    book.publisher,
    book.year === null ? null : String(book.year),
    book.pages === null ? null : t('answer.pages', { pages: book.pages }),
    book.language === null ? null : languageName(book.language, await getLocale()),
  ]
    .filter((part) => part)
    .join(' · ')

  return (
    <div className="flex items-start gap-4">
      <div className="w-cover-detail shrink-0">
        <Cover src={book.coverUrl} title={book.title} language={book.language} />
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <h2 className="text-heading-detail break-words text-text">{book.title}</h2>
        {book.authors.length > 0 && (
          <p className="text-body text-text">
            {joined(
              book.authors.map(({ id, name }) => (
                <FilterChip key={id} field="author" id={id}>
                  {name}
                </FilterChip>
              )),
              ', ',
            )}
          </p>
        )}
        {book.series && (
          <p className="text-body text-text">
            <FilterChip field="series" id={book.series.id}>
              {book.series.name}
            </FilterChip>
            {book.seriesIndex !== null && ` ${book.seriesIndex}`}
          </p>
        )}
        {edition && <p className="text-meta text-text-muted">{edition}</p>}
        {children}
      </div>
    </div>
  )
}

/** `items` with `separator` as plain text between each two. */
export function joined(items: ReactNode[], separator: string): ReactNode[] {
  return items.map((item, index) => (
    <Fragment key={index}>
      {index > 0 && separator}
      {item}
    </Fragment>
  ))
}
