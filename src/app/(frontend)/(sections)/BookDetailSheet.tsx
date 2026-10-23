'use client'

import { useEffect, useState, type ReactNode } from 'react'

import { shelfHref, type ShelfQuery } from '@/lib/shelf/query'

import { useTaskBack } from '../components/navigation'
import { Sheet } from '../components/ui/Sheet'

/**
 * Book detail on the phone (EXPERIENCE.md, Book detail): a bottom sheet over
 * the dimmed list. `?book=` is the open state, so the sheet is `addressed`:
 * it opens on mount, sliding up, and X, Esc, the scrim or a drag down close
 * it, then leave the address: history back to the entry the row pushed from,
 * or, opened directly, the collection without `book`, replacing. The
 * browser's Back removes `book` itself and the page drops the sheet.
 */
export function BookDetailSheet({
  label,
  query,
  children,
}: {
  label: string
  query: ShelfQuery
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const leave = useTaskBack(shelfHref(query), true)

  // Mounted open, Base UI would show the sheet without sliding it up.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setOpen(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <Sheet addressed open={open} onOpenChange={setOpen} label={label} onClosed={leave}>
      {children}
    </Sheet>
  )
}
