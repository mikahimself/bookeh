'use client'

import { useTranslations } from 'next-intl'
import { useId } from 'react'

import type { User } from '@/payload-types'

import { updateProfileAction } from '../../actions/account'
import { TextSwitch } from '../../components/TextSwitch'
import { useSavedSwitch } from '../../components/useSavedSwitch'

type Visibility = User['profileVisibility'] | User['collectionVisibility']

/**
 * One visibility row (FR-4): a visible label above a Text switch, the group
 * named by that label and the Visibility heading (`headingId`), so it is not
 * just "Profile" beside the Profile heading. On the profile, saved at once
 * through `updateProfileAction` (`useSavedSwitch`). Nothing else on the
 * page reads the values in Phase 1, so no `router.refresh()`. The generic is
 * the field key, so the initial value and options can only come from that
 * field's tuple.
 */
export function VisibilitySwitch<F extends 'profileVisibility' | 'collectionVisibility'>({
  field,
  label,
  headingId,
  initial,
  options,
}: {
  field: F
  label: string
  headingId: string
  initial: User[F]
  options: readonly User[F][]
}) {
  const t = useTranslations('settings')
  const labelId = useId()
  const [value, change] = useSavedSwitch(initial, (next) => updateProfileAction({ [field]: next }))

  return (
    <div className="flex flex-col gap-1">
      <p id={labelId} className="text-label text-text-muted">
        {label}
      </p>
      <TextSwitch
        labelledBy={`${labelId} ${headingId}`}
        value={value}
        options={options.map((option) => ({
          value: option,
          // Widening only: next-intl's typed key cannot take the generic.
          label: t(`visibilities.${option as Visibility}`),
        }))}
        onChange={change}
      />
    </div>
  )
}
