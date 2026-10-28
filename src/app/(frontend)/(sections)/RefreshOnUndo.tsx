'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useTransition } from 'react'

import { useToast } from '../components/toast/ToastProvider'

/**
 * A section whose rows change with no Book detail open (Loans, one wishlist):
 * refreshes the server render after any successful toast Undo, so an undone
 * Returned, Lend, Bought or Ordered puts its row back (`ReadAndRating`
 * refreshes only while Book detail is mounted). Renders nothing.
 */
export function RefreshOnUndo() {
  const router = useRouter()
  const { onUndone } = useToast()
  const [, startTransition] = useTransition()

  useEffect(() => onUndone(() => startTransition(() => router.refresh())), [onUndone, router])

  return null
}
