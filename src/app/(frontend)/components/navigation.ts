'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect } from 'react'

/** The key stamped on every history state this tab writes. */
const DEPTH_KEY = '__bookehDepth'

/** In-app entries pushed above the one this tab loaded; module state, like `holds` in swipe.ts. */
let depth = 0
let installed = false
/** A hand-started exit is in flight; a second tap on the X is a no-op until it settles. */
let closing = false

/** How long a hand-started exit waits for the traversal before it lets go. */
const EXIT_TIMEOUT_MS = 1000

/** The depth stamped on a history state; `0` for an unstamped or missing one. */
export function depthOf(state: unknown): number {
  if (typeof state !== 'object' || state === null) return 0
  const value = (state as Record<string, unknown>)[DEPTH_KEY]
  return typeof value === 'number' ? value : 0
}

/**
 * `state` with `depth` stamped on it. An object keeps its keys (Next's
 * `__NA` and tree among them); anything else is replaced, as Next only ever
 * passes objects. Next builds a fresh state on every push and its public
 * patch copies only its own keys, so the stamp has to be added here.
 */
export function stampPush(state: unknown, depth: number): object {
  const base = typeof state === 'object' && state !== null ? state : {}
  return { ...base, [DEPTH_KEY]: depth }
}

/** Whether history back stays in the app: an in-app entry was pushed above the loaded one. */
export function canGoBackInApp(): boolean {
  return depth > 0
}

/**
 * Wraps `history.pushState` / `replaceState` once per tab so every entry
 * carries its depth (push: one more; replace: the same), and follows
 * traversals through `popstate`. Reads the current entry's stamp first, so a
 * reload keeps its depth. `history.length` is never read: browsers cap it at
 * 50, which a long scanning session reaches.
 */
export function installNavigationTracking(): void {
  if (installed) return
  installed = true
  depth = depthOf(window.history.state)

  const push = window.history.pushState.bind(window.history)
  const replace = window.history.replaceState.bind(window.history)
  window.history.pushState = (state, unused, url) => {
    push(stampPush(state, depth + 1), unused, url)
    depth += 1
  }
  window.history.replaceState = (state, unused, url) =>
    replace(stampPush(state, depth), unused, url)
  window.addEventListener('popstate', (event) => {
    depth = depthOf(event.state)
  })
}

/** Mounted once in the root layout, before Next's own history patch, which then wraps these. */
export function NavigationTracker() {
  useEffect(installNavigationTracking, [])

  return null
}

/**
 * Closes a full-screen task (spine, Navigation and history): history back
 * when this tab has pushed an in-app entry above the loaded one, otherwise
 * `/`, replacing. While a back is in flight a second tap does nothing.
 *
 * React renders a history traversal synchronously, with no view transition,
 * so the back branch starts one itself: the task, marked
 * `data-task-closing`, slides away (styles.css) over the section the
 * traversal reveals. The update resolves a frame after `popstate`, with a
 * safety timeout. Without view transitions, or under reduce motion, the task
 * closes at once. The replace branch is a normal transition, so the task's
 * own `<ViewTransition exit>` plays.
 */
export function useCloseTask(): (task: HTMLElement | null) => void {
  const router = useRouter()
  return useCallback(
    (task) => {
      if (closing) return
      if (!canGoBackInApp()) {
        router.replace('/')
        return
      }

      // Set before any branching: the view-transition branch runs `back()`
      // from a deferred callback, and a second tap must not get in first.
      closing = true
      const back = (settled: () => void) => {
        const done = () => {
          window.removeEventListener('popstate', onPopState)
          clearTimeout(timeout)
          closing = false
          settled()
        }
        const onPopState = () => requestAnimationFrame(done)
        const timeout = setTimeout(done, EXIT_TIMEOUT_MS)
        window.addEventListener('popstate', onPopState, { once: true })
        router.back()
      }

      if (
        !task ||
        typeof document.startViewTransition !== 'function' ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ) {
        back(() => undefined)
        return
      }

      task.dataset.taskClosing = ''
      const transition = document.startViewTransition(
        () => new Promise<void>((resolve) => back(resolve)),
      )
      // Only matters if the task is still mounted (the traversal never came).
      void transition.finished.finally(() => delete task.dataset.taskClosing)
    },
    [router],
  )
}
