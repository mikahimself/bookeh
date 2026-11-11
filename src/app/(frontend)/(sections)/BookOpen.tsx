'use client'

import { useLinkStatus } from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { LinkProgress } from '../components/LinkProgress'
import { WIDE_QUERY } from '../components/ui/overlay'

/** Only the metadata already displayed by a row crosses this client boundary. */
export type BookSeed = {
  title: string
  authors: { name: string }[]
  coverUrl: string | null
  language: string | null
}

type PendingBook = {
  id: number
  seed: BookSeed
  href: string
  from: string
  origin: string
  cancelled: boolean
  finished: boolean
}
const BookOpenContext = createContext<{
  pending: PendingBook | null
  begin: (seed: BookSeed, href: string) => void
  cancel: () => boolean
  finish: () => void
} | null>(null)

export function BookOpenProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams().toString()
  const address = pathname + (search ? `?${search}` : '')
  const [pending, setPending] = useState<PendingBook | null>(null)
  const nextId = useRef(0)
  useEffect(() => {
    const traversed = () => setPending(null)
    window.addEventListener('popstate', traversed)
    return () => window.removeEventListener('popstate', traversed)
  }, [])
  const begin = useCallback((seed: BookSeed, href: string) => {
    setPending({
      id: ++nextId.current,
      seed,
      href,
      from: window.location.pathname + window.location.search + window.location.hash,
      origin:
        window.location.pathname +
        (window.location.search
          ? `?${new URLSearchParams(window.location.search).toString()}`
          : ''),
      cancelled: false,
      finished: false,
    })
  }, [])
  // Retain this activation's identity through the server handoff. Another
  // address or an explicit traversal leaves it; cancelled responses do not.
  if (pending && !pending.cancelled && address !== pending.origin && address !== pending.href) {
    setPending(null)
  }
  const cancel = useCallback(() => {
    if (!pending || window.location.pathname + window.location.search === pending.href) return false
    // No address entry exists yet. Supersede the navigation, never pop the
    // unrelated entry below the originating list. Keep a tombstone until a
    // later tap so an unfinished result cannot reopen the dismissed sheet.
    setPending({ ...pending, cancelled: true })
    router.replace(pending.from, { scroll: false })
    return true
  }, [pending, router])
  const pendingId = pending?.id
  const finish = useCallback(() => {
    setPending((current) =>
      current && current.id === pendingId ? { ...current, finished: true } : current,
    )
  }, [pendingId])
  return <BookOpenContext value={{ pending, begin, cancel, finish }}>{children}</BookOpenContext>
}

export function useBookOpen() {
  const context = useContext(BookOpenContext)
  return context ?? { pending: null, begin: () => {}, cancel: () => false, finish: () => {} }
}

/** Inside the existing Link: Next decides which activations navigate,
 * including Enter, while modified clicks and new tabs retain native behavior. */
export function BookOpen({ seed }: { seed: BookSeed }) {
  const { pending } = useLinkStatus()
  const { begin } = useBookOpen()
  const marker = useRef<HTMLSpanElement>(null)
  const wasPending = useRef(false)
  useEffect(() => {
    if (pending && !wasPending.current && !window.matchMedia(WIDE_QUERY).matches) {
      const href = marker.current?.closest('a')?.getAttribute('href')
      if (href) begin(seed, href)
    }
    wasPending.current = pending
  }, [pending, begin, seed])
  return (
    <span ref={marker} className="contents">
      <span className="hidden wide:contents">
        <LinkProgress />
      </span>
    </span>
  )
}
