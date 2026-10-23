'use client'

import { useTranslations } from 'next-intl'
import { useRef, useState, useTransition } from 'react'

import { Button } from '../components/Button'
import { settleAction } from '../components/request'
import { useToast } from '../components/toast/ToastProvider'
import { Dialog } from '../components/ui/Dialog'

import { removeCopiesAction, toggleCopiesReadAction } from './actions'
import { useSelection } from './Selection'
import { useAfterAction } from './ShelfRows'

/**
 * DESIGN.md and EXPERIENCE.md, Action bar: in select mode, full width along
 * the bottom with a 2px `text` top edge. Wide, one row: the count on the
 * left, the actions then Done on the right. On the phone two rows: the count
 * and Done above, the actions below (styles.css lifts the toast over both).
 * Sticky at the bottom with the pinned Scan book's padding, which it hides
 * on the phone; `data-pinned-wide` lifts the toast above it on wide screens
 * too.
 *
 * Read and Remove send every ticked id, in view or not, and share one
 * pending state. Read toggles the distinct Books at once (AD-18) and toasts
 * "Marked {n} read" or "unread" with Undo (AD-20); the toast's Undo reloads
 * the rows through `onUndone` and leaves the ticks alone. Remove asks first;
 * no Undo. For both, `ok` and `NOT_FOUND` untick the ids sent and keep select
 * mode (a copy gone elsewhere cannot be unticked from the list); any other
 * failure keeps them. Focus goes to Done after Read settles and after
 * Remove's dialog closes, whatever the result, since the pending state
 * disables the button that had it.
 */
export function SelectBar() {
  const t = useTranslations('collection')
  const tToast = useTranslations('toast')
  const { show } = useToast()
  const { selecting, ticked, done, untick } = useSelection()
  const afterAction = useAfterAction()
  const [pending, startTransition] = useTransition()
  const [confirmOpen, setConfirmOpen] = useState(false)
  // Kept while the dialog closes, so its title does not change on the way out.
  const [removing, setRemoving] = useState(0)
  const doneButton = useRef<HTMLButtonElement>(null)
  const confirmed = useRef(false)

  if (!selecting) return null

  const remove = (copyIds: number[]) => {
    startTransition(async () => {
      const result = await settleAction(removeCopiesAction(copyIds))
      if (result.ok || result.code === 'NOT_FOUND') untick(copyIds)
      afterAction(result)
    })
  }

  const markRead = (copyIds: number[]) => {
    startTransition(async () => {
      const result = await settleAction(toggleCopiesReadAction(copyIds))
      if (result.ok) {
        const { read, count, undoToken, undoSeconds } = result.data
        show({
          kind: 'success',
          message: tToast(read ? 'markedRead' : 'markedUnread', { n: count }),
          undo: { token: undoToken, seconds: undoSeconds },
        })
      }
      if (result.ok || result.code === 'NOT_FOUND') untick(copyIds)
      doneButton.current?.focus()
      afterAction(result)
    })
  }

  return (
    <div
      data-action-bar
      data-pinned-bottom
      data-pinned-wide
      className="sticky bottom-0 -mx-page-margin-phone mt-auto grid grid-cols-[1fr_auto] items-center gap-4 border-t-2 border-text bg-background px-page-margin-phone pt-4 pb-[calc(var(--spacing-4)+env(safe-area-inset-bottom))] wide:-mx-page-margin wide:flex wide:px-page-margin"
    >
      <p aria-live="polite" className="text-body text-text">
        {t('selected', { n: ticked.size })}
      </p>
      <div className="flex gap-2 max-wide:col-span-2 max-wide:row-start-2 wide:ml-auto">
        <Button
          variant="secondary"
          disabled={ticked.size === 0 || pending}
          onClick={() => markRead([...ticked])}
        >
          {t('markRead')}
        </Button>
        <Button
          variant="destructive"
          disabled={ticked.size === 0 || pending}
          onClick={() => {
            setRemoving(ticked.size)
            setConfirmOpen(true)
          }}
        >
          {t('remove')}
        </Button>
      </div>
      {/* Select unmounts on entering, so focus moves here rather than to the page. */}
      <Button ref={doneButton} variant="primary" onClick={done} autoFocus>
        {t('done')}
      </Button>
      <Dialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onClosed={() => {
          if (!confirmed.current) return
          confirmed.current = false
          doneButton.current?.focus()
        }}
        title={t('removeTitle', { n: removing })}
        confirm={
          <Button
            variant="destructive"
            onClick={() => {
              if (!confirmOpen) return
              confirmed.current = true
              setConfirmOpen(false)
              remove([...ticked])
            }}
          >
            {t('remove')}
          </Button>
        }
      />
    </div>
  )
}
