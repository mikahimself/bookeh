'use client'

import { useRouter } from 'next/navigation'

import { LookUpAgainLink } from '../(sections)/LookUpAgain'
import { useReportFailure } from '../components/request'

/**
 * The In library Answer's Look it up again, under the Book: a share
 * refreshes the Answer, which then shows the shared Book without the Link; a
 * failure is reported as anywhere outside the collection.
 */
export function AnswerLookUpAgain({ bookId }: { bookId: number }) {
  const router = useRouter()
  const reportFailure = useReportFailure()

  return (
    <div>
      <LookUpAgainLink
        bookId={bookId}
        onSettled={(result) => {
          if (!result.ok) reportFailure(result.code)
          else if (result.data.kind === 'shared') router.refresh()
        }}
      />
    </div>
  )
}
