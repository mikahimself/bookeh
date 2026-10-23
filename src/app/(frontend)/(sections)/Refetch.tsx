'use client'

import { useFormatter, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

import type { RefetchResult } from '@/lib/catalogue/refetchBook'

import { ActionLink } from '../components/Link'
import { settleAction } from '../components/request'
import { useToast } from '../components/toast/ToastProvider'

import { refetchBookAction } from './actions'
import { useAfterAction } from './ShelfRows'

/**
 * EXPERIENCE.md, Book detail → Re-fetch (mock-up A + 1): the admin's Link on
 * a shared Book, "Re-fetching…" and disabled while the sources run, with the
 * muted hint under it. The result is a success toast without Undo: what was
 * filled and from where, "Nothing to fill." or the sources that did not
 * answer. A fill refreshes Book detail; every result goes to `afterAction`.
 */
export function Refetch({ bookId }: { bookId: number }) {
  const t = useTranslations('detail')
  const sourceLabels = useTranslations('sources')
  const format = useFormatter()
  const router = useRouter()
  const { show } = useToast()
  const afterAction = useAfterAction()
  const [pending, startTransition] = useTransition()

  const label = (id: string) => {
    const key = id as Parameters<typeof sourceLabels>[0]
    return sourceLabels.has(key) ? sourceLabels(key) : id
  }

  const message = (result: RefetchResult): string => {
    if (result.kind === 'nothing') return t('refetchNothing')
    if (result.kind === 'unavailable') {
      const sources = format.list(result.failed.map(label), { type: 'conjunction' })
      return t('refetchNoAnswer', { sources, count: result.failed.length })
    }
    const fields = format.list(
      result.fields.map((field) =>
        field === 'themes' ? t('refetchThemes', { n: result.themes }) : t(`refetchField.${field}`),
      ),
      { type: 'conjunction' },
    )
    return t('refetchFilled', { fields, source: label(result.source) })
  }

  const refetch = () => {
    startTransition(async () => {
      const result = await settleAction(refetchBookAction({ bookId }))
      if (result.ok) show({ kind: 'success', message: message(result.data) })
      afterAction(result)
      if (result.ok && result.data.kind === 'filled') router.refresh()
    })
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <ActionLink disabled={pending} onClick={refetch}>
        {pending ? t('refetching') : t('refetch')}
      </ActionLink>
      <p className="text-meta text-text-muted">{t('refetchHint')}</p>
    </div>
  )
}
