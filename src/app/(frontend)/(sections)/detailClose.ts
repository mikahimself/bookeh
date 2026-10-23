import { createContext, useContext } from 'react'

/** Book detail's close, provided by its frame: the sheet's animated close, or the panel's leave. */
export const DetailCloseContext = createContext<(() => void) | null>(null)

/** Closes Book detail as its X does. Only inside a frame (`BookDetailFrame`). */
export function useCloseDetail(): () => void {
  const close = useContext(DetailCloseContext)
  if (!close) throw new Error('useCloseDetail called outside Book detail')
  return close
}
