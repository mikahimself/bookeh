'use client'

import { useTranslations } from 'next-intl'
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'

import { Button } from '../Button'
import { useSuspendSwipe } from '../swipe'
import { TextField } from '../TextField'
import { markerSlotClass, pickerRowClass } from './classes'
import { Dialog } from './Dialog'
import { useWide } from './overlay'
import { Sheet } from './Sheet'

export type PickerOption<V extends string | number> = { value: V; label: ReactNode }

export type PickerProps<V extends string | number> = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** A typed name inside it keeps its case: wrap it in `normal-case` (DESIGN.md, Lowercase). */
  title: ReactNode
  /** A line under the title (Add to wishlist: the Book's title, muted). */
  description?: ReactNode
  options: readonly PickerOption<V>[]
  value: V | null
  /** Runs once the picker's history entry is gone, so a navigation lands on the entry before it. */
  onChoose: (value: V) => void
  /**
   * A field under the rows that names a value by typing it (Move: the
   * location of that name, created when none matches): `label` names the
   * field, `submit` its Button, `maxLength` the field's limit. `onCreate`
   * gets the value as typed and runs after the close, as `onChoose` does.
   */
  create?: {
    label: string
    submit: string
    maxLength?: number
    onCreate: (name: string) => void
  }
}

/**
 * The two-step mode: a copy list shown in the frame until a copy is chosen,
 * then the caller's own step with a Back control first. Provided around the
 * step's Picker or `PickerFrame`, which read it; they take no props for it.
 */
export type PickerLead = {
  title: ReactNode
  description?: ReactNode
  /** The list, shown while `chosen` is false (`PickerRows`). */
  content: ReactNode
  chosen: boolean
  onBack: () => void
}

export const PickerLeadContext = createContext<PickerLead | null>(null)

export type PickerFrameProps = Pick<PickerProps<string>, 'open' | 'onOpenChange' | 'title'> & {
  description?: ReactNode
  /** Runs once per close, after the overlay's history entry is gone. */
  onClosed?: () => void
  /** The element focused on open, in place of the overlay's default. */
  initialFocus?: RefObject<HTMLElement | null>
  /**
   * The confirming Button, last in both forms: the Dialog's foot, the sheet's
   * foot at full width. It sits outside `children`, so a submitting one needs
   * `form="<id>"`.
   */
  confirm?: ReactNode
  children: ReactNode
}

/**
 * The overlay a Picker sits in: the Bottom sheet on the phone, the Dialog on
 * wide screens. The form is taken at each open and kept until the close, so
 * a resize never swaps the overlay while it is open. `description` goes under
 * the title in the sheet and first in the dialog's body. What waits for the
 * close is the caller's, through `onClosed`.
 */
export function PickerFrame({
  open,
  onOpenChange,
  title,
  description,
  onClosed,
  initialFocus,
  confirm,
  children,
}: PickerFrameProps) {
  const wide = useWide()
  const t = useTranslations('overlay')
  const lead = useContext(PickerLeadContext)
  const listed = lead !== null && !lead.chosen
  const pane = useRef<HTMLDivElement>(null)
  const stage = useRef(listed)
  // Focus follows a stage change (choose, Back), not the first mount.
  useEffect(() => {
    if (stage.current === listed) return
    stage.current = listed
    const root = pane.current
    if (!root) return
    const control =
      root.querySelector<HTMLElement>('input, button:not([data-picker-back]), a[href]') ??
      root.querySelector<HTMLElement>('[data-picker-back]')
    control?.focus()
  }, [listed])
  const titleId = useId()
  const [heldWide, setHeldWide] = useState(wide)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setHeldWide(wide)
  }
  // The Sheet and Dialog suspend it too; held here as well, like every wrapper.
  useSuspendSwipe(open)

  if (lead) {
    if (listed) {
      title = lead.title
      description = lead.description
      confirm = undefined
    }
    children = (
      <div ref={pane} className="flex flex-col gap-4">
        {!listed && (
          <div>
            <Button variant="secondary" data-picker-back="" onClick={lead.onBack}>
              {t('back')}
            </Button>
          </div>
        )}
        {listed ? lead.content : children}
      </div>
    )
  }

  return heldWide ? (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      onClosed={onClosed}
      initialFocus={initialFocus}
      confirm={confirm}
    >
      {description != null ? (
        <div className="flex flex-col gap-4">
          {description}
          {children}
        </div>
      ) : (
        children
      )}
    </Dialog>
  ) : (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      labelledBy={titleId}
      onClosed={onClosed}
      initialFocus={initialFocus}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id={titleId} className="text-heading-group ui-case">
            {title}
          </h2>
          {description}
        </div>
        {children}
        {confirm}
      </div>
    </Sheet>
  )
}

/** The rows of a Picker: one button each, the chosen one with the 8px marker. */
export function PickerRows<V extends string | number>({
  options,
  value,
  onChoose,
}: {
  options: readonly PickerOption<V>[]
  value: V | null
  onChoose: (value: V) => void
}) {
  return (
    <ul>
      {options.map((option) => {
        const chosen = option.value === value
        return (
          <li key={option.value}>
            <button
              type="button"
              aria-pressed={chosen}
              onClick={() => onChoose(option.value)}
              className={pickerRowClass}
            >
              <span
                aria-hidden="true"
                className={chosen ? `${markerSlotClass} bg-accent` : markerSlotClass}
              />
              <span className="min-w-0 flex-1">{option.label}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

type Choice<V> = { value: V } | { create: string }

/**
 * DESIGN.md, Picker: the Bottom sheet on the phone, the Dialog on wide
 * screens, holding one choice from a short list; the chosen row has the 8px
 * marker. One tap chooses and closes; the chosen row, Back, X or Cancel
 * close without a choice. `PickerFrame` holds the overlay. With `create`, a
 * field and a secondary Button under the rows: a value blank after
 * trimming does nothing (the Button is disabled), any other closes and is
 * the choice. The field starts empty at each open, and with no rows it has
 * the focus on open.
 */
export function Picker<V extends string | number>({
  open,
  onOpenChange,
  title,
  description,
  options,
  value,
  onChoose,
  create,
}: PickerProps<V>) {
  /** The choice waiting for the close to finish; `null` when the close is no choice. */
  const pending = useRef<Choice<V> | null>(null)
  const [name, setName] = useState('')
  const field = useRef<HTMLInputElement>(null)
  // With nothing to choose from, the field is the picker.
  const initialFocus = create && options.length === 0 ? field : undefined
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setName('')
  }

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

  const rows = <PickerRows options={options} value={value} onChoose={choose} />
  const body = create ? (
    <div className="flex flex-col gap-4">
      {rows}
      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          // React events cross the portal: a form around the picker's caller (Not found) is not this one.
          event.stopPropagation()
          submit()
        }}
      >
        <div className="min-w-0 flex-1">
          <TextField
            ref={field}
            label={create.label}
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={create.maxLength}
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

  return (
    <PickerFrame
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      onClosed={onClosed}
      initialFocus={initialFocus}
    >
      {body}
    </PickerFrame>
  )
}
