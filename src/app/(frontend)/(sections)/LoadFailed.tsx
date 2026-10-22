'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useTransition } from 'react'

import { ActionLink } from '../components/Link'
import { ProgressLine } from '../components/ProgressLine'

/**
 * EXPERIENCE.md, Load failed: "Couldn't load." with a Try again Link that
 * renders the same address again on the server, the progress line running
 * meanwhile.
 */
export function LoadFailed() {
  const t = useTranslations()
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <div className="flex flex-wrap items-baseline gap-2 py-4 text-body">
      {pending && <ProgressLine label={t('progress.loading')} />}
      <p>{t('collection.loadFailed')}</p>
      <ActionLink
        disabled={pending}
        onClick={() => {
          startTransition(() => {
            router.refresh()
          })
        }}
      >
        {t('collection.tryAgain')}
      </ActionLink>
    </div>
  )
}
