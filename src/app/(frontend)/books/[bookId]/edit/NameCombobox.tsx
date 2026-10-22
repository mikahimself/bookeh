'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import type { Ref } from '@/lib/payload/ref'
import type { SuggestField } from '@/lib/shelf/query'

import { useSuggestions } from '../../../components/suggest'
import { Combobox, type ComboboxOption } from '../../../components/ui/Combobox'

type Props = {
  label: string
  /** Publishers have no records, so no ids to choose by. */
  field: Exclude<SuggestField, 'publisher'>
  /** The name; `''` is none. */
  value: string
  onChange: (name: string) => void
  error?: string
  autoFocus?: boolean
}

/**
 * A name field over `Combobox`: the options are the suggestions for the
 * typed text, and the value is a name, never an id. Every typed change is
 * the name at once, as in a text field, so Base UI's reset on close shows the
 * same text and nothing typed is lost. Choosing a suggestion gives its name,
 * "New: {name}" the typed one, Clear `''`. No row is highlighted until the
 * arrow keys reach one, so Enter keeps the typed name. The name is resolved
 * to a record on save (AD-5).
 */
export function NameCombobox({ label, field, value, onChange, error, autoFocus }: Props) {
  const [text, setText] = useState('')
  const suggestions = useSuggestions(field, text)
  const options = useMemo<ComboboxOption[]>(
    () => suggestions.flatMap(({ id, name }) => (id === null ? [] : [{ id, label: name }])),
    [suggestions],
  )
  const ref = useMemo<Ref | null>(() => (value === '' ? null : { create: value }), [value])

  const box = useRef<HTMLDivElement>(null)
  // On mount only, as `autoFocus` does.
  const focusOnMount = useRef(autoFocus)
  useEffect(() => {
    if (focusOnMount.current) box.current?.querySelector('input')?.focus()
  }, [])

  return (
    <div ref={box}>
      <Combobox
        label={label}
        options={options}
        value={ref}
        error={error}
        autoHighlight={false}
        onInputValueChange={(next) => {
          setText(next)
          onChange(next)
        }}
        onValueChange={(next) => {
          if (next === null) {
            setText('')
            onChange('')
          } else if (typeof next !== 'number') onChange(next.create)
          else {
            const chosen = options.find((option) => option.id === next)
            if (chosen) onChange(chosen.label)
          }
        }}
      />
    </div>
  )
}
