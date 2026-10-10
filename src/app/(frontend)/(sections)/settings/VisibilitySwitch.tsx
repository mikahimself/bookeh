'use client'

import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'

import type { User } from '@/payload-types'

import { updateProfileAction } from '../../actions/account'
import { TextSwitch } from '../../components/TextSwitch'
import { settled, useReportFailure } from './report'

type Visibility = User['profileVisibility'] | User['collectionVisibility']

/**
 * One visibility row (FR-4): a visible label above a Text switch. On the
 * profile, saved at once through `updateProfileAction`; the tapped option is
 * marked chosen optimistically and reverts on failure. Nothing else on the
 * page reads the values in Phase 1, so no `router.refresh()`. The generic is
 * the field key, so the initial value and options can only come from that
 * field's tuple.
 */
export function VisibilitySwitch<F extends 'profileVisibility' | 'collectionVisibility'>({
  field,
  label,
  initial,
  options,
}: {
  field: F
  label: string
  initial: User[F]
  options: readonly User[F][]
}) {
  const t = useTranslations('settings')
  const report = useReportFailure()
  const [value, setValue] = useState(initial)
  const [, startTransition] = useTransition()

  const change = (next: User[F]) => {
    const previous = value
    setValue(next)
    startTransition(async () => {
      const result = await settled(updateProfileAction({ [field]: next }))
      if (result.ok) return
      setValue(previous)
      report(result.code)
    })
  }

  return (
    <div className="flex flex-col gap-1">
      <p className="text-label text-text-muted">{label}</p>
      <TextSwitch
        label={label}
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
