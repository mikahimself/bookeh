'use client'

import { useEffect } from 'react'

import type { ToastInput } from './store'
import { useToast } from './ToastProvider'

/**
 * Shows `input` once on mount: a toast decided by a server render whose
 * address changes only its query, where the flash cookie cannot reach the
 * provider (Story 3.45, Design Notes). The caller keys it per render, so a
 * repeated outcome raises it again. Renders nothing.
 */
export function RaiseToast({ input }: { input: ToastInput }) {
  const { show } = useToast()

  useEffect(() => show(input), [show, input])

  return null
}
