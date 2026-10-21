'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useTransition } from 'react'

import { Button } from '../components/Button'
import { ProgressLine } from '../components/ProgressLine'

import { saveCopyAction } from './actions'
import { useAddToLibrary } from './useAddToLibrary'

/**
 * Add to library (EXPERIENCE.md, Answer): saves an owned copy as fetched,
 * raises the held "Saved to {location}" toast with the save's Undo and returns
 * to Scan. A failure is reported and leaves the Answer as it was, except
 * `NOT_FOUND` (R5): no source knows the ISBN any more, so the same address is
 * re-rendered on the server with no toast and no new history entry, and the
 * Answer that comes back (Not found, with its manual fields) is the message.
 * The press semantics (latch, `requestId`, unmount) are `useAddToLibrary()`'s.
 *
 * `pick` is the source candidate shown, sent so the server builds the Book
 * from it (D-7); left out for a Book that exists.
 *
 * `another` makes it Add another copy on the In library Answer: the same
 * save, toast and return, as a secondary button.
 */
export function AddToLibrary({
  isbn13,
  pick,
  another = false,
}: {
  isbn13: string
  pick?: number
  another?: boolean
}) {
  const t = useTranslations()
  const router = useRouter()
  const { pending, add } = useAddToLibrary()
  const [refreshing, startTransition] = useTransition()

  const press = () =>
    add(
      (requestId) => saveCopyAction({ requestId, isbn13, ...(pick !== undefined && { pick }) }),
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
