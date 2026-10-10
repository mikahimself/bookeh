'use client'

import { useRouter } from 'next/navigation'
import { useCallback } from 'react'

import type { ActionResult, ErrorCode } from '@/lib/errors'

import { useToast } from '../../components/toast/ToastProvider'

/** A rejected action call (the network dropped) is a failure, not an error boundary. */
export const settled = <T>(call: Promise<ActionResult<T>>): Promise<ActionResult<T>> =>
  call.catch((): ActionResult<T> => ({ ok: false, code: 'INTERNAL' }))

/**
 * How a Settings control reports a failed action: a signed-out session goes
 * back to sign in, returning here; everything else is an error toast.
 */
export function useReportFailure(): (code: ErrorCode) => void {
  const router = useRouter()
  const { show } = useToast()
  return useCallback(
    (code: ErrorCode) => {
      if (code === 'UNAUTHENTICATED') router.replace('/login?next=%2Fsettings')
      else show({ kind: 'error', code })
    },
    [router, show],
  )
}
