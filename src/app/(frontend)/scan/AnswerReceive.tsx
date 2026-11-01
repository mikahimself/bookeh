'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useRef, useTransition } from 'react'

import { receiveCopyAction } from '../(sections)/actions'
import { ActionLink } from '../components/Link'
import { settleAction, useReportFailure } from '../components/request'
import { useToast } from '../components/toast/ToastProvider'

/**
 * An ordered copy's Received on a held Answer (FR-28, AD-18, AD-20): the same
 * action Book detail's `ReceiveCopy` calls, so the copy becomes owned at the
 * viewer's default location and the toast says where it landed ("Saved to
 * {location}", or "Saved" without one) with Undo, which orders it again. The
 * Answer refreshes itself afterwards -- the heading becomes In library and the
 * line loses this Link -- rather than reporting through `useAfterAction()`,
 * which only `ShelfActionsProvider` supplies and the scan surface does not
 * mount; `AnswerLookUpAgain` refreshes the same way.
 *
 * `NOT_FOUND` (the copy gone, or no longer the viewer's) refreshes too, as
 * the collection's `afterAction` does, so no dead Link is left behind; any
 * other failure is reported and leaves the Answer as it was. The toast's Undo
 * orders the copy again, which the Answer follows through the `RefreshOnUndo`
 * `HeldAnswer` mounts -- not from here: a successful press refreshes the
 * Answer into In library, which unmounts this Link and any listener on it.
 *
 * A refresh unmounts this Link, so focus is moved to the lines container
 * first (`tabIndex={-1}` in `AnswerLayout`); it would otherwise fall to the
 * body, as `ReceiveCopy` avoids on Book detail.
 */
export function AnswerReceive({ copyId }: { copyId: number }) {
  const t = useTranslations()
  const { show } = useToast()
  const router = useRouter()
  const reportFailure = useReportFailure()
  const [pending, startTransition] = useTransition()
  const link = useRef<HTMLButtonElement>(null)

  const receive = () => {
    startTransition(async () => {
      const result = await settleAction(receiveCopyAction({ copyId }))
      if (!result.ok && result.code !== 'NOT_FOUND') {
        reportFailure(result.code)
        return
      }
      if (result.ok) {
        const { savedTo, undoToken, undoSeconds } = result.data
        show({
          kind: 'success',
          message: savedTo ? t('toast.savedTo', { location: savedTo.name }) : t('toast.saved'),
          undo: { token: undoToken, seconds: undoSeconds },
        })
      }
      // The lines change with the refresh, which unmounts this Link.
      link.current?.closest('ul')?.focus()
      router.refresh()
    })
  }

  return (
    <ActionLink ref={link} disabled={pending} onClick={receive}>
      {t('detail.received')}
    </ActionLink>
  )
}
