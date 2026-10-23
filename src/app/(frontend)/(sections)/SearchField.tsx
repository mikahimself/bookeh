'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState, useTransition } from 'react'

import { parseShelfQuery, shelfHref, type ShelfParams } from '@/lib/shelf/query'

import { ProgressLine } from '../components/ProgressLine'
import { fieldClass } from '../components/TextField'
import { WIDE_QUERY } from '../components/ui/overlay'

/** How long typing pauses before the search applies. */
const PAUSE_MS = 300

const editable = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

/** The address as `shelfHref` writes it, so the field can tell its own replace. */
const canonical = (params: ShelfParams): string => {
  const { query, book } = parseShelfQuery(params)
  return shelfHref(query, { book })
}

/**
 * The collection's search: the field without a label (DESIGN.md, Text
 * field). Typing writes `q` to the address after a pause, or at once on
 * Enter, replacing the entry and keeping every other parameter; blank text
 * removes it. The progress line runs while the new page renders. Any other
 * change of the address (Clear, Back) cancels a pending search and puts the
 * address's `q` in the field; the field's own replace leaves what was typed
 * since. On wide screens `/` focuses it, unless a modal is open.
 */
export function SearchField() {
  const t = useTranslations()
  const router = useRouter()
  const params = useSearchParams()
  const address = params.toString()

  const [text, setText] = useState(() => parseShelfQuery(params).query.q ?? '')
  const [pending, startTransition] = useTransition()
  const input = useRef<HTMLInputElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const current = useRef(params)
  /** The `q` the address stands for, as far as the field knows. */
  const written = useRef(text)
  /** The href of the field's last replace. */
  const own = useRef<string | null>(null)

  useEffect(() => {
    current.current = params
    if (canonical(params) === own.current) {
      own.current = null
      return
    }
    clearTimeout(timer.current)
    const q = parseShelfQuery(params).query.q ?? ''
    written.current = q
    setText(q)
    // `address` stands for `params`: the same search params as text.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address])

  useEffect(() => () => clearTimeout(timer.current), [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.defaultPrevented || event.ctrlKey || event.metaKey) return
      if (editable(event.target) || !window.matchMedia(WIDE_QUERY).matches) return
      if (document.querySelector('[role="dialog"]')) return
      event.preventDefault()
      input.current?.focus()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const apply = (value: string) => {
    clearTimeout(timer.current)
    const q = value.trim()
    if (q === written.current) return
    const { query, book } = parseShelfQuery(current.current)
    const { q: _old, ...rest } = query
    const href = shelfHref(q ? { ...rest, q } : rest, { book })
    written.current = q
    own.current = href
    startTransition(() => {
      router.replace(href, { scroll: false })
    })
  }

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault()
        apply(text)
        input.current?.blur()
      }}
    >
      {pending && <ProgressLine label={t('progress.loading')} />}
      <input
        ref={input}
        type="search"
        value={text}
        onChange={(event) => {
          const value = event.target.value
          setText(value)
          clearTimeout(timer.current)
          timer.current = setTimeout(() => apply(value), PAUSE_MS)
        }}
        placeholder={t('collection.search')}
        aria-label={t('collection.search')}
        autoComplete="off"
        enterKeyHint="search"
        className={fieldClass(false)}
      />
    </form>
  )
}
