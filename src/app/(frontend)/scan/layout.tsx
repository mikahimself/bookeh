import type { ReactNode } from 'react'

import { TaskBase } from '../components/navigation'

import { CameraSession } from './CameraSession'

/**
 * Holds the camera stream for the whole `/scan` segment: a layout persists
 * across search-param changes (Scan → Answer and back), so the stream is
 * requested once per task and stopped when the task closes. For the same
 * reason it records where the task starts in history (`TaskBase`), so the X
 * leaves the whole task from an Answer. The page does `requireUser()`.
 */
export default function ScanLayout({ children }: { children: ReactNode }) {
  return (
    <CameraSession>
      <TaskBase />
      {children}
    </CameraSession>
  )
}
