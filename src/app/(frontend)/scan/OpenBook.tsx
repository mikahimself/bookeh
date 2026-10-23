'use client'

import { parseShelfQuery, shelfHref } from '@/lib/shelf/query'

import { Button } from '../components/Button'
import { useCloseTask } from '../components/navigation'

/**
 * Open book on the In library Answer (UX-DR46): leaves scanning as the X
 * does, then opens the collection on that Book's detail, so its close lands
 * below the task, never on the Answer.
 */
export function OpenBook({ bookId, label }: { bookId: number; label: string }) {
  const closeTask = useCloseTask()

  return (
    <Button
      variant="secondary"
      onClick={() => closeTask(null, shelfHref(parseShelfQuery({}).query, { book: bookId }))}
    >
      {label}
    </Button>
  )
}
