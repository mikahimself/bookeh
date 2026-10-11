import type { ReactNode } from 'react'

import { CameraSession } from './CameraSession'

/**
 * Holds the camera stream for the whole `/scan` segment: a layout persists
 * across search-param changes (Scan → Answer and back), so the stream is
 * requested once per task and stopped when the task closes. The page does
 * `requireUser()`.
 */
export default function ScanLayout({ children }: { children: ReactNode }) {
  return <CameraSession>{children}</CameraSession>
}
