'use client'

import { Combobox as BaseCombobox } from '@base-ui/react/combobox'
import { useLocale, useTranslations } from 'next-intl'
import { useId, useMemo, useState } from 'react'

import type { Ref } from '@/lib/payload/ref'

import { ActionLink } from '../Link'
import { useSuspendSwipe } from '../swipe'
import { fieldClass } from '../TextField'
import { markerSlotClass, optionClass, popupClass } from './classes'

export type ComboboxOption = { id: number; label: string }

export type ComboboxProps = {
  label: string
  options: readonly ComboboxOption[]
  value: Ref | null
  onValueChange: (value: Ref | null) => void
  /** A message for this field; draws the danger underline. */
  error?: string
  disabled?: boolean
  /**
   * Called with the text as the user types it, and with `''` when the text is
   * emptied (Clear, or Base UI's reset on close); never for its other resets.
   */
  onInputValueChange?: (text: string) => void
  /** Highlights the first row as the list opens, so Enter chooses it. */
  autoHighlight?: boolean
  /** Whether the last row offers the typed text as a new name; `false` keeps to the options. */
  create?: boolean
}

/** An option, or the last row that creates one by name. */
type Item = ComboboxOption | { create: string }

const isOption = (item: Item): item is ComboboxOption => 'id' in item
const itemLabel = (item: Item): string => (isOption(item) ? item.label : item.create)
/** Only options are ever marked: a `{ create }` value matches no row. */
const sameOption = (item: Item, value: Item): boolean =>
  isOption(item) && isOption(value) && item.id === value.id

/**
 * DESIGN.md, Combobox: a Text field whose popup, directly under the field
 * and as wide as it, lists the options; the highlighted one has the
 * selection bar, the chosen one the 8px marker. Typing narrows the list
 * ("contains", in the UI locale). While no option is named like the typed
 * text (case-insensitive, accents count), a last row offers it as a new
 * name: choosing it emits `{ create }`, which the owning service resolves;
 * `create={false}` drops that row.
 * Clear, or emptying the text, empties the value. The popup is no overlay:
 * no history entry.
 */
export function Combobox({
  label,
  options,
  value,
  onValueChange,
  error,
  disabled,
  onInputValueChange,
  autoHighlight = true,
  create = true,
}: ComboboxProps) {
  const t = useTranslations('combobox')
  const locale = useLocale()
  const id = useId()
  const errorId = `${id}-error`
  const labelId = `${id}-label`
  const { contains } = BaseCombobox.useFilter({ locale })
  const collator = useMemo(() => new Intl.Collator(locale, { sensitivity: 'accent' }), [locale])

  const selected = useMemo<Item | null>(() => {
    if (value === null) return null
    if (typeof value === 'number') return options.find((option) => option.id === value) ?? null
    return value
  }, [options, value])

  const selectedLabel = selected ? itemLabel(selected) : ''
  const [query, setQuery] = useState(selectedLabel)
  const [open, setOpen] = useState(false)
  // A controlled `inputValue` gets no label sync from Base UI: a new value or
  // option list (undo, refresh, reset) shows its label once the popup is closed.
  const [shownLabel, setShownLabel] = useState(selectedLabel)
  if (!open && selectedLabel !== shownLabel) {
    setShownLabel(selectedLabel)
    setQuery(selectedLabel)
  }
  useSuspendSwipe(open)

  const name = query.trim()
  const offersCreate =
    create && name !== '' && !options.some((option) => collator.compare(option.label, name) === 0)
  const items = useMemo<Item[]>(
    () => (offersCreate ? [...options, { create: name }] : [...options]),
    [options, offersCreate, name],
  )

  return (
    <BaseCombobox.Root<Item>
      id={id}
      items={items}
      value={selected}
      onValueChange={(next) =>
        onValueChange(next === null ? null : isOption(next) ? next.id : { create: next.create })
      }
      inputValue={query}
      onInputValueChange={(text, { reason }) => {
        setQuery(text)
        if (reason === 'input-change' || text === '') onInputValueChange?.(text)
      }}
      open={open}
      onOpenChange={setOpen}
      itemToStringLabel={itemLabel}
      isItemEqualToValue={sameOption}
      filter={(item, text) => !isOption(item) || contains(item, text.trim(), itemLabel)}
      autoHighlight={autoHighlight}
      locale={locale}
      disabled={disabled}
    >
      <div className="flex flex-col gap-1">
        <label id={labelId} htmlFor={id} className="text-label text-text-muted">
          {label}
        </label>
        <div className="flex items-end gap-2">
          <BaseCombobox.Input
            id={id}
            placeholder=" "
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className={fieldClass(Boolean(error))}
          />
          <BaseCombobox.Clear aria-describedby={labelId} render={<ActionLink />}>
            {t('clear')}
          </BaseCombobox.Clear>
        </div>
        {error && (
          <p id={errorId} className="text-meta">
            {error}
          </p>
        )}
      </div>
      <BaseCombobox.Portal>
        <BaseCombobox.Positioner side="bottom" align="start" sideOffset={0}>
          <BaseCombobox.Popup className={`w-(--anchor-width) data-empty:border-0 ${popupClass}`}>
            {/* Always mounted: with an empty list Esc still stops here, not at a sheet around it. */}
            <BaseCombobox.Empty />
            <BaseCombobox.List>
              {(item: Item) =>
                isOption(item) ? (
                  <BaseCombobox.Item key={item.id} value={item} className={optionClass}>
                    {/* Kept mounted as the empty slot; `null` drops Base UI's default tick. */}
                    <BaseCombobox.ItemIndicator
                      keepMounted
                      className={({ selected: chosen }) =>
                        chosen ? `${markerSlotClass} bg-accent` : markerSlotClass
                      }
                    >
                      {null}
                    </BaseCombobox.ItemIndicator>
                    <span>{item.label}</span>
                  </BaseCombobox.Item>
                ) : (
                  <BaseCombobox.Item key="create" value={item} className={optionClass}>
                    <span aria-hidden="true" className={markerSlotClass} />
                    <span>{t('create', { name: item.create })}</span>
                  </BaseCombobox.Item>
                )
              }
            </BaseCombobox.List>
          </BaseCombobox.Popup>
        </BaseCombobox.Positioner>
      </BaseCombobox.Portal>
    </BaseCombobox.Root>
  )
}
