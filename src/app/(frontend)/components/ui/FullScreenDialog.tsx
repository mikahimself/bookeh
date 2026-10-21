'use client'

import { Dialog as BaseDialog } from '@base-ui/react/dialog'
import type { ReactNode } from 'react'

import { useSuspendSwipe } from '../swipe'
import { useCloseOnBack, useOverlayLayer } from './overlay'

export type FullScreenDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Names the step for assistive technology; it draws no heading. */
  label: string
  children?: ReactNode
  /** Runs once per close, after the step's history entry is gone (`useCloseOnBack`). */
  onClosed?: () => void
}

/**
 * A modal step filling the screen, always in the dark palette whatever the
 * theme (DESIGN.md, Corner crop). Esc and Back close it; the content draws
 * its own way out. Counts as a dialog, so nothing opens on top of it.
 */
export function FullScreenDialog({
  open,
  onOpenChange,
  label,
  children,
  onClosed,
}: FullScreenDialogProps) {
  const layer = useOverlayLayer('dialog')
  useSuspendSwipe(open)
  useCloseOnBack(open, () => onOpenChange(false), onClosed)

  return layer(
    <BaseDialog.Root open={open} onOpenChange={(next) => onOpenChange(next)}>
      <BaseDialog.Portal>
        <BaseDialog.Popup
          aria-label={label}
          data-palette="dark"
          className="fixed inset-0 flex flex-col bg-background text-text overlay-fade"
        >
          {children}
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>,
  )
}
