import { getTranslations } from 'next-intl/server'
import { ViewTransition } from 'react'

import { requireUser } from '@/lib/payload/context'

import { FullScreenTask } from '../components/FullScreenTask'

import { ScanScreen } from './ScanScreen'

/**
 * Scan, a full-screen task. The wrapper sits in the page, not a layout, so
 * it mounts and unmounts with the route: the task slides in on the way in,
 * and away when a push or replace leaves it. A history traversal runs with
 * no view transition, so the X going back slides the task away by hand
 * (navigation.ts); browser Back swaps at once. `?isbn=` is the Answer's
 * address (Story 3.45); until then the screen shows the submitted text.
 */
export default async function ScanPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireUser()
  const t = await getTranslations('scan')
  const { isbn } = await searchParams
  const text = Array.isArray(isbn) ? isbn[0] : isbn
  // Go on an empty field is no submission.
  const submitted = text?.trim() ? text : undefined

  return (
    <ViewTransition enter="task-enter" exit="task-exit" default="none">
      <FullScreenTask title={t('heading')}>
        <ScanScreen submitted={submitted} />
      </FullScreenTask>
    </ViewTransition>
  )
}
