import { getLocale, getTranslations } from 'next-intl/server'
import { Fragment, type ReactNode } from 'react'

import type { EffectiveBook } from '@/lib/books/effectiveBook'
import { languageName } from '@/lib/books/languageName'

import { Cover } from '../components/Cover'

import { FilterChip } from './FilterChip'

/**
 * Book detail's header (EXPERIENCE.md, Book detail; DESIGN.md, Detail
 * panel), shared with the opened wishlist entry: the 120 × 180 cover beside
 * the title, then the authors (phone: `meta`, muted; wide: `title` type), the muted "{pages} pages ·
 * {language}" line and the series with its number. The authors and the
 * series are Filter chips (`FilterChip`), drawn at their lines' height with
 * the tap areas outside the layout (`tapOutside`), spaced on the phone so
 * no two areas overlap (wrapped authors 28px apart; 24px above the series
 * when the muted line is absent); each line, and each part of the
 * muted one, is left out when empty. Publisher and year are not shown here.
 * `children` (Book detail's Rating, the entry's "On {list}") come last in the
 * text column.
 */
export async function BookHeader({
  book,
  children,
}: {
  book: EffectiveBook
  children?: ReactNode
}) {
  const t = await getTranslations()
  const meta = [
    book.pages === null ? null : t('answer.pages', { pages: book.pages }),
    book.language === null ? null : languageName(book.language, await getLocale()),
  ]
    .filter((part) => part)
    .join(' · ')

  return (
    <div className="flex items-start gap-4">
      <div className="w-cover-header shrink-0">
        <Cover src={book.coverUrl} title={book.title} language={book.language} />
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <h2 className="text-title wide:text-heading-detail break-words text-text">{book.title}</h2>
        {book.authors.length > 0 && (
          <p className="flex flex-wrap gap-x-1 text-meta text-text-muted wide:text-title wide:text-text max-wide:gap-y-7 max-wide:[&_a]:text-text-muted">
            {book.authors.map(({ id, name }, index) => (
              <span key={id}>
                <FilterChip field="author" id={id} tapOutside>
                  {name}
                </FilterChip>
                {index < book.authors.length - 1 && ','}
              </span>
            ))}
          </p>
        )}
        {meta && <p className="text-meta text-text-muted">{meta}</p>}
        {book.series && (
          <p className={`text-body text-text${meta ? '' : ' max-wide:mt-5'}`}>
            <FilterChip field="series" id={book.series.id} tapOutside>
              {book.series.name}
            </FilterChip>
            {book.seriesIndex !== null && ` ${book.seriesIndex}`}
          </p>
        )}
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
