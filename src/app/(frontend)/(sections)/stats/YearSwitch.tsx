'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useOptimistic, useTransition } from 'react'

import { ProgressLine } from '../../components/ProgressLine'
import { TextSwitch } from '../../components/TextSwitch'

/**
 * EXPERIENCE.md, Stats → Year: a Text switch of `years` (as given, newest
 * first) that replaces the address: `/stats` for `current`, the current
 * year, `/stats?year={year}` otherwise. The tapped year shows as chosen at
 * once (EXPERIENCE.md, Text switch); the progress line runs until the
 * server has rendered it.
 */
export function YearSwitch({
  years,
  year,
  current,
}: {
  years: readonly number[]
  year: number
  current: number
}) {
  const t = useTranslations()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [chosen, setChosen] = useOptimistic(year)

  return (
    <>
      {pending && <ProgressLine label={t('progress.loading')} />}
      <TextSwitch
        label={t('stats.yearSwitch')}
        value={String(chosen)}
        options={years.map((y) => ({ value: String(y), label: String(y) }))}
        onChange={(value) => {
          startTransition(() => {
            setChosen(Number(value))
            router.replace(value === String(current) ? '/stats' : `/stats?year=${value}`, {
              scroll: false,
            })
          })
        }}
      />
    </>
  )
}
