'use client'

import { createContext, useContext, useId, useCallback } from 'react'

export const ToastHostsContext = createContext<
  ((id: string, node: HTMLDivElement | null) => void) | null
>(null)

/** Keep the single toast inside the active modal's accessible/focusable tree. */
export function ToastHost() {
  const register = useContext(ToastHostsContext)
  const id = useId()
  const ref = useCallback((node: HTMLDivElement | null) => register?.(id, node), [register, id])
  return <div ref={ref} className="contents" />
}
