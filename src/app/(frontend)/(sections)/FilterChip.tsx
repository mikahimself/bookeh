'use client'

import { useSearchParams } from 'next/navigation'
import type { ReactNode } from 'react'

import { parseShelfQuery, shelfHref } from '@/lib/shelf/query'

import { TextLink } from '../components/Link'

import { useSheetChip } from './BookDetailSheet'
import { addFilter, type ChipField } from './filterToggle'

/**
 * A Filter chip on Book detail (EXPERIENCE.md, Book detail; UX-DR34): a Link
 * that adds `id` to `field` on the current address's filters, never taking
 * one off. Built from the address rather than the query Book detail was
 * rendered with: a Filter panel tap beside the wide panel can have moved it
 * since. In the wide panel it replaces the address and keeps the Book open;
 * in the phone sheet it closes the sheet onto the collection without `book`
 * (`useSheetChip`).
 */
export function FilterChip({
  field,
  id,
  children,
}: {
  field: ChipField
  id: number
  children: ReactNode
}) {
  const { query, book } = parseShelfQuery(useSearchParams())
  const sheetChip = useSheetChip()
  const next = addFilter(query, field, id)

  if (sheetChip) {
    const href = shelfHref(next)
    return (
      <TextLink
        href={href}
        prefetch={false}
        onClick={(event) => {
          event.preventDefault()
          sheetChip(href)
        }}
      >
        {children}
      </TextLink>
    )
  }
  return (
    <TextLink href={shelfHref(next, { book })} replace scroll={false} prefetch={false}>
      {children}
    </TextLink>
  )
}
