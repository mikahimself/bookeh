'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useRef, useTransition } from 'react'

import type { SaveResult } from '@/lib/catalogue/saveCopy'
import type { ActionResult } from '@/lib/errors'
import type { Undoable } from '@/lib/undo/undo'

import { useTaskBack } from '../components/navigation'
import { settleAction, useReportFailure } from '../components/request'
import { useToast } from '../components/toast/ToastProvider'

export type SaveFailure = Extract<ActionResult<never>, { ok: false }>

/** The save a press runs, with the press's `requestId`. */
export type SaveCall = (requestId: string) => Promise<ActionResult<Undoable<SaveResult>>>

/** Handles a refused save itself and returns `true`, or leaves it to be reported. */
export type OnRefused = (failure: SaveFailure) => boolean

/**
 * The press behind every Add to library button (EXPERIENCE.md, Answer):
 * `add(call)` runs `call(requestId)`, the save, then raises the held
 * "Saved to {location}" toast with the save's Edit (Edit book for the new
 * copy) and Undo, and returns to Scan. A
 * failure goes to `onRefused` first, which returns `true` when it handled it
 * (a field message); otherwise it is reported. Either way the Answer stays
 * as it was.
 *
 * One `requestId` per series of presses: made on the first tap, sent again on
 * every retry after a failure (a save whose answer was lost returns the first
 * result) and dropped after a success, so a revived instance never reuses it.
 * A tap while a save is in flight does nothing, and so does one after a
 * success: the latch stays until the Answer is gone, since leaving it can take
 * a server round trip. Unmounting (or hiding under Activity) releases it, so a
 * revived instance saves again. When the Answer has already been left (Back,
 * X), the toast still shows and nothing navigates. `pending` is true while a
 * save is in flight, for the progress line (EXPERIENCE.md, Progress line).
 */
export function useAddToLibrary(): {
  pending: boolean
  add: (call: SaveCall, onRefused?: OnRefused) => void
} {
  const t = useTranslations()
  const { show } = useToast()
  const reportFailure = useReportFailure()
  const back = useTaskBack('/scan')
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

  const add = (call: SaveCall, onRefused?: OnRefused) => {
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
        const { bookId, copyId, savedTo, undoToken, undoSeconds } = result.data
        show({
          kind: 'success',
          message: savedTo ? t('toast.savedTo', { location: savedTo.name }) : t('toast.saved'),
          hold: true,
          undo: { token: undoToken, seconds: undoSeconds },
          edit: `/books/${bookId}/edit?copy=${copyId}`,
        })
        if (mounted.current) back()
      } finally {
        // Latched after a success until unmount: a tap before the Answer is
        // gone would be a new press and a second copy.
        if (!saved) inFlight.current = false
      }
    })
  }

  return { pending, add }
}
