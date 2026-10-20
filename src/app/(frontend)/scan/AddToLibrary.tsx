'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useRef, useTransition } from 'react'

import { Button } from '../components/Button'
import { useTaskBack } from '../components/navigation'
import { ProgressLine } from '../components/ProgressLine'
import { settleAction, useReportFailure } from '../components/request'
import { useToast } from '../components/toast/ToastProvider'

import { saveCopyAction } from './actions'

/**
 * Add to library (EXPERIENCE.md, Answer): saves an owned copy as fetched,
 * raises the held "Saved to {location}" toast and returns to Scan. A failure
 * is reported and leaves the Answer as it was.
 *
 * One `requestId` per series of presses: made on the first tap, sent again on
 * every retry after a failure (a save whose answer was lost returns the first
 * result) and dropped after a success, so a revived instance never reuses it.
 * A tap while a save is in flight does nothing, and so does one after a
 * success: the latch stays until the Answer is gone, since leaving it can take
 * a server round trip. Unmounting (or hiding under Activity) releases it, so a
 * revived instance saves again. When the Answer has already been left (Back,
 * X), the toast still shows and nothing navigates. The progress line runs
 * while a save is in flight (EXPERIENCE.md, Progress line).
 */
export function AddToLibrary({ isbn13 }: { isbn13: string }) {
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

  const add = () => {
    if (inFlight.current) return
    inFlight.current = true
    requestId.current ??= crypto.randomUUID()
    const input = { requestId: requestId.current, isbn13 }
    startTransition(async () => {
      let saved = false
      try {
        const result = await settleAction(saveCopyAction(input))
        if (!result.ok) {
          reportFailure(result.code)
          return
        }
        saved = true
        requestId.current = null
        const { savedTo } = result.data
        show({
          kind: 'success',
          message: savedTo ? t('toast.savedTo', { location: savedTo.name }) : t('toast.saved'),
          hold: true,
        })
        if (mounted.current) back()
      } finally {
        // Latched after a success until unmount: a tap before the Answer is
        // gone would be a new press and a second copy.
        if (!saved) inFlight.current = false
      }
    })
  }

  return (
    <>
      {pending && <ProgressLine label={t('progress.loading')} />}
      <Button variant="primary" onClick={add} disabled={pending}>
        {t('answer.addToLibrary')}
      </Button>
    </>
  )
}
