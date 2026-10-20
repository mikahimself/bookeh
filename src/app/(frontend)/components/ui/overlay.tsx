'use client'

import { createContext, use, useEffect, useEffectEvent, useRef, type ReactNode } from 'react'

import { OVERLAY_TOKENS_KEY } from '../navigation'

/** How many overlays an element sits inside. */
const OverlayDepth = createContext(0)

/** A sheet may open one picker or dialog; that one is the deepest an overlay goes. */
const MAX_DEPTH = 1

/** What an overlay may host: a sheet one picker or dialog, a dialog nothing. */
export type OverlayKind = 'sheet' | 'dialog'

/**
 * One overlay deep (EXPERIENCE.md, UX-DR9): a Dialog or Sheet may sit inside
 * one top-level sheet and no deeper, and nothing opens inside a dialog.
 * Throws during render past that, so a violation fails the first time it is
 * opened. The returned function wraps the overlay's own tree: inside a sheet
 * overlays count one more, inside a dialog they are past the limit.
 */
export function useOverlayLayer(kind: OverlayKind): (children: ReactNode) => ReactNode {
  const depth = use(OverlayDepth)
  if (depth > MAX_DEPTH) {
    throw new Error(
      'One overlay deep (UX-DR9): nothing opens on top of a dialog, or of a picker or dialog opened from a sheet.',
    )
  }
  const inner = kind === 'dialog' ? MAX_DEPTH + 1 : depth + 1
  return function layer(children) {
    return <OverlayDepth value={inner}>{children}</OverlayDepth>
  }
}

/**
 * Tokens tell this tab's opens apart: a counter, as `crypto.randomUUID()` is
 * missing outside a secure context (dev over http on a LAN address), behind
 * a per-load prefix so an entry left by an earlier load never matches.
 */
const LOAD = Math.random().toString(36).slice(2)
let opens = 0

function tokensOf(state: unknown): string[] {
  const value =
    typeof state === 'object' && state !== null
      ? (state as Record<string, unknown>)[OVERLAY_TOKENS_KEY]
      : undefined
  return Array.isArray(value) ? value.filter((token) => typeof token === 'string') : []
}

/**
 * Back closes an overlay that has no address (spine, Navigation and history).
 * Opening pushes one same-URL entry: the current state, so Next's keys
 * survive, plus a token for this open after those of the overlays it sits
 * in. A traversal to an entry without the token closes the overlay. Any
 * other close pops the entry, but only while it is the current one, so a
 * close after a navigation never undoes the navigation.
 *
 * The push and pop effect has no cleanup and checks the ref, so StrictMode's
 * re-run neither pushes twice nor pops. Unmounting while open leaves the
 * entry; Back over it then changes nothing on screen.
 */
export function useCloseOnBack(open: boolean, close: () => void): void {
  const token = useRef<string | null>(null)
  const onBack = useEffectEvent(close)

  useEffect(() => {
    if (open) {
      if (token.current) return
      token.current = `${LOAD}-${++opens}`
      const state: unknown = window.history.state
      window.history.pushState(
        {
          ...(typeof state === 'object' ? state : null),
          [OVERLAY_TOKENS_KEY]: [...tokensOf(state), token.current],
        },
        '',
      )
      return
    }
    const pushed = token.current
    if (!pushed) return
    token.current = null
    if (tokensOf(window.history.state).at(-1) === pushed) window.history.back()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onPopState = () => {
      const pushed = token.current
      if (!pushed || tokensOf(window.history.state).includes(pushed)) return
      token.current = null
      onBack()
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [open])
}
