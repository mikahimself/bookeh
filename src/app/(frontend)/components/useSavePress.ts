'use client'

import { useEffect, useRef, useTransition } from 'react'

import type { ActionResult } from '@/lib/errors'

import { settleAction, useReportFailure } from './request'

export type SaveFailure = Extract<ActionResult<never>, { ok: false }>

/** Handles a refused save itself and returns `true`, or leaves it to be reported. */
export type OnRefused = (failure: SaveFailure) => boolean

/** A save a press runs with its `requestId`. */
export type PressCall<T> = (requestId: string) => Promise<ActionResult<T>>

/**
 * The press behind every save button (Add to library, Add to wishlist):
 * `press(call)` runs `call(requestId)`, the save, then `onSaved(data,
 * mounted)`, `mounted` false when the caller has already gone. A failure goes
 * to `onRefused` first, which returns `true` when it handled it (a field
 * message, a refresh); otherwise it is reported. Either way the caller stays
 * as it was.
 *
 * One `requestId` per series of presses: made on the first tap, sent again on
 * every retry after a failure (a save whose answer was lost returns the first
 * result) and dropped after a success, so a revived instance never reuses it.
 * A tap while a save is in flight does nothing. With `latch` (the default),
 * so does one after a success: the latch stays until the caller is gone,
 * since leaving it can take a server round trip; unmounting (or hiding under
 * Activity) releases it, so a revived instance saves again. Without `latch`
 * (a caller that stays, Book detail), a success releases it and the next tap
 * is a new save. `pending` is true while a save is in flight, for the
 * progress line (EXPERIENCE.md, Progress line).
 */
export function useSavePress<T>(
  onSaved: (data: T, mounted: boolean) => void,
  { latch = true }: { latch?: boolean } = {},
): {
  pending: boolean
  press: (call: PressCall<T>, onRefused?: OnRefused) => void
} {
  const reportFailure = useReportFailure()
  const [pending, startTransition] = useTransition()
  const inFlight = useRef(false)
  const requestId = useRef<string | null>(null)
  const mounted = useRef(false)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      inFlight.current = false
    }
  }, [])

  const press = (call: PressCall<T>, onRefused?: OnRefused) => {
    if (inFlight.current) return
    inFlight.current = true
    requestId.current ??= crypto.randomUUID()
    const id = requestId.current
    startTransition(async () => {
      let saved = false
      try {
        const result = await settleAction(call(id))
        if (!result.ok) {
          if (!onRefused?.(result)) reportFailure(result.code)
          return
        }
        saved = true
        requestId.current = null
        onSaved(result.data, mounted.current)
      } finally {
        // Latched after a success until unmount: a tap before the caller is
        // gone would be a new press and a second save.
        if (!saved || !latch) inFlight.current = false
      }
    })
  }

  return { pending, press }
}
