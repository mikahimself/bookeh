'use client'

import { useTranslations } from 'next-intl'

import { Button } from '../components/Button'
import { ProgressLine } from '../components/ProgressLine'

import { saveCopyAction } from './actions'
import { useAddToLibrary } from './useAddToLibrary'

/**
 * Add to library (EXPERIENCE.md, Answer): saves an owned copy as fetched,
 * raises the held "Saved to {location}" toast with the save's Undo and returns
 * to Scan. A failure is reported and leaves the Answer as it was. The press
 * semantics (latch, `requestId`, unmount) are `useAddToLibrary()`'s.
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
  const { pending, add } = useAddToLibrary()

  return (
    <>
      {pending && <ProgressLine label={t('progress.loading')} />}
      <Button
        variant={another ? 'secondary' : 'primary'}
        onClick={() =>
          add((requestId) =>
            saveCopyAction({ requestId, isbn13, ...(pick !== undefined && { pick }) }),
          )
        }
        disabled={pending}
      >
        {t(another ? 'answer.addAnotherCopy' : 'answer.addToLibrary')}
      </Button>
    </>
  )
}
