'use client'

import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'

import { closeEntryAction, removeEntryAction } from '../../../actions/wishlists'
import { Button } from '../../../components/Button'
import { settleAction, useReportFailure } from '../../../components/request'
import { useToast } from '../../../components/toast/ToastProvider'
import { Dialog } from '../../../components/ui/Dialog'
import { useCloseDetail } from '../../detailClose'
import { typed } from '../../settings/ManagedList'

/**
 * The opened entry's Buttons (EXPERIENCE.md, Wishlists → Entry opened;
 * FR-28, UX-DR49): Bought (the layer's one primary), Ordered and Remove
 * (destructive), all disabled while one runs and once one has succeeded.
 *
 * Bought and Ordered close the entry at once, with Undo. The toast follows
 * the outcome, not the shown recipient: Ordered reads "Ordered"; Bought with
 * no copy made (a Person's entry) "Bought", else "Saved to {location}" or
 * "Saved". Then the layer closes and lands on `back`, replacing, so the list
 * renders afresh without the entry (a refresh first would toast "Not on this
 * list"). The page's `RefreshOnUndo` brings it back on Undo.
 *
 * Remove asks in a Dialog; once it has closed confirmed, the entry is
 * deleted and the layer lands on `back`, with no toast and no Undo.
 *
 * For all three, `NOT_FOUND` (gone or closed meanwhile) refreshes into "Not
 * on this list"; any other failure is reported and the layer stays.
 */
export function EntryActions({
  entryId,
  listName,
  back,
}: {
  entryId: number
  listName: string
  back: string
}) {
  const t = useTranslations()
  const router = useRouter()
  const report = useReportFailure()
  const { show } = useToast()
  const closeDetail = useCloseDetail()
  const [pending, startTransition] = useTransition()
  const [removeOpen, setRemoveOpen] = useState(false)
  /** Set on success: the layer is closing, so a second tap must not send again. */
  const [done, setDone] = useState(false)
  const busy = pending || done
  const confirmed = useRef(false)

  const close = (as: 'bought' | 'ordered') => {
    startTransition(async () => {
      const result = await settleAction(closeEntryAction(entryId, as))
      if (result.ok) {
        const { copyId, savedTo, undoToken, undoSeconds } = result.data
        show({
          kind: 'success',
          message:
            as === 'ordered'
              ? t('toast.ordered')
              : copyId === null
                ? t('toast.bought')
                : savedTo
                  ? t('toast.savedTo', { location: savedTo.name })
                  : t('toast.saved'),
          undo: { token: undoToken, seconds: undoSeconds },
        })
        setDone(true)
        closeDetail(back)
      } else if (result.code === 'NOT_FOUND') {
        router.refresh()
      } else {
        report(result.code)
      }
    })
  }

  const remove = () => {
    startTransition(async () => {
      const result = await settleAction(removeEntryAction(entryId))
      if (result.ok) {
        setDone(true)
        closeDetail(back)
      } else if (result.code === 'NOT_FOUND') router.refresh()
      else report(result.code)
    })
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="primary" disabled={busy} onClick={() => close('bought')}>
        {t('wishlists.bought')}
      </Button>
      <Button variant="secondary" disabled={busy} onClick={() => close('ordered')}>
        {t('wishlists.ordered')}
      </Button>
      <Button variant="destructive" disabled={busy} onClick={() => setRemoveOpen(true)}>
        {t('wishlists.remove')}
      </Button>
      <Dialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        onClosed={() => {
          if (!confirmed.current) return
          confirmed.current = false
          remove()
        }}
        title={t.rich('wishlists.removeTitle', { list: listName, typed })}
        confirm={
          <Button
            variant="destructive"
            onClick={() => {
              if (!removeOpen) return
              confirmed.current = true
              setRemoveOpen(false)
            }}
          >
            {t('wishlists.remove')}
          </Button>
        }
      />
    </div>
  )
}
