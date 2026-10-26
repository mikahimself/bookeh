'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useTransition } from 'react'

import { useToast } from '../../components/toast/ToastProvider'

/**
 * Loans: refreshes the server render after any successful toast Undo, so an
 * undone Returned (or Lend) moves its row back with no Book detail open
 * (`ReadAndRating` refreshes only while Book detail is mounted). Renders
 * nothing.
 */
export function RefreshOnUndo() {
  const router = useRouter()
  const { onUndone } = useToast()
  const [, startTransition] = useTransition()

  useEffect(() => onUndone(() => startTransition(() => router.refresh())), [onUndone, router])

  return null
}
