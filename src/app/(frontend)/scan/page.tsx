import { getTranslations } from 'next-intl/server'
import { ViewTransition } from 'react'

import { lookupBook } from '@/lib/catalogue/lookupBook'
import { requireUser } from '@/lib/payload/context'

import { FullScreenTask } from '../components/FullScreenTask'
import { DismissToast } from '../components/toast/DismissToast'
import { RaiseToast } from '../components/toast/RaiseToast'

import { InLibraryAnswer } from './InLibraryAnswer'
import { NotFoundAnswer } from './NotFoundAnswer'
import { NotInLibraryAnswer } from './NotInLibraryAnswer'
import { answerFor, scanParams, type ScanOutcome } from './answer'
import { ScanScreen } from './ScanScreen'

/**
 * Scan and its Answer, a full-screen task. The wrapper sits in the page, not
 * a layout, so it mounts and unmounts with the route: the task slides in on
 * the way in, and away when a push or replace leaves it. A history traversal
 * runs with no view transition, so the X going back slides the task away by
 * hand (navigation.ts); browser Back swaps at once.
 *
 * `?isbn=` is the Answer's address: the lookup runs here, on the server, with
 * the text as typed. An invalid ISBN or the rate limit keeps Scan with the
 * text in the field; so do the Answers still to come (couldn't look it up,
 * on wishlist). An ISBN no source knows opens Not found with it.
 *
 * `?title=` with no `isbn` (or a blank one) is the Not found Answer with no
 * ISBN and the text in its Title field (`scanParams()`).
 */
export default async function ScanPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireUser()
  const t = await getTranslations()
  const { isbn: text, title } = scanParams(await searchParams)
  const outcome: ScanOutcome =
    text !== undefined
      ? await answerFor(text, (isbn) => lookupBook(ctx, { isbn }))
      : title !== undefined
        ? { kind: 'notFound', isbn13: null, title }
        : { kind: 'scan' }

  return (
    <ViewTransition enter="task-enter" exit="task-exit" default="none">
      {outcome.kind === 'scan' ? (
        <FullScreenTask title={t('scan.heading')}>
          <ScanScreen
            isbn={text}
            error={outcome.error === 'INVALID_ISBN' ? t('errors.INVALID_ISBN') : undefined}
          />
          {outcome.error === 'RATE_LIMITED' && (
            // Fresh per render, so a repeated submit raises it again.
            <RaiseToast key={crypto.randomUUID()} input={{ kind: 'error', code: 'RATE_LIMITED' }} />
          )}
        </FullScreenTask>
      ) : (
        <FullScreenTask title={t(`answer.${outcome.kind}`)}>
          {outcome.kind === 'inLibrary' ? (
            <InLibraryAnswer answer={outcome.answer} />
          ) : outcome.kind === 'notInLibrary' ? (
            <NotInLibraryAnswer answer={outcome.answer} />
          ) : (
            <NotFoundAnswer isbn13={outcome.isbn13} title={outcome.title} />
          )}
          {/* The next Answer removes the toast on screen, the held save toast included. */}
          <DismissToast />
        </FullScreenTask>
      )}
    </ViewTransition>
  )
}
