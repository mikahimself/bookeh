'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useMemo, useState, useTransition } from 'react'

import type { Named } from '@/lib/books/effectiveBook'
import type { Ref } from '@/lib/payload/ref'

import { setEntryRecipientAction } from '../../../actions/wishlists'
import { settleAction, useReportFailure } from '../../../components/request'
import { Combobox } from '../../../components/ui/Combobox'

/**
 * The opened entry's "For" (EXPERIENCE.md, Wishlists → Entry opened; FR-38):
 * a Combobox of the viewer's People that saves at once. Choosing a Person,
 * a new name ("New: …") or Clear shows at once and sends it; on success the
 * chosen value stays and the page refreshes, so the row's "For" line and the
 * options follow, and a new `initial` from the refresh is adopted. A failure
 * restores the previous value: a bad name shows under the field, a gone entry
 * refreshes into "Not on this list", anything else is reported. No Undo, no
 * toast.
 */
export function EntryFor({
  entryId,
  people,
  initial,
}: {
  entryId: number
  people: Named[]
  initial: number | null
}) {
  const t = useTranslations()
  const router = useRouter()
  const report = useReportFailure()
  const [value, setValue] = useState<Ref | null>(initial)
  const [seen, setSeen] = useState(initial)
  if (initial !== seen) {
    setSeen(initial)
    setValue(initial)
  }
  const [error, setError] = useState<string | undefined>(undefined)
  const [, startTransition] = useTransition()
  const options = useMemo(() => people.map(({ id, name }) => ({ id, label: name })), [people])

  const change = (next: Ref | null) => {
    const previous = value
    setValue(next)
    setError(undefined)
    startTransition(async () => {
      const result = await settleAction(setEntryRecipientAction(entryId, next))
      if (result.ok) {
        router.refresh()
        return
      }
      setValue(previous)
      const onPerson = result.fields?.person
      if (onPerson !== undefined) {
        setError(onPerson === 'TOO_LONG' ? t('errors.TOO_LONG') : t('errors.VALIDATION'))
      } else if (result.code === 'NOT_FOUND') {
        router.refresh()
      } else {
        report(result.code)
      }
    })
  }

  return (
    <Combobox
      label={t('wishlists.for')}
      options={options}
      value={value}
      onValueChange={change}
      error={error}
    />
  )
}
