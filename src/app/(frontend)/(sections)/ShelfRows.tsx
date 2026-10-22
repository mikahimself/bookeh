'use client'

import { useTranslations } from 'next-intl'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import type { ActionResult } from '@/lib/errors'
import {
  SHELF_MAX_ROWS,
  SHELF_PAGE_SIZE,
  shelfRowsPath,
  type ShelfQuery,
  type ShelfRange,
  type ShelfRows,
} from '@/lib/shelf/query'

import { fetchData, useReportFailure } from '../components/request'
import { useToast } from '../components/toast/ToastProvider'

type ShelfRowsValue = {
  shelf: ShelfRows
  /** A request that still counts is in flight: the progress line runs. */
  loading: boolean
  /** The next `SHELF_PAGE_SIZE` rows, unless all are held or a request is in flight. */
  loadMore: () => void
  /** What an action on the list reports: a reload, or "Not in library" and a reload. */
  afterAction: (result: ActionResult<unknown>) => void
}

const ShelfRowsContext = createContext<ShelfRowsValue | null>(null)

export function useShelfRows(): ShelfRowsValue {
  const context = useContext(ShelfRowsContext)
  if (!context) throw new Error('useShelfRows called outside ShelfRowsProvider')
  return context
}

/** `answer` after `held`, skipping copies already held (the shelf shifted between reads). */
function append(held: ShelfRows, answer: ShelfRows): ShelfRows {
  const ids = new Set(held.rows.map((row) => row.copy.copyId))
  const added = answer.rows.filter((row) => !ids.has(row.copy.copyId))
  // Nothing new and the same count: keep the state, so the list does not ask again.
  if (added.length === 0 && answer.total === held.total) return held
  return { rows: [...held.rows, ...added], total: answer.total, labels: answer.labels }
}

/**
 * Spine, AD-7: the client list's rows for one shelf query, seeded with the
 * server's first page. The page keys it by `shelfHref(query)`, so a new
 * search, filter or sort starts over while `?book=` keeps the rows. Rows are
 * never patched: more rows append the next range from `/data/shelf`, and any
 * change reloads rows 0..n (n held, at most `SHELF_MAX_ROWS`). A reload makes
 * every earlier request stale and its answer is dropped. Reloads after a
 * successful Undo from the toast and after `afterAction`.
 */
export function ShelfRowsProvider({
  query,
  initial,
  children,
}: {
  query: ShelfQuery
  initial: ShelfRows
  children: ReactNode
}) {
  const t = useTranslations('answer')
  const { show, onUndone } = useToast()
  const reportFailure = useReportFailure()
  // Fixed for the provider's life: the page remounts it for another query.
  const [rowsQuery] = useState(query)
  const [shelf, setShelf] = useState(initial)
  const [loading, setLoading] = useState(false)

  /** The rows held, ahead of the render: a load right after an answer starts from them. */
  const held = useRef(shelf)
  /** The newest request's number; `current` is the oldest one still counted. */
  const requests = useRef({ last: 0, current: 0, inFlight: null as number | null })
  // An answer after unmount (another query) is dropped, failure toast included.
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const run = useCallback(
    async (range: ShelfRange, replace: boolean) => {
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
      if (!mounted.current || id < r.current) return
      if (!result.ok) {
        reportFailure(result.code)
        return
      }
      const next = replace ? result.data : append(held.current, result.data)
      held.current = next
      setShelf(next)
    },
    [rowsQuery, reportFailure],
  )

  const loadMore = useCallback(() => {
    const { rows, total } = held.current
    if (requests.current.inFlight !== null || rows.length >= total) return
    void run({ offset: rows.length, limit: SHELF_PAGE_SIZE }, false)
  }, [run])

  const reload = useCallback(() => {
    const limit = Math.min(Math.max(held.current.rows.length, SHELF_PAGE_SIZE), SHELF_MAX_ROWS)
    void run({ offset: 0, limit }, true)
  }, [run])

  const afterAction = useCallback(
    (result: ActionResult<unknown>) => {
      if (!result.ok && result.code !== 'NOT_FOUND') {
        reportFailure(result.code)
        return
      }
      if (!result.ok) show({ kind: 'success', message: t('notInLibrary') })
      reload()
    },
    [reload, reportFailure, show, t],
  )

  useEffect(() => onUndone(reload), [onUndone, reload])

  const value = useMemo(
    () => ({ shelf, loading, loadMore, afterAction }),
    [shelf, loading, loadMore, afterAction],
  )
  return <ShelfRowsContext.Provider value={value}>{children}</ShelfRowsContext.Provider>
}
