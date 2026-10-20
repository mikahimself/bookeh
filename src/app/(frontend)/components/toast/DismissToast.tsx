'use client'

import { useEffect } from 'react'

import { useToast } from './ToastProvider'

/**
 * Dismisses the toast once on mount: the held save toast raised on Scan
 * stays until the next Answer opens (EXPERIENCE.md, Feedback). Renders
 * nothing.
 */
export function DismissToast() {
  const { dismiss } = useToast()

  useEffect(() => dismiss(), [dismiss])

  return null
}
