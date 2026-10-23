'use client'

import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import { shelfHref, type ShelfQuery } from '@/lib/shelf/query'

import { CloseButton } from '../components/CloseButton'
import { useTaskBack } from '../components/navigation'
import { useWide } from '../components/ui/overlay'

import { BookDetailSheet } from './BookDetailSheet'
import { DetailCloseContext } from './detailClose'

type FrameProps = {
  /** The Book's title: names the sheet or the panel. */
  label: string
  query: ShelfQuery
  bookId: number
  children: ReactNode
}

/** Book detail's frame: the panel from 900px, the bottom sheet under it. */
export function BookDetailFrame({ label, query, bookId, children }: FrameProps) {
  const wide = useWide()
  return wide ? (
    <BookDetailPanel label={label} query={query} bookId={bookId}>
      {children}
    </BookDetailPanel>
  ) : (
    <BookDetailSheet label={label} query={query}>
      {children}
    </BookDetailSheet>
  )
}

/** `Esc` typed into a field belongs to the field (the search's clear). */
const inField = (target: EventTarget | null): boolean =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLTextAreaElement ||
  target instanceof HTMLSelectElement

/** `Esc` in a dialog opened from the panel closes only the dialog (topmost first). */
const inDialog = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest('[role="dialog"], [role="alertdialog"]') !== null

/**
 * Book detail from 900px (EXPERIENCE.md, Book detail; DESIGN.md, Detail
 * panel): the last column of the collection's row, flush with the screen's
 * right edge, its content in view while the list scrolls. Plain layout, not
 * an overlay: the list stays operable beside it, so there is no scrim, no
 * focus trap and nothing made inert. `?book=` is the open state, as with the
 * sheet: a new `bookId` swaps the content in place and scrolls it to the top.
 * It grows in on mount (`panel-motion`); X, `Esc` anywhere outside a field
 * or a dialog, or `useCloseDetail()` (removing the last copy) shrinks it
 * away, then leaves the address as the sheet's close does.
 * The leave waits on the frame's running transitions, so it goes at once
 * when there are none (reduce motion); focus inside the panel moves to the
 * open Book's row or tile first. A new Book during the close keeps it open.
 */
function BookDetailPanel({ label, query, bookId, children }: FrameProps) {
  const t = useTranslations('overlay')
  const leave = useTaskBack(shelfHref(query), true)
  const frame = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const [leaving, setLeaving] = useState(false)
  const [shown, setShown] = useState(bookId)
  if (bookId !== shown) {
    setShown(bookId)
    setLeaving(false)
  }

  useEffect(() => {
    if (content.current) content.current.scrollTop = 0
  }, [bookId])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        !event.defaultPrevented &&
        !inField(event.target) &&
        !inDialog(event.target)
      ) {
        // Taken here: select mode's `Esc` stays for the next press.
        event.preventDefault()
        setLeaving(true)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    const element = frame.current
    if (!leaving || !element) return
    let current = true
    // jsdom has no Web Animations.
    const running = typeof element.getAnimations === 'function' ? element.getAnimations() : []
    void Promise.allSettled(running.map(({ finished }) => finished)).then(() => {
      if (!current) return
      // Focus inside would fall to the body as the panel goes: back to the open Book's row.
      if (element.contains(document.activeElement)) {
        document
          .querySelector<HTMLElement>('a[aria-current="true"]')
          ?.focus({ preventScroll: true })
      }
      leave()
    })
    return () => {
      current = false
    }
  }, [leaving, leave])

  const close = useCallback(() => setLeaving(true), [])

  return (
    <div
      ref={frame}
      data-open={leaving ? undefined : ''}
      className="flex shrink-0 justify-end overflow-clip panel-motion"
    >
      <aside
        aria-label={label}
        className="w-panel-width shrink-0 border-l border-border bg-background panel-shadow"
      >
        <div className="sticky top-0 flex max-h-dvh flex-col">
          <div className="flex shrink-0 justify-end px-4 pt-3">
            <CloseButton label={t('close')} onClick={close} />
          </div>
          <div ref={content} className="min-h-0 flex-1 overflow-y-auto px-6 pt-1 pb-6">
            <DetailCloseContext value={close}>{children}</DetailCloseContext>
          </div>
        </div>
      </aside>
    </div>
  )
}
