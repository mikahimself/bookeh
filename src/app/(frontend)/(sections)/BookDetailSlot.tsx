'use client'

import { useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'

import { Cover } from '../components/Cover'
import { useWide } from '../components/ui/overlay'

import { BookDetailSheet } from './BookDetailSheet'
import { FooterContext, HostedDetailContext } from './detailHost'
import { useBookOpen, type BookSeed } from './BookOpen'

export type DetailResult =
  | { kind: 'ready'; label: string; content: ReactNode }
  | { kind: 'missing' | 'failed'; content: ReactNode }

/** Always mounted at the page's detail position, inside its action providers.
 * Pending and server content are children of the same addressed Sheet. */
export function BookDetailSlot({
  address,
  back,
  result,
  pinnedActions = false,
}: {
  address: string | null
  back: string
  result: DetailResult | null
  pinnedActions?: boolean
}) {
  const wide = useWide()
  const { pending, cancel, finish } = useBookOpen()
  const [footer, setFooter] = useState<HTMLElement | null>(null)
  if (wide) return result?.content
  const cancelled = pending?.cancelled && (!address || address === pending.href)
  const ready = !cancelled && result?.kind === 'ready'
  const waiting = pending && !pending.finished && (cancelled || pending.href !== address)
  return (
    <>
      {(ready || waiting) && (
        <FooterContext value={footer}>
          <HostedDetailContext value>
            <BookDetailSheet
              key={pending?.id}
              label={ready ? result.label : pending!.seed.title}
              back={back}
              cancelPending={cancel}
              onPendingClosed={finish}
              footer={pinnedActions ? <div ref={setFooter} /> : undefined}
            >
              {ready ? result.content : <PendingDetail seed={pending!.seed} />}
            </BookDetailSheet>
          </HostedDetailContext>
        </FooterContext>
      )}
      {!ready && !waiting && !cancelled && result?.content}
    </>
  )
}

function PendingDetail({ seed }: { seed: BookSeed }) {
  const t = useTranslations('progress')
  return (
    <div role="status" aria-busy="true" aria-label={t('loading')} className="flex flex-col gap-6">
      <div className="flex items-start gap-4">
        <div className="w-cover-header shrink-0">
          <Cover src={seed.coverUrl} title={seed.title} language={seed.language} />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-title break-words text-text">{seed.title}</h2>
          {seed.authors.length > 0 && (
            <p className="flex flex-wrap gap-x-1 gap-y-7 text-meta text-text-muted">
              {seed.authors.map(({ name }, index) => (
                <span key={index}>
                  {name}
                  {index < seed.authors.length - 1 && ','}
                </span>
              ))}
            </p>
          )}
        </div>
      </div>
      <div aria-hidden="true" className="flex flex-col gap-6 book-detail-pulse">
        <div className="h-6 w-2/3 bg-border" />
        <div className="h-4 w-full bg-border" />
        <div className="h-4 w-5/6 bg-border" />
        <div className="h-6 w-1/2 bg-border" />
      </div>
    </div>
  )
}
