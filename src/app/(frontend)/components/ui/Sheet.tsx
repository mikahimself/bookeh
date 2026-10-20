'use client'

import { Drawer } from '@base-ui/react/drawer'
import { useTranslations } from 'next-intl'
import { useState, type ReactNode } from 'react'

import { CloseButton } from '../CloseButton'
import { useSuspendSwipe } from '../swipe'
import { useCloseOnBack, useOverlayLayer } from './overlay'

/**
 * Half open, the sheet covers 56% of the screen: the `.sheet` in
 * ux-bookeh-2026-10-03/mockups/key-collection-phone.html. A fraction of the
 * Drawer viewport's height.
 */
export const HALF_OPEN = 0.56
const SNAP_POINTS = [HALF_OPEN, 1]

export type SheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Names the sheet for assistive technology; the content draws its own heading. */
  label: string
  children?: ReactNode
  /** Runs once per close, after the sheet's history entry is gone (`useCloseOnBack`). */
  onClosed?: () => void
}

/**
 * DESIGN.md, Bottom sheet: full width, plain ground, a 2px `text` top edge,
 * the scrim over the list above, and a short line at the top centre as the
 * handle. EXPERIENCE.md: it slides up half open; dragging up or tapping the
 * handle opens it fully; a tap on the dimmed list, a drag down, X, Esc or
 * Back closes it. Modal, and the list underneath keeps its scroll position.
 * Every open starts half open.
 */
export function Sheet({ open, onOpenChange, label, children, onClosed }: SheetProps) {
  const t = useTranslations('overlay')
  const layer = useOverlayLayer('sheet')
  const [snapPoint, setSnapPoint] = useState<Drawer.Root.SnapPoint | null>(HALF_OPEN)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setSnapPoint(HALF_OPEN)
  }
  useSuspendSwipe(open)
  useCloseOnBack(open, () => onOpenChange(false), onClosed)

  return layer(
    <Drawer.Root
      open={open}
      onOpenChange={(next) => onOpenChange(next)}
      swipeDirection="down"
      snapPoints={SNAP_POINTS}
      snapPoint={snapPoint}
      onSnapPointChange={setSnapPoint}
    >
      <Drawer.Portal>
        <Drawer.Backdrop className="fixed inset-0 bg-scrim overlay-fade" />
        <Drawer.Viewport className="fixed inset-0 flex touch-none items-end">
          <Drawer.Popup
            aria-label={label}
            className="flex h-sheet-height w-full touch-none flex-col border-t-2 border-text bg-background sheet-motion"
          >
            <div className="relative flex shrink-0 justify-center">
              <button
                type="button"
                aria-label={t('expand')}
                aria-expanded={snapPoint === 1}
                onClick={() => setSnapPoint(1)}
                className="flex min-h-tap w-tap items-center bg-transparent"
              >
                <span className="w-full border-t-2 border-text" />
              </button>
              <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                <Drawer.Close render={<CloseButton label={t('close')} />} />
              </div>
            </div>
            <Drawer.Content className="min-h-0 flex-1 touch-auto overflow-y-auto overscroll-contain px-page-margin-phone pb-[calc(var(--spacing-page-margin-phone)+env(safe-area-inset-bottom))]">
              {children}
            </Drawer.Content>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>,
  )
}
