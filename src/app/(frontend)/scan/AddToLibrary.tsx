'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useTransition } from 'react'

import type { CandidateId } from '@/lib/catalogue/pick'

import { Button } from '../components/Button'
import { ProgressLine } from '../components/ProgressLine'

import { saveCopyAction } from './actions'
import { useAddToLibrary } from './useAddToLibrary'

/**
 * Add to library (EXPERIENCE.md, Answer): saves an owned copy as fetched,
 * raises the held "Saved to {location}" toast with the save's Undo and returns
 * to Scan. A failure is reported and leaves the Answer as it was, except
 * `NOT_FOUND` (R5): no source knows the ISBN any more, or the candidate shown
 * has gone, so the same address is re-rendered on the server with no toast
 * and no new history entry, and the Answer that comes back (Not found, with
 * its manual fields, or the sources' current one) is the message.
 * The press semantics (latch, `requestId`, unmount) are `useAddToLibrary()`'s.
 *
 * `pick` is the source candidate shown and `candidate` its identity, sent so
 * the server builds the Book from that record or, when its outcome no longer
 * has it, answers `NOT_FOUND` and the Answer is rendered again (D-7, AD-11);
 * both left out for a Book that exists.
 *
 * `another` makes it Add another copy on the In library Answer: the same
 * save, toast and return, as a secondary button.
 */
export function AddToLibrary({
  isbn13,
  pick,
  candidate,
  another = false,
}: {
  isbn13: string
  pick?: number
  candidate?: CandidateId
  another?: boolean
}) {
  const t = useTranslations()
  const router = useRouter()
  const { pending, add } = useAddToLibrary()
  const [refreshing, startTransition] = useTransition()

  const press = () =>
    add(
      (requestId) =>
        saveCopyAction({
          requestId,
          isbn13,
          ...(pick !== undefined && { pick }),
          ...(candidate !== undefined && { candidate }),
        }),
      (failure) => {
        if (failure.code !== 'NOT_FOUND') return false
        startTransition(() => {
          router.refresh()
        })
        return true
      },
    )

  const busy = pending || refreshing
  return (
    <>
      {busy && <ProgressLine label={t('progress.loading')} />}
      <Button variant={another ? 'secondary' : 'primary'} onClick={press} disabled={busy}>
        {t(another ? 'answer.addAnotherCopy' : 'answer.addToLibrary')}
      </Button>
    </>
  )
}
