'use client'

import { useTranslations } from 'next-intl'
import { useMemo, useRef, useState, useTransition } from 'react'

import type { LocationOption } from '@/lib/copies/locations'
import type { Ref } from '@/lib/payload/ref'

import type { DefaultLocationAnswer } from '../../actions/account'
import { setDefaultLocationAction } from '../../actions/account'
import { Combobox } from '../../components/ui/Combobox'
import { settleAction, useReportFailure } from '../../components/request'

/**
 * The default location row (FR-4, UX-DR50): a Combobox over the user's
 * locations, saved at once through `setDefaultLocationAction`. Choosing,
 * creating by name or clearing shows optimistically (a `{ create }` shows
 * its name); the answer replaces both the value and the options, so a
 * created location becomes a marked option. Only the latest call's answer
 * is applied; on its failure the field returns to the last stored value and
 * reports. No `router.refresh()`.
 */
export function DefaultLocationField({
  initial,
  locations,
}: {
  initial: number | null
  locations: readonly LocationOption[]
}) {
  const t = useTranslations('settings')
  const report = useReportFailure()
  const [value, setValue] = useState<Ref | null>(initial)
  const [list, setList] = useState(locations)
  const [, startTransition] = useTransition()
  const latest = useRef(0)
  // What the server last answered, from any call: the value a failure returns to.
  const stored = useRef<DefaultLocationAnswer>({
    defaultLocation: initial,
    locations: [...locations],
  })

  const options = useMemo(() => list.map(({ id, name }) => ({ id, label: name })), [list])

  const change = (next: Ref | null) => {
    const call = ++latest.current
    setValue(next)
    startTransition(async () => {
      const result = await settleAction(setDefaultLocationAction(next))
      if (result.ok) stored.current = result.data
      if (call !== latest.current) return
      setValue(stored.current.defaultLocation)
      setList(stored.current.locations)
      if (!result.ok) report(result.code)
    })
  }

  return (
    <Combobox
      label={t('defaultLocationLabel')}
      options={options}
      value={value}
      onValueChange={change}
    />
  )
}
