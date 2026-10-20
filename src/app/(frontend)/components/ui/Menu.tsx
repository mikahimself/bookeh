'use client'

import { Menu as BaseMenu } from '@base-ui/react/menu'
import { useState, type ReactElement } from 'react'

import { useSuspendSwipe } from '../swipe'
import { optionClass, popupClass } from './classes'

export type MenuItem = { label: string; onSelect: () => void }

export type MenuProps = {
  /** The opener, a Button or an ActionLink; the menu gives it its press handling. */
  trigger: ReactElement
  items: readonly MenuItem[]
}

/**
 * DESIGN.md, Combobox (popup): a short list of actions in the combobox's
 * outlined box under its trigger, the highlighted item with the selection
 * bar. Choosing an item runs it and closes the menu; focus returns to the
 * trigger. Modal while open, as Base UI's default.
 */
export function Menu({ trigger, items }: MenuProps) {
  const [open, setOpen] = useState(false)
  useSuspendSwipe(open)

  return (
    <BaseMenu.Root open={open} onOpenChange={setOpen}>
      <BaseMenu.Trigger render={trigger} />
      <BaseMenu.Portal>
        <BaseMenu.Positioner align="start" sideOffset={0}>
          <BaseMenu.Popup className={`min-w-(--anchor-width) ${popupClass}`}>
            {items.map((item, index) => (
              <BaseMenu.Item key={index} onClick={item.onSelect} className={optionClass}>
                {item.label}
              </BaseMenu.Item>
            ))}
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  )
}
