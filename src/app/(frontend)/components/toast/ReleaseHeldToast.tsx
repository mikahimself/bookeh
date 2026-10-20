'use client'

import { useEffect } from 'react'

import { useToast } from './ToastProvider'

/**
 * Gives a held toast the usual timer when it unmounts: the save toast stays on
 * Scan until the next Answer opens, and leaving the scan task (X) makes it an
 * ordinary 8-second toast on the section (EXPERIENCE.md, Toast). Renders
 * nothing.
 */
export function ReleaseHeldToast() {
  const { release } = useToast()

  useEffect(() => release, [release])

  return null
}
