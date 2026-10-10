'use client'

import { useTranslations } from 'next-intl'
import { useState, useTransition, type KeyboardEvent } from 'react'

import { updateProfileAction } from '../../actions/account'
import { TextField } from '../../components/TextField'
import { settled, useReportFailure } from './report'

/** The service's normalisation, repeated only to tell an unchanged name from a changed one. */
const normalise = (value: string) => value.trim().normalize('NFC')

/**
 * Display name (FR-4): saved when the field loses focus and the normalised
 * value differs from the last saved one; Enter blurs. A blank name shows its
 * message under the field and keeps the typed text; a saved name shows as
 * stored. No toast on success.
 */
export function DisplayNameField({ initial }: { initial: string }) {
  const t = useTranslations('settings')
  const report = useReportFailure()
  const [value, setValue] = useState(initial)
  const [saved, setSaved] = useState(() => normalise(initial))
  const [blank, setBlank] = useState(false)
  const [, startTransition] = useTransition()

  const save = () => {
    setBlank(false)
    if (normalise(value) === saved) return
    const sent = value
    startTransition(async () => {
      const result = await settled(updateProfileAction({ displayName: sent }))
      if (result.ok) {
        const stored = result.data.displayName
        setSaved(stored)
        // Shows the stored form only if nothing was typed while the save ran.
        setValue((current) => (current === sent ? stored : current))
        return
      }
      if (result.code === 'VALIDATION' && result.fields?.displayName) {
        setBlank(true)
        return
      }
      report(result.code)
    })
  }

  const blurOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') event.currentTarget.blur()
  }

  return (
    <TextField
      label={t('displayName')}
      name="displayName"
      autoComplete="nickname"
      enterKeyHint="done"
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={save}
      onKeyDown={blurOnEnter}
      error={blank ? t('displayNameRequired') : undefined}
    />
  )
}
