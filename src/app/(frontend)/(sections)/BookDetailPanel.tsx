'use client'

import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import { CloseButton } from '../components/CloseButton'
import { useTaskBack } from '../components/navigation'
import { inDialog, useWide } from '../components/ui/overlay'

import { BookDetailSheet } from './BookDetailSheet'
import { DetailCloseContext } from './detailClose'

type FrameProps = {
  /** The Book's title: names the sheet or the panel. */
  label: string
  /** The section's address without `book` or `entry`: where closing lands. */
  back: string
  /** The open Book's or entry's id: a new one swaps the content in place and scrolls it to the top. */
  openId: number
  children: ReactNode
}

/** Book detail's frame, also the opened wishlist entry's: the panel from 900px, the bottom sheet under it. */
export function BookDetailFrame({ label, back, openId, children }: FrameProps) {
  const wide = useWide()
  return wide ? (
    <BookDetailPanel label={label} back={back} openId={openId}>
      {children}
    </BookDetailPanel>
  ) : (
    <BookDetailSheet label={label} back={back}>
      {children}
    </BookDetailSheet>
  )
}

/** `Esc` typed into a field belongs to the field (the search's clear). */
const inField = (target: EventTarget | null): boolean =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLTextAreaElement ||
  target instanceof HTMLSelectElement

/**
 * Book detail from 900px (EXPERIENCE.md, Book detail; DESIGN.md, Detail
 * panel): the last column of the collection's row, flush with the screen's
 * right edge, its content in view while the list scrolls. Plain layout, not
 * an overlay: the list stays operable beside it, so there is no scrim, no
 * focus trap and nothing made inert. `?book=` (or a wishlist's `?entry=`) is
 * the open state, as with the sheet: a new `openId` swaps the content in
 * place and scrolls it to the top.
 * It grows in on mount (`panel-motion`); X, `Esc` anywhere outside a field
 * or a dialog, or `useCloseDetail()` (removing the last copy) shrinks it
 * away, then leaves the address as the sheet's close does;
 * `useCloseDetail(to)` (an opened entry's Bought, Ordered or Remove) lands
 * on `to` instead, replacing, so the list renders afresh.
 * The leave waits on the frame's running transitions, so it goes at once
 * when there are none (reduce motion); focus inside the panel moves to the
 * open Book's (or entry's) row or tile first. A new one during the close
 * keeps it open.
 */
function BookDetailPanel({ label, back, openId, children }: FrameProps) {
  const t = useTranslations('overlay')
  const leave = useTaskBack(back, true)
  const frame = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const [leaving, setLeaving] = useState(false)
  /** Where `useCloseDetail(to)` asked the leave to land; `undefined` for X, `Esc` or `useCloseDetail()`. */
  const landing = useRef<string | undefined>(undefined)
  const [shown, setShown] = useState(openId)
  if (openId !== shown) {
    setShown(openId)
    setLeaving(false)
  }

  useEffect(() => {
    landing.current = undefined
  }, [openId])

  useEffect(() => {
    if (content.current) content.current.scrollTop = 0
  }, [openId])

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
        landing.current = undefined
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
      leave(landing.current)
    })
    return () => {
      current = false
    }
  }, [leaving, leave])

  /** X and `useCloseDetail()` leave as `Esc` does; `useCloseDetail(to)` lands on `to`. */
  const close = useCallback((to?: string) => {
    landing.current = to
    setLeaving(true)
  }, [])

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
            <CloseButton label={t('close')} onClick={() => close()} />
          </div>
          <div ref={content} className="min-h-0 flex-1 overflow-y-auto px-6 pt-1 pb-6">
            <DetailCloseContext value={close}>{children}</DetailCloseContext>
          </div>
        </div>
      </aside>
    </div>
  )
}
