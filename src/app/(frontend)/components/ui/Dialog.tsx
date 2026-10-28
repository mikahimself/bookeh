'use client'

import { Dialog as BaseDialog } from '@base-ui/react/dialog'
import { useTranslations } from 'next-intl'
import type { ReactNode, RefObject } from 'react'

import { Button } from '../Button'
import { useSuspendSwipe } from '../swipe'
import { useCloseOnBack, useOverlayLayer } from './overlay'

export type DialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** A typed name inside it keeps its case: wrap it in `normal-case` (DESIGN.md, Lowercase). */
  title: ReactNode
  children?: ReactNode
  /**
   * The confirming button, a primary or destructive Button; it sits right of
   * Cancel. The foot is outside `children`, so a submitting `confirm` needs
   * `form="<id>"` naming the form in `children`. Without it the foot holds
   * only Cancel (a Picker, which closes on its choice).
   */
  confirm?: ReactNode
  /** Runs once per close, after the dialog's history entry is gone (`useCloseOnBack`). */
  onClosed?: () => void
  /** The element focused on open, in place of Base UI's default (`Dialog.Popup`'s `initialFocus`). */
  initialFocus?: RefObject<HTMLElement | null>
}

/**
 * DESIGN.md, Dialog: an outlined box on the plain ground, centred, at most
 * 400px wide, over the scrim; title in `heading-group`, buttons right-aligned
 * at the foot. Confirm or cancel: Cancel, Esc, a tap outside and Back all
 * cancel; without a confirm it is a choice that Cancel dismisses. Modal, so
 * focus is held and returns to where it was. The body describes the
 * dialog; a long one scrolls inside the box, which stays
 * within the screen. The backdrop is drawn even inside a sheet, so the
 * dialog always sits over the scrim. Nothing opens on top of a dialog.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  children,
  confirm,
  onClosed,
  initialFocus,
}: DialogProps) {
  const t = useTranslations('overlay')
  const layer = useOverlayLayer('dialog')
  useSuspendSwipe(open)
  useCloseOnBack(open, () => onOpenChange(false), onClosed)

  return layer(
    <BaseDialog.Root open={open} onOpenChange={(next) => onOpenChange(next)}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop forceRender className="fixed inset-0 bg-scrim overlay-fade" />
        <BaseDialog.Viewport className="fixed inset-0 flex items-center justify-center p-page-margin-phone">
          <BaseDialog.Popup
            initialFocus={initialFocus}
            className="flex max-h-full w-full max-w-dialog-width flex-col gap-6 overflow-y-auto border-2 border-text bg-background p-6 overlay-fade"
          >
            <BaseDialog.Title className="text-heading-group ui-case">{title}</BaseDialog.Title>
            {/* A confirm's body describes it; a choice's rows (a Picker) are no description. */}
            {children != null &&
              (confirm != null ? (
                <BaseDialog.Description render={<div />}>{children}</BaseDialog.Description>
              ) : (
                <div>{children}</div>
              ))}
            <div className="flex justify-end gap-2">
              <BaseDialog.Close render={<Button variant="secondary" />}>
                {t('cancel')}
              </BaseDialog.Close>
              {confirm}
            </div>
          </BaseDialog.Popup>
        </BaseDialog.Viewport>
      </BaseDialog.Portal>
    </BaseDialog.Root>,
  )
}
