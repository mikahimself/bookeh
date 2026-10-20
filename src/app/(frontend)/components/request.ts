'use client'

import { unstable_isUnrecognizedActionError, unstable_rethrow, useRouter } from 'next/navigation'
import { useCallback } from 'react'

import type { ActionResult, ErrorCode } from '@/lib/errors'

import type { ToastInput } from './toast/store'
import { useToast } from './toast/ToastProvider'

/**
 * Spine, Errors; UX-DR51: a server action call as an `ActionResult`, never a
 * rejection. A dropped connection is `NO_CONNECTION`, an action from an older
 * build (the 404 `x-nextjs-action-not-found`) is `APP_UPDATED`, anything else
 * `INTERNAL`. Next.js control flow passes through. No retry, no queue.
 */
export function settleAction<T>(call: Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  return call.catch((err: unknown): ActionResult<T> => {
    unstable_rethrow(err)
    if (unstable_isUnrecognizedActionError(err)) return { ok: false, code: 'APP_UPDATED' }
    // What `fetch` rejects with when the network fails.
    if (err instanceof TypeError) return { ok: false, code: 'NO_CONNECTION' }
    return { ok: false, code: 'INTERNAL' }
  })
}

/**
 * Spine, Errors; UX-DR51: a `/data` request as an `ActionResult`. `runRoute`
 * always answers JSON; a body that is not JSON (a proxy's 502 page) is
 * `UNAUTHENTICATED` on 401 and `INTERNAL` otherwise.
 */
export async function fetchData<T>(
  path: `/data/${string}`,
  init?: RequestInit,
): Promise<ActionResult<T>> {
  let response: Response
  try {
    response = await fetch(path, init)
  } catch {
    return { ok: false, code: 'NO_CONNECTION' }
  }
  try {
    return (await response.json()) as ActionResult<T>
  } catch {
    return { ok: false, code: response.status === 401 ? 'UNAUTHENTICATED' : 'INTERNAL' }
  }
}

export type ReportTargets = {
  show: (input: ToastInput) => void
  dismiss: () => void
  replace: (href: string) => void
}

/**
 * Spine, Errors; UX-DR51: how a client reports a failure. A signed-out
 * session goes to sign in and back to the address it is on now, query
 * included; the toast goes first, since the provider wraps /login too.
 * Anything else is an error toast.
 */
export function reportFailure(code: ErrorCode, { show, dismiss, replace }: ReportTargets): void {
  if (code === 'UNAUTHENTICATED') {
    dismiss()
    replace(`/login?next=${encodeURIComponent(location.pathname + location.search)}`)
    return
  }
  show({ kind: 'error', code })
}

/** `reportFailure` bound to the toast and the router. */
export function useReportFailure(): (code: ErrorCode) => void {
  const router = useRouter()
  const { show, dismiss } = useToast()
  return useCallback(
    (code: ErrorCode) =>
      reportFailure(code, { show, dismiss, replace: (href) => router.replace(href) }),
    [router, show, dismiss],
  )
}
