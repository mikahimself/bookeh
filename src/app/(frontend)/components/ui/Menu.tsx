'use client'

import { Menu as BaseMenu } from '@base-ui/react/menu'
import { useRef, useState, type ReactElement } from 'react'

import { useSuspendSwipe } from '../swipe'
import { optionClass, popupClass } from './classes'
import { useCloseOnBack } from './overlay'

export type MenuItem = {
  label: string
  onSelect: () => void
  disabled?: boolean
  destructive?: boolean
}

export type MenuProps = {
  /** The opener, a Button or an ActionLink; the menu gives it its press handling. */
  trigger: ReactElement
  items: readonly MenuItem[]
}

/**
 * DESIGN.md, Combobox (popup): a short list of actions in the combobox's
 * outlined box under its trigger, the highlighted item with the selection
 * bar. Choosing an item closes the menu before dispatching it; the action owns
 * focus on a choice, while dismissal restores focus to the trigger. Modal while open, as Base UI's default.
 */
export function Menu({ trigger, items }: MenuProps) {
  const [open, setOpen] = useState(false)
  const selected = useRef<(() => void) | null>(null)
  const handingOff = useRef(false)
  const historyClosed = useRef(false)
  const popupClosed = useRef(false)
  const dispatch = () => {
    if (!historyClosed.current || !popupClosed.current) return
    const run = selected.current
    selected.current = null
    run?.()
  }
  useSuspendSwipe(open)
  useCloseOnBack(
    open,
    () => setOpen(false),
    () => {
      historyClosed.current = true
      dispatch()
    },
  )

  return (
    <BaseMenu.Root
      open={open}
      onOpenChange={(next) => {
        if (next) {
          handingOff.current = false
          historyClosed.current = false
          popupClosed.current = false
          selected.current = null
        }
        setOpen(next)
      }}
      onOpenChangeComplete={(next) => {
        if (next) return
        popupClosed.current = true
        dispatch()
      }}
    >
      <BaseMenu.Trigger render={trigger} />
      <BaseMenu.Portal>
        <BaseMenu.Positioner align="start" sideOffset={0}>
          <BaseMenu.Popup
            finalFocus={() => (handingOff.current ? false : true)}
            className={`min-w-(--anchor-width) ${popupClass}`}
          >
            {items.map((item, index) => (
              <BaseMenu.Item
                key={index}
                disabled={item.disabled}
                data-destructive={item.destructive ? '' : undefined}
                onClick={() => {
                  selected.current = item.onSelect
                  handingOff.current = true
                  setOpen(false)
                }}
                className={`${optionClass} data-disabled:text-text-dim data-destructive:text-danger`}
              >
                {item.label}
              </BaseMenu.Item>
            ))}
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  )
}
