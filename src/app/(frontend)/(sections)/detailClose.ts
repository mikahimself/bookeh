import { createContext, useContext } from 'react'

/**
 * Book detail's close, provided by its frame: the sheet's animated close, or
 * the panel's leave. With `to`, the close lands on `to` as a sheet Filter
 * chip does (history back, then a replace of the entry reached), so the list
 * there renders fresh from the server; without it, it leaves as X does.
 */
export const DetailCloseContext = createContext<((to?: string) => void) | null>(null)

/**
 * Closes Book detail as its X does, or, with `to`, lands on `to` (an opened
 * entry's Bought, Ordered or Remove: the list without the entry). Only inside
 * a frame (`BookDetailFrame`).
 */
export function useCloseDetail(): (to?: string) => void {
  const close = useContext(DetailCloseContext)
  if (!close) throw new Error('useCloseDetail called outside Book detail')
  return close
}
