'use client'

import { useRef, useState, type ReactNode } from 'react'

import { useSuspendSwipe } from '../swipe'
import { markerSlotClass } from './classes'
import { Dialog } from './Dialog'
import { useWide } from './overlay'
import { Sheet } from './Sheet'

export type PickerOption<V extends string | number> = { value: V; label: ReactNode }

export type PickerProps<V extends string | number> = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  options: readonly PickerOption<V>[]
  value: V | null
  /** Runs once the picker's history entry is gone, so a navigation lands on the entry before it. */
  onChoose: (value: V) => void
}

/**
 * DESIGN.md, Picker: the Bottom sheet on the phone, the Dialog on wide
 * screens, holding one choice from a short list; the chosen row has the 8px
 * marker. One tap chooses and closes; the chosen row, Back, X or Cancel
 * close without a choice. The form is taken at each open and kept until the
 * close, so a resize never swaps the overlay while it is open.
 */
export function Picker<V extends string | number>({
  open,
  onOpenChange,
  title,
  options,
  value,
  onChoose,
}: PickerProps<V>) {
  const wide = useWide()
  const [heldWide, setHeldWide] = useState(wide)
  /** The choice waiting for the close to finish; `null` when the close is no choice. */
  const pending = useRef<{ value: V } | null>(null)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setHeldWide(wide)
  }
  // The Sheet and Dialog suspend it too; held here as well, like every wrapper.
  useSuspendSwipe(open)

  const onClosed = () => {
    const choice = pending.current
    pending.current = null
    if (choice) onChoose(choice.value)
  }
  const choose = (next: V) => {
    // A row tapped during the exit is no choice: it would wait for a close that never comes.
    if (!open) return
    pending.current = next === value ? null : { value: next }
    onOpenChange(false)
  }

  const rows = (
    <ul>
      {options.map((option) => {
        const chosen = option.value === value
        return (
          <li key={option.value}>
            <button
              type="button"
              aria-pressed={chosen}
              onClick={() => choose(option.value)}
              className="flex w-full items-center gap-2 bg-transparent py-2 text-left text-control text-text max-wide:min-h-tap"
            >
              <span
                aria-hidden="true"
                className={chosen ? `${markerSlotClass} bg-accent` : markerSlotClass}
              />
              <span>{option.label}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )

  return heldWide ? (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} onClosed={onClosed}>
      {rows}
    </Dialog>
  ) : (
    <Sheet open={open} onOpenChange={onOpenChange} label={title} onClosed={onClosed}>
      <div className="flex flex-col gap-4">
        <h2 className="text-heading-group ui-case">{title}</h2>
        {rows}
      </div>
    </Sheet>
  )
}
