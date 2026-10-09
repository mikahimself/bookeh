'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect } from 'react'

/** `history.length` when this tab loaded the app; `null` until the tracker mounts. */
let loadedLength: number | null = null

/** How long a hand-started exit waits for the traversal before it lets go. */
const EXIT_TIMEOUT_MS = 1000

/**
 * Mounted once in the root layout: records the history length of the tab's
 * load. A later push (an in-app entry) makes it longer; a replace does not.
 */
export function NavigationTracker() {
  useEffect(() => {
    if (loadedLength === null) loadedLength = window.history.length
  }, [])

  return null
}

/**
 * Closes a full-screen task (spine, Navigation and history): history back
 * when this tab has pushed an in-app entry since it loaded, otherwise `/`,
 * replacing.
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
      if (loadedLength === null || window.history.length <= loadedLength) {
        router.replace('/')
        return
      }

      if (
        !task ||
        typeof document.startViewTransition !== 'function' ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ) {
        router.back()
        return
      }

      task.dataset.taskClosing = ''
      const transition = document.startViewTransition(
        () =>
          new Promise<void>((resolve) => {
            const done = () => {
              window.removeEventListener('popstate', onPopState)
              clearTimeout(timeout)
              resolve()
            }
            const onPopState = () => requestAnimationFrame(done)
            const timeout = setTimeout(done, EXIT_TIMEOUT_MS)
            window.addEventListener('popstate', onPopState, { once: true })
            router.back()
          }),
      )
      // Only matters if the task is still mounted (the traversal never came).
      void transition.finished.finally(() => delete task.dataset.taskClosing)
    },
    [router],
  )
}
