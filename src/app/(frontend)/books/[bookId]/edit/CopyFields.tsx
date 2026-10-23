'use client'

import { useTranslations } from 'next-intl'
import { useId, useMemo, useState } from 'react'

import type { LocationOption } from '@/lib/copies/locations'
import type { Ref } from '@/lib/payload/ref'

import { TextSwitch } from '../../../components/TextSwitch'
import { Combobox } from '../../../components/ui/Combobox'

import type { Draft } from './draft'
import type { SavedCopy } from './savedCopy'

type Status = SavedCopy['status']
export type CopyChange = NonNullable<Draft['copy']>

/** The sparse change from `saved` to the shown status and location; `undefined` for none. */
function changeOf(saved: SavedCopy, status: Status, location: Ref | null): CopyChange | undefined {
  if (status === 'ordered') {
    return saved.status === 'ordered' ? undefined : { id: saved.id, status: 'ordered' }
  }
  if (saved.status === 'ordered') return { id: saved.id, status: 'owned', location }
  // A `{ create }` never equals the saved id.
  return location === saved.location ? undefined : { id: saved.id, location }
}

/**
 * EXPERIENCE.md, Edit book (FR-13, FR-28): the copy's Status switch (owned /
 * ordered) and, while owned, its Location combobox with inline add. `value`
 * is the draft's change, shown over `saved`; every choice hands the sparse
 * change to `onChange` (`undefined` when the shown values are the saved
 * ones). Choosing ordered hides the combobox and keeps the location it
 * showed, so owned again shows it and returns to the saved values. With no
 * locations the combobox is absent; the first location is added in Settings
 * (FR-32, EXPERIENCE.md No locations).
 */
export function CopyFields({
  saved,
  locations,
  value,
  error,
  onChange,
}: {
  saved: SavedCopy
  locations: readonly LocationOption[]
  value: CopyChange | undefined
  /** A message for the location; draws the danger underline. */
  error?: string
  onChange: (copy: CopyChange | undefined) => void
}) {
  const t = useTranslations('editBook')
  const statusLabel = useId()
  const options = useMemo(() => locations.map(({ id, name }) => ({ id, label: name })), [locations])
  // The location while ordered hides it, or one the draft does not carry.
  const [kept, setKept] = useState<Ref | null>(saved.location)
  const status: Status = value?.status ?? saved.status
  const location = value?.location !== undefined ? value.location : kept

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p id={statusLabel} className="text-label text-text-muted">
          {t('status')}
        </p>
        <TextSwitch
          labelledBy={statusLabel}
          value={status}
          options={[
            { value: 'owned', label: t('owned') },
            { value: 'ordered', label: t('ordered') },
          ]}
          onChange={(next) => {
            setKept(location)
            onChange(changeOf(saved, next, location))
          }}
        />
      </div>
      {status === 'owned' && locations.length > 0 && (
        <Combobox
          label={t('location')}
          options={options}
          value={location}
          error={error}
          onValueChange={(next) => {
            setKept(next)
            onChange(changeOf(saved, 'owned', next))
          }}
        />
      )}
    </div>
  )
}
