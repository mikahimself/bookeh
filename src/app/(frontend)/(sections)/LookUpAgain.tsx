'use client'

import { useFormatter, useTranslations } from 'next-intl'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'

import type { CandidateId } from '@/lib/catalogue/pick'
import type { ActionResult } from '@/lib/errors'
import { parseShelfQuery, shelfHref } from '@/lib/shelf/query'

import { lookUpAgainAction, type LookUpAgainOutcome } from '../actions/catalogue'
import { ActionLink } from '../components/Link'
import { settleAction } from '../components/request'
import { useToast } from '../components/toast/ToastProvider'
import { Picker } from '../components/ui/Picker'
import { EditionLabel } from '../scan/EditionPicker'

import { useAfterAction } from './ShelfRows'

type Editions = Extract<LookUpAgainOutcome, { kind: 'editions' }>

/**
 * EXPERIENCE.md, Look it up again (D-8): the Link on the creator's own
 * private Book with an ISBN, "Looking it up…" and disabled while the sources
 * run. Several candidates open the edition Picker, one overlay deep; a row
 * calls again with that candidate, and closing it changes nothing. Every
 * other result is a toast without Undo ("Shared · from {source}", "Still not
 * found." or the sources that did not answer) and goes to `onSettled`, as
 * does a failure.
 */
export function LookUpAgainLink({
  bookId,
  onSettled,
}: {
  bookId: number
  onSettled: (result: ActionResult<LookUpAgainOutcome>) => void
}) {
  const t = useTranslations()
  const sourceLabels = useTranslations('sources')
  const format = useFormatter()
  const { show } = useToast()
  const [pending, startTransition] = useTransition()
  const [editions, setEditions] = useState<Editions | null>(null)
  const [open, setOpen] = useState(false)

  const label = (id: string) => {
    const key = id as Parameters<typeof sourceLabels>[0]
    return sourceLabels.has(key) ? sourceLabels(key) : id
  }

  const message = (data: Exclude<LookUpAgainOutcome, Editions>): string => {
    switch (data.kind) {
      case 'shared':
        return data.source === null
          ? t('toast.shared')
          : t('toast.sharedFrom', { source: label(data.source) })
      case 'none':
        return t('toast.stillNotFound')
      case 'unavailable': {
        const sources = format.list(data.failed.map(label), { type: 'conjunction' })
        return t('toast.noAnswer', { sources, count: data.failed.length })
      }
    }
  }

  const run = (candidate?: CandidateId) => {
    startTransition(async () => {
      const result = await settleAction(
        lookUpAgainAction(candidate ? { bookId, candidate } : { bookId }),
      )
      if (result.ok) {
        const { data } = result
        if (data.kind === 'editions') {
          setEditions(data)
          setOpen(true)
          return
        }
        show({ kind: 'success', message: message(data) })
      }
      onSettled(result)
    })
  }

  return (
    <>
      <ActionLink disabled={pending} onClick={() => run()}>
        {pending ? t('detail.lookingUp') : t('detail.lookUpAgain')}
      </ActionLink>
      {editions && (
        <Picker<number>
          open={open}
          onOpenChange={setOpen}
          title={t('answer.editions')}
          // No row is current: the Book shows its typed values, so every row is a choice.
          value={null}
          onChoose={(index) => {
            const id = editions.ids[index]
            if (id) run(id)
          }}
          options={editions.rows.map((row, index) => ({
            value: index,
            label: <EditionLabel {...row} />,
          }))}
        />
      )}
    </>
  )
}

/**
 * Book detail's Look it up again: every result goes to `afterAction`. A share
 * that merged into the shared Book replaces the address with that Book's;
 * a promote refreshes Book detail in place, as does `NOT_FOUND`.
 */
export function DetailLookUpAgain({ bookId }: { bookId: number }) {
  const router = useRouter()
  const afterAction = useAfterAction()
  const params = useSearchParams()

  return (
    <LookUpAgainLink
      bookId={bookId}
      onSettled={(result) => {
        afterAction(result)
        if (result.ok && result.data.kind === 'shared') {
          const book = result.data.bookId
          if (book === bookId) router.refresh()
          else router.replace(shelfHref(parseShelfQuery(params).query, { book }), { scroll: false })
        } else if (!result.ok && result.code === 'NOT_FOUND') {
          router.refresh()
        }
      }}
    />
  )
}
