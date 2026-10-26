'use client'

import { useSearchParams } from 'next/navigation'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { parseShelfQuery, shelfHref } from '@/lib/shelf/query'

import { useTaskBack } from '../components/navigation'
import { inDialog } from '../components/ui/overlay'

/** `Esc` in the search field clears the search, not the selection. */
const inSearch = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest('[role="search"]') !== null

type SelectionValue = {
  selecting: boolean
  /** The ticked copies' ids (AD-18), in view or not. */
  ticked: ReadonlySet<number>
  /**
   * The ticked copies that were lent (`CopyLine.loan !== null`) when ticked,
   * so ticked copies out of view still count for Remove's dialog. Always a
   * subset of `ticked`.
   */
  lent: ReadonlySet<number>
  start: () => void
  /** Ticks or unticks a copy; `lent` is its loan state at that moment. */
  toggle: (copyId: number, lent: boolean) => void
  done: () => void
  /** Unticks these copies and keeps select mode. */
  untick: (copyIds: readonly number[]) => void
}

const SelectionContext = createContext<SelectionValue | null>(null)

export function useSelection(): SelectionValue {
  const context = useContext(SelectionContext)
  if (!context) throw new Error('useSelection called outside SelectionProvider')
  return context
}

const NONE: ReadonlySet<number> = new Set()
const CLEAR = { ticked: NONE, lent: NONE }

/**
 * EXPERIENCE.md, Select mode: whether the collection is selecting, and the
 * copies ticked. Above `ShelfRowsProvider`, so the selection outlives a new
 * search, filter or sort; it ends with the page. Entering closes Book detail
 * the way its own close does (`BookDetailSheet`): history back to the entry
 * the row pushed from, or, opened directly, the address without `book`,
 * replacing. Done or `Esc`, unless something above already
 * took it or focus is in the search or a dialog (`inDialog`, a safety
 * net), leaves and clears the selection.
 */
export function SelectionProvider({ children }: { children: ReactNode }) {
  const params = useSearchParams()
  const { query, book } = parseShelfQuery(params)
  const closeBook = useTaskBack(shelfHref(query), true)
  const [selecting, setSelecting] = useState(false)
  // One state, so `lent` stays a subset of `ticked` whatever a row says on untick.
  const [{ ticked, lent }, setTicks] = useState(CLEAR)

  const start = useCallback(() => {
    setTicks(CLEAR)
    setSelecting(true)
    if (book !== null) closeBook()
  }, [book, closeBook])

  const toggle = useCallback((copyId: number, isLent: boolean) => {
    setTicks((current) => {
      const ticked = new Set(current.ticked)
      const lent = new Set(current.lent)
      if (ticked.delete(copyId)) lent.delete(copyId)
      else {
        ticked.add(copyId)
        if (isLent) lent.add(copyId)
      }
      return { ticked, lent }
    })
  }, [])

  const done = useCallback(() => {
    setSelecting(false)
    setTicks(CLEAR)
  }, [])

  const untick = useCallback((copyIds: readonly number[]) => {
    const without = (current: ReadonlySet<number>) => {
      const next = new Set(current)
      for (const copyId of copyIds) next.delete(copyId)
      return next
    }
    setTicks((current) => ({ ticked: without(current.ticked), lent: without(current.lent) }))
  }, [])

  useEffect(() => {
    if (!selecting) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        !event.defaultPrevented &&
        !inSearch(event.target) &&
        !inDialog(event.target)
      ) {
        done()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [selecting, done])

  const value = useMemo(
    () => ({ selecting, ticked, lent, start, toggle, done, untick }),
    [selecting, ticked, lent, start, toggle, done, untick],
  )
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>
}
