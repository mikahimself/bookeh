'use client'

import { useRouter } from 'next/navigation'
import { useFormatter, useTranslations } from 'next-intl'
import { useTransition } from 'react'

import { ActionLink } from '../components/Link'
import { ProgressLine } from '../components/ProgressLine'
import { settleAction, useReportFailure } from '../components/request'
import { useToast } from '../components/toast/ToastProvider'

import { retryLookupAction } from './actions'

/**
 * EXPERIENCE.md, Answer, A source didn't answer (mock-up C): `text`, then the
 * Try {sources} again Link on the same line. A plain refresh would read the
 * held outcome, so the Link asks the sources past it first and then renders
 * the Answer again, the progress line running throughout. Sources that still
 * failed are named in a toast. A refused retry toasts and leaves the Answer as
 * it is.
 */
export function PartialLookupLine({
  isbn13,
  text,
  tryLabel,
}: {
  isbn13: string
  text: string
  tryLabel: string
}) {
  const t = useTranslations()
  const router = useRouter()
  const reportFailure = useReportFailure()
  const sourceLabels = useTranslations('sources')
  const format = useFormatter()
  const { show } = useToast()
  const [pending, startTransition] = useTransition()

  const label = (id: string) => {
    const key = id as Parameters<typeof sourceLabels>[0]
    return sourceLabels.has(key) ? sourceLabels(key) : id
  }

  const retry = () => {
    startTransition(async () => {
      const result = await settleAction(retryLookupAction({ isbn13 }))
      if (!result.ok) {
        reportFailure(result.code)
        return
      }
      if (result.data.length > 0) {
        const sources = format.list(result.data.map(label), { type: 'conjunction' })
        show({
          kind: 'success',
          message: t('toast.noAnswer', { sources, count: result.data.length }),
        })
      }
      startTransition(() => {
        router.refresh()
      })
    })
  }

  return (
    <>
      {pending && <ProgressLine label={t('progress.loading')} />}
      <p className="text-meta text-text-muted">
        {text}{' '}
        <ActionLink onClick={retry} disabled={pending}>
          {tryLabel}
        </ActionLink>
      </p>
    </>
  )
}
