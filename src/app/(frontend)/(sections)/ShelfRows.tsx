'use client'

import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from 'react'

import type { ActionResult } from '@/lib/errors'
import {
  SHELF_MAX_ROWS,
  SHELF_PAGE_SIZE,
  shelfHref,
  shelfRowsPath,
  type ShelfQuery,
  type ShelfRange,
  type ShelfRows,
} from '@/lib/shelf/query'

import { fetchData, useReportFailure } from '../components/request'
import { useToast } from '../components/toast/ToastProvider'

import { readPlace, writePlace } from './shelfPlace'

type ShelfRowsValue = {
  shelf: ShelfRows
  /** A request that still counts is in flight: the progress line runs. */
  loading: boolean
  /** The next `SHELF_PAGE_SIZE` rows, unless all are held or a request is in flight. */
  loadMore: () => void
}

const ShelfRowsContext = createContext<ShelfRowsValue | null>(null)

export function useShelfRows(): ShelfRowsValue {
  const context = useContext(ShelfRowsContext)
  if (!context) throw new Error('useShelfRows called outside ShelfRowsProvider')
  return context
}

type ShelfActionsValue = {
  /** Returns the error toast it raised, if any, so a later success can withdraw it. */
  afterAction: (result: ActionResult<unknown>) => number | null
  /** The mounted rows' reload, resolving once the rows answered; returns the unregister. */
  register: (reload: () => Promise<void>) => () => void
}

const ShelfActionsContext = createContext<ShelfActionsValue | null>(null)

function useShelfActions(): ShelfActionsValue {
  const context = useContext(ShelfActionsContext)
  if (!context) throw new Error('useShelfActions called outside ShelfActionsProvider')
  return context
}

/** What an action on the collection reports: a reload, or "Not in library" and a reload. */
export function useAfterAction(): ShelfActionsValue['afterAction'] {
  return useShelfActions().afterAction
}

/**
 * Spine, AD-7: `afterAction` above the list, unkeyed, so the action bar and
 * Book detail reach it and it outlives a query change. `ok` reloads the
 * mounted rows, `NOT_FOUND` shows "Not in library" and then reloads, any
 * other code goes to `reportFailure`. Once the reload has answered (or at
 * once, with no rows mounted after Load failed) the server render is
 * refreshed in a transition, so the Filter panel's values, Book detail and
 * the cached first page follow the write; the list never shows a page older
 * than its rows. A toast Undo is not an action: it reloads through `onUndone`
 * and `ReadAndRating` refreshes for it (on `/loans`, `RefreshOnUndo` too).
 */
export function ShelfActionsProvider({ children }: { children: ReactNode }) {
  const t = useTranslations('answer')
  const { show } = useToast()
  const reportFailure = useReportFailure()
  const router = useRouter()
  const [, startTransition] = useTransition()
  const reload = useRef<(() => Promise<void>) | null>(null)

  const register = useCallback((next: () => Promise<void>) => {
    reload.current = next
    return () => {
      if (reload.current === next) reload.current = null
    }
  }, [])

  const afterAction = useCallback(
    (result: ActionResult<unknown>) => {
      if (!result.ok && result.code !== 'NOT_FOUND') return reportFailure(result.code)
      if (!result.ok) show({ kind: 'success', message: t('notInLibrary') })
      void Promise.resolve(reload.current?.()).then(() => startTransition(() => router.refresh()))
      return null
    },
    [reportFailure, router, show, t],
  )

  const value = useMemo(() => ({ afterAction, register }), [afterAction, register])
  return <ShelfActionsContext.Provider value={value}>{children}</ShelfActionsContext.Provider>
}

/** `answer` after `held`, skipping copies already held (the shelf shifted between reads). */
function append(held: ShelfRows, answer: ShelfRows): ShelfRows {
  const ids = new Set(held.rows.map((row) => row.copy.copyId))
  const added = answer.rows.filter((row) => !ids.has(row.copy.copyId))
  // Nothing new and the same count: keep the state, so the list does not ask again.
  if (added.length === 0 && answer.total === held.total) return held
  return { rows: [...held.rows, ...added], total: answer.total, labels: answer.labels }
}

type Props = { query: ShelfQuery; initial: ShelfRows; children: ReactNode }

/**
 * Spine, AD-7: the client list's rows for one shelf query, seeded with the
 * server's first page. Keyed by `shelfHref(query)`, so a new search, filter
 * or sort starts over at the top while `?book=` keeps the rows. Rows are
 * never patched: more rows append the next range from `/data/shelf`, and any
 * change reloads rows 0..n (n held, at most `SHELF_MAX_ROWS`). A reload makes
 * every earlier request stale and its answer is dropped. Reloads after a
 * successful Undo from the toast and after `afterAction`, which the mounted
 * state registers its reload with.
 *
 * Keep my place: the rows held and the scroll position are kept per query
 * (`shelfPlace`). Only the first query since the page mounted restores
 * them, so coming back from another route does and a query change on `/`
 * (Next keeps the page across search params) does not.
 */
export function ShelfRowsProvider({ query, initial, children }: Props) {
  const key = shelfHref(query)
  const [first] = useState(key)
  const [moved, setMoved] = useState(false)
  if (key !== first && !moved) setMoved(true)
  return (
    <ShelfRowsState key={key} query={query} initial={initial} restore={!moved && key === first}>
      {children}
    </ShelfRowsState>
  )
}

function ShelfRowsState({ query, initial, restore, children }: Props & { restore: boolean }) {
  const { onUndone } = useToast()
  const { register } = useShelfActions()
  const reportFailure = useReportFailure()
  // Fixed for the state's life: the provider remounts it for another query.
  const [rowsQuery] = useState(query)
  const [placeKey] = useState(() => shelfHref(query))
  const [shelf, setShelf] = useState(initial)
  const [loading, setLoading] = useState(false)
  /** Where a restore scrolls once its rows have committed. */
  const [restoreTo, setRestoreTo] = useState<number | null>(null)

  /** The rows held, ahead of the render: a load right after an answer starts from them. */
  const held = useRef(shelf)
  /** The newest request's number; `current` is the oldest one still counted. */
  const requests = useRef({ last: 0, current: 0, inFlight: null as number | null })
  /** A restore is under way: the place is not saved meanwhile. */
  const restoring = useRef(false)
  // An answer after unmount (another query) is dropped, failure toast included.
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  /** Resolves to whether the answer was applied. */
  const run = useCallback(
    async (range: ShelfRange, replace: boolean): Promise<boolean> => {
      const r = requests.current
      const id = ++r.last
      if (replace) r.current = id
      r.inFlight = id
      setLoading(true)
      const result = await fetchData<ShelfRows>(shelfRowsPath(rowsQuery, range))
      if (r.inFlight === id) {
        r.inFlight = null
        setLoading(false)
      }
      if (!mounted.current || id < r.current) return false
      if (!result.ok) {
        reportFailure(result.code)
        return false
      }
      const next = replace ? result.data : append(held.current, result.data)
      held.current = next
      setShelf(next)
      return true
    },
    [rowsQuery, reportFailure],
  )

  const save = useCallback(() => {
    if (restoring.current) return
    const scrollY = Math.max(0, Math.round(window.scrollY))
    writePlace(placeKey, { rows: held.current.rows.length, scrollY })
  }, [placeKey])

  // Before the save below, so a restore under way is not overwritten.
  useEffect(() => {
    if (!restore) return
    const place = readPlace(placeKey)
    if (!place) return
    const { rows, total } = held.current
    if (place.rows <= rows.length || rows.length >= total) {
      // After Next's own scroll, which runs as the page commits.
      window.scrollTo(0, place.scrollY)
      return
    }
    let live = true
    restoring.current = true
    void run({ offset: 0, limit: Math.min(place.rows, SHELF_MAX_ROWS) }, true).then((applied) => {
      if (!live) return
      if (applied) setRestoreTo(place.scrollY)
      else restoring.current = false
    })
    return () => {
      live = false
      restoring.current = false
    }
  }, [restore, placeKey, run])

  useLayoutEffect(() => {
    if (restoreTo === null) return
    window.scrollTo(0, restoreTo)
    restoring.current = false
  }, [restoreTo])

  useEffect(save, [shelf, save])

  // Removed as the page leaves, before the clamp or Next's scroll to top.
  useLayoutEffect(() => {
    let frame: number | null = null
    const onScroll = () => {
      frame ??= requestAnimationFrame(() => {
        frame = null
        save()
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame !== null) cancelAnimationFrame(frame)
    }
  }, [save])

  const loadMore = useCallback(() => {
    const { rows, total } = held.current
    if (requests.current.inFlight !== null || rows.length >= total) return
    void run({ offset: rows.length, limit: SHELF_PAGE_SIZE }, false)
  }, [run])

  const reload = useCallback(async () => {
    const limit = Math.min(Math.max(held.current.rows.length, SHELF_PAGE_SIZE), SHELF_MAX_ROWS)
    await run({ offset: 0, limit }, true)
  }, [run])

  useEffect(() => register(reload), [register, reload])
  useEffect(() => onUndone(() => void reload()), [onUndone, reload])

  const value = useMemo(() => ({ shelf, loading, loadMore }), [shelf, loading, loadMore])
  return <ShelfRowsContext.Provider value={value}>{children}</ShelfRowsContext.Provider>
}
