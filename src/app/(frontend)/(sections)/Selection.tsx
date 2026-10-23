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
  start: () => void
  toggle: (copyId: number) => void
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
  const [ticked, setTicked] = useState(NONE)

  const start = useCallback(() => {
    setTicked(NONE)
    setSelecting(true)
    if (book !== null) closeBook()
  }, [book, closeBook])

  const toggle = useCallback((copyId: number) => {
    setTicked((current) => {
      const next = new Set(current)
      if (!next.delete(copyId)) next.add(copyId)
      return next
    })
  }, [])

  const done = useCallback(() => {
    setSelecting(false)
    setTicked(NONE)
  }, [])

  const untick = useCallback((copyIds: readonly number[]) => {
    setTicked((current) => {
      const next = new Set(current)
      for (const copyId of copyIds) next.delete(copyId)
      return next
    })
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
    () => ({ selecting, ticked, start, toggle, done, untick }),
    [selecting, ticked, start, toggle, done, untick],
  )
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>
}
