import type { ReactNode } from 'react'

import { TaskBase } from '../../../components/navigation'

/**
 * Records where Edit book starts in history (`TaskBase`): the Back guard's
 * entry sits above it while there are unsaved changes, so Save and Discard
 * leave the whole task rather than step back onto it. The page does
 * `requireUser()`.
 */
export default function EditBookLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <TaskBase />
      {children}
    </>
  )
}
