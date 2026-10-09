import { getTranslations } from 'next-intl/server'
import { ViewTransition } from 'react'

import { requireUser } from '@/lib/payload/context'

import { FullScreenTask } from '../components/FullScreenTask'

/**
 * Scan, a full-screen task. Its content arrives in Epic 3. The wrapper sits
 * in the page, not a layout, so it mounts and unmounts with the route: the
 * task slides in on the way in, and away when a push or replace leaves it.
 * A history traversal runs with no view transition, so the X going back
 * slides the task away by hand (navigation.ts); browser Back swaps at once.
 */
export default async function ScanPage() {
  await requireUser()
  const t = await getTranslations('scan')

  return (
    <ViewTransition enter="task-enter" exit="task-exit" default="none">
      <FullScreenTask title={t('heading')} />
    </ViewTransition>
  )
}
