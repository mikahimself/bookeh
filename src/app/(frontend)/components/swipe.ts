'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'

import { sectionAfter, sectionOf } from './sections'

/** A swipe starting this close to either edge is the device's (its back gesture). */
export const SWIPE_EDGE_PX = 24
/** The least sideways travel that counts as a swipe. */
export const SWIPE_MIN_PX = 48
/** From the `wide` breakpoint up there is no swiping: every heading is on screen. */
export const SWIPE_WIDE_PX = 900

type Point = { x: number; y: number }

/**
 * What a finger travelling from `start` to `end` asks for: `next` when it
 * moves left, `prev` when it moves right, `null` when it is no swipe. A swipe
 * travels at least `SWIPE_MIN_PX` sideways, at least twice as far sideways as
 * up or down, and does not start within `SWIPE_EDGE_PX` of an edge.
 */
export function swipeDirection(
  start: Point,
  end: Point,
  viewportWidth: number,
): 'next' | 'prev' | null {
  if (viewportWidth >= SWIPE_WIDE_PX) return null
  if (start.x < SWIPE_EDGE_PX || start.x > viewportWidth - SWIPE_EDGE_PX) return null
  const dx = end.x - start.x
  const dy = end.y - start.y
  if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < 2 * Math.abs(dy)) return null
  return dx < 0 ? 'next' : 'prev'
}

/** Suspensions held: a full-screen task, an open overlay. */
let holds = 0

/** Holds one suspension; the returned release lets it go, once. */
export function suspendSwipe(): () => void {
  holds++
  let released = false
  return () => {
    if (released) return
    released = true
    holds--
  }
}

export function swipeSuspended(): boolean {
  return holds > 0
}

/**
 * Where a finger travelling from `start` to `end` on `pathname` goes: the
 * next or previous section with its transition type, or `null` when it is no
 * swipe or swiping is suspended.
 */
export function swipeTarget(
  start: Point,
  end: Point,
  viewportWidth: number,
  pathname: string,
): { href: string; type: `section-${'next' | 'prev'}` } | null {
  if (swipeSuspended()) return null
  const direction = swipeDirection(start, end, viewportWidth)
  if (!direction) return null
  const { href } = sectionAfter(sectionOf(pathname).key, direction === 'next' ? 1 : -1)
  return { href, type: `section-${direction}` }
}

/** Suspends section swiping while the caller is mounted with `active` true. */
export function useSuspendSwipe(active = true): void {
  useEffect(() => (active ? suspendSwipe() : undefined), [active])
}

/** A touch on a text field is typing or text selection, never a swipe. */
const inTextField = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest('input, textarea, [contenteditable]') !== null

/**
 * Mounted in the sections layout: a sideways swipe of one finger opens the
 * next or previous section, wrapping round, judged when the finger lifts.
 * Listeners are passive, so scrolling stays native. A second finger, a
 * start on a text field or a cancel drops the gesture; a suspension is
 * checked at its start and end.
 */
export function SectionSwipe() {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    let start: Point | null = null

    const onStart = (event: TouchEvent) => {
      const [touch] = event.touches
      start =
        event.touches.length === 1 && !swipeSuspended() && !inTextField(event.target)
          ? { x: touch.clientX, y: touch.clientY }
          : null
    }
    const onEnd = (event: TouchEvent) => {
      const from = start
      start = null
      const [touch] = event.changedTouches
      if (!from || !touch || event.touches.length > 0) return
      const target = swipeTarget(
        from,
        { x: touch.clientX, y: touch.clientY },
        window.innerWidth,
        pathname,
      )
      if (target) router.push(target.href, { transitionTypes: [target.type] })
    }
    const onCancel = () => {
      start = null
    }

    const passive = { passive: true }
    document.addEventListener('touchstart', onStart, passive)
    document.addEventListener('touchend', onEnd, passive)
    document.addEventListener('touchcancel', onCancel, passive)
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('touchcancel', onCancel)
    }
  }, [router, pathname])

  return null
}
