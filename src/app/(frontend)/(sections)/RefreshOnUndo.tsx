'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useTransition } from 'react'

import { useToast } from '../components/toast/ToastProvider'

/**
 * A surface whose server render changes with no Book detail open (Loans, one
 * wishlist, a held Answer): refreshes it after any successful toast Undo, so
 * an undone Returned, Lend, Bought, Ordered or Received puts the row, or the
 * Answer's heading, back (`ReadAndRating` refreshes only while Book detail is
 * mounted). Renders nothing.
 */
export function RefreshOnUndo() {
  const router = useRouter()
  const { onUndone } = useToast()
  const [, startTransition] = useTransition()

  useEffect(() => onUndone(() => startTransition(() => router.refresh())), [onUndone, router])

  return null
}
