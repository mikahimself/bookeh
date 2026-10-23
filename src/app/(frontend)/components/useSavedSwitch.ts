'use client'

import { useRef, useState, useTransition } from 'react'

import type { ActionResult } from '@/lib/errors'

import { settleAction, useReportFailure } from './request'
import { useToast } from './toast/ToastProvider'

/**
 * A switch saved at once (Theme, Language, Visibility; the collection's
 * Layout and Size). The tapped value shows while any call is in flight; when
 * the last one settles, the switch shows the stored value: the newest call's
 * success, or `initial`. Only the latest call's failure is reported. A
 * success newer than the call that raised this switch's error toast
 * withdraws that toast, and only that one.
 */
export function useSavedSwitch<V>(
  initial: V,
  save: (value: V) => Promise<ActionResult<unknown>>,
  onSaved?: () => void,
): [V, (next: V) => void] {
  const report = useReportFailure()
  const { withdraw } = useToast()
  const [value, setValue] = useState(initial)
  const [, startTransition] = useTransition()
  const latest = useRef(0)
  const inFlight = useRef(0)
  const stored = useRef({ value: initial, call: 0 })
  const raised = useRef<{ toast: number; call: number } | null>(null)

  const change = (next: V) => {
    const call = ++latest.current
    inFlight.current++
    setValue(next)
    startTransition(async () => {
      const result = await settleAction(save(next))
      inFlight.current--
      if (result.ok) {
        if (call > stored.current.call) stored.current = { value: next, call }
        if (raised.current && call > raised.current.call) {
          withdraw(raised.current.toast)
          raised.current = null
        }
        onSaved?.()
      } else if (call === latest.current) {
        const toast = report(result.code)
        raised.current = toast === null ? null : { toast, call }
      }
      if (inFlight.current === 0) setValue(stored.current.value)
    })
  }

  return [value, change]
}
