'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { useTaskBack } from '../components/navigation'
import { Sheet } from '../components/ui/Sheet'

import { DetailCloseContext } from './detailClose'

/**
 * Book detail on the phone (EXPERIENCE.md, Book detail): a bottom sheet over
 * the dimmed list. `?book=` is the open state, so the sheet is `addressed`:
 * it opens on mount, sliding up, and X, Esc, the scrim or a drag down close
 * it, then leave the address: history back to the entry the row pushed from,
 * or, opened directly, the section without `book` (`back`), replacing. The
 * browser's Back removes `book` itself and the page drops the sheet.
 *
 * A Filter chip inside closes it the same way and lands on the chip's
 * address instead (`useSheetChip`): the leave goes back, then replaces the
 * entry it reached, so Back afterwards reopens neither the Book nor the
 * unfiltered list. `useCloseDetail(to)` lands the same way (an opened
 * entry's Bought, Ordered or Remove: the replace renders the list afresh,
 * where a history restore would show the cached one with the entry).
 */
export function BookDetailSheet({
  label,
  back,
  children,
}: {
  label: string
  back: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const leave = useTaskBack(back, true)
  /**
   * Where a chip or `useCloseDetail(to)` asked the close to land; `undefined`
   * for X, Esc, the scrim, a drag or `useCloseDetail()`.
   */
  const landing = useRef<string | undefined>(undefined)
  const chip = useCallback((href: string) => {
    landing.current = href
    setOpen(false)
  }, [])
  /**
   * `useCloseDetail()`: as X does, landing on the collection without `book`;
   * with `to`, as a chip does, landing on `to`.
   */
  const close = useCallback((to?: string) => {
    landing.current = to
    setOpen(false)
  }, [])

  // Mounted open, Base UI would show the sheet without sliding it up.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setOpen(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <Sheet
      addressed
      open={open}
      onOpenChange={setOpen}
      label={label}
      onClosed={() => leave(landing.current)}
    >
      <DetailCloseContext value={close}>
        <SheetChipContext value={chip}>{children}</SheetChipContext>
      </DetailCloseContext>
    </Sheet>
  )
}

const SheetChipContext = createContext<((href: string) => void) | null>(null)

/**
 * Inside the phone's Book detail: closes the sheet and lands on `href`, the
 * collection without `book`. `null` anywhere else (the wide panel).
 */
export function useSheetChip(): ((href: string) => void) | null {
  return useContext(SheetChipContext)
}
