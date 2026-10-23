'use client'

import { useRef, useState, type ReactNode } from 'react'

import { Button } from '../Button'
import { useSuspendSwipe } from '../swipe'
import { TextField } from '../TextField'
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
  /**
   * A field under the rows that names a value by typing it (Move: the
   * location of that name, created when none matches): `label` names the
   * field, `submit` its Button. `onCreate` gets the value as typed and runs
   * after the close, as `onChoose` does.
   */
  create?: { label: string; submit: string; onCreate: (name: string) => void }
}

type Choice<V> = { value: V } | { create: string }

/**
 * DESIGN.md, Picker: the Bottom sheet on the phone, the Dialog on wide
 * screens, holding one choice from a short list; the chosen row has the 8px
 * marker. One tap chooses and closes; the chosen row, Back, X or Cancel
 * close without a choice. The form is taken at each open and kept until the
 * close, so a resize never swaps the overlay while it is open. With `create`,
 * a field and a secondary Button under the rows: a value blank after
 * trimming does nothing (the Button is disabled), any other closes and is
 * the choice. The field starts empty at each open.
 */
export function Picker<V extends string | number>({
  open,
  onOpenChange,
  title,
  options,
  value,
  onChoose,
  create,
}: PickerProps<V>) {
  const wide = useWide()
  const [heldWide, setHeldWide] = useState(wide)
  /** The choice waiting for the close to finish; `null` when the close is no choice. */
  const pending = useRef<Choice<V> | null>(null)
  const [name, setName] = useState('')
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setHeldWide(wide)
      setName('')
    }
  }
  // The Sheet and Dialog suspend it too; held here as well, like every wrapper.
  useSuspendSwipe(open)

  const onClosed = () => {
    const choice = pending.current
    pending.current = null
    if (!choice) return
    if ('value' in choice) onChoose(choice.value)
    else create?.onCreate(choice.create)
  }
  const choose = (next: V) => {
    // A row tapped during the exit is no choice: it would wait for a close that never comes.
    if (!open) return
    pending.current = next === value ? null : { value: next }
    onOpenChange(false)
  }
  const submit = () => {
    if (!open || name.trim() === '') return
    pending.current = { create: name }
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
  const body = create ? (
    <div className="flex flex-col gap-4">
      {rows}
      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <div className="min-w-0 flex-1">
          <TextField
            label={create.label}
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="off"
          />
        </div>
        <Button type="submit" variant="secondary" disabled={name.trim() === ''}>
          {create.submit}
        </Button>
      </form>
    </div>
  ) : (
    rows
  )

  return heldWide ? (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} onClosed={onClosed}>
      {body}
    </Dialog>
  ) : (
    <Sheet open={open} onOpenChange={onOpenChange} label={title} onClosed={onClosed}>
      <div className="flex flex-col gap-4">
        <h2 className="text-heading-group ui-case">{title}</h2>
        {body}
      </div>
    </Sheet>
  )
}
