'use client'

import { useTranslations } from 'next-intl'
import { usePathname, useRouter } from 'next/navigation'
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  useTransition,
  type ReactNode,
} from 'react'

import type { ActionResult } from '@/lib/errors'

import { undoAction } from '../../actions/undo'
import { ActionLink } from '../Link'
import { takeFlash } from './flashCookie'
import { createToastStore, toastMessage, type ToastInput } from './store'
import { ToastView } from './ToastView'

type ToastContextValue = {
  show: (input: ToastInput) => void
  dismiss: () => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast called outside ToastProvider')
  return context
}

/**
 * Owns the one toast (spine, Toasts). Mounted once in the root layout, above
 * the pages, so a toast survives client navigation. Reads and clears the
 * `bookeh_flash` cookie (set by `flashToast()`) on mount and on every
 * pathname change.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const t = useTranslations()
  const [store] = useState(() => createToastStore())
  const state = useSyncExternalStore(store.subscribe, store.getState, () => null)
  const pathname = usePathname()
  const router = useRouter()
  const [undoPending, startUndo] = useTransition()
  const value = useMemo(() => ({ show: store.show, dismiss: store.dismiss }), [store])

  /**
   * EXPERIENCE.md, Feedback: Undo becomes "Undone" for a moment (a timed
   * success, also on Scan: the hold is for Edit and Undo, which "Undone"
   * offers neither of) or "Couldn't undo."; a signed-out session goes to
   * sign in and comes back here. Nothing else on the screen changes.
   */
  const undoToken = state?.undoToken ?? null
  const runUndo = () => {
    if (undoToken === null) return
    startUndo(async () => {
      // A rejected call (the network dropped) is a failure, not an error boundary.
      const result = await undoAction(undoToken).catch((): ActionResult<null> => ({
        ok: false,
        code: 'INTERNAL',
      }))
      if (result.ok) {
        store.show({ kind: 'success', message: t('toast.undone') })
        return
      }
      if (result.code === 'UNAUTHENTICATED') {
        // The provider wraps /login too: the stale toast would follow us there.
        store.dismiss()
        router.replace(`/login?next=${encodeURIComponent(pathname)}`)
        return
      }
      store.show({ kind: 'error', code: result.code })
    })
  }

  useEffect(() => {
    const input = takeFlash({
      read: () => document.cookie,
      write: (cookie) => {
        document.cookie = cookie
      },
    })
    if (input) store.show(input)
  }, [pathname, store])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* The status region is SSR'd and stays mounted, empty with no toast:
          a polite live region only announces content inserted after the
          region exists. An error's own role="alert" announces on insertion.
          Under 900px it rises above a bar pinned to the bottom (Scan book):
          the region follows the layout's `peer` <main>. `data-toast-region`
          keeps it still while a section slides (styles.css). */}
      <div
        role="status"
        data-toast-region
        className="fixed inset-x-page-margin-phone bottom-4 z-10 max-wide:peer-has-data-pinned-bottom:bottom-[calc(var(--spacing-pinned-bar)+var(--spacing-4)+env(safe-area-inset-bottom))] wide:inset-x-page-margin"
      >
        {state && (
          /* Keyed per show: remounts for the enter transition and so the
             live region re-announces a repeated message. */
          <div
            key={state.id}
            className={`transition motion-reduce:transition-none starting:translate-y-2 starting:opacity-0${
              state.leaving ? ' opacity-0' : ''
            }`}
          >
            <ToastView
              kind={state.input.kind}
              message={toastMessage(state.input, t)}
              actions={
                undoToken !== null && (
                  <ActionLink onClick={runUndo} disabled={undoPending}>
                    {t('toast.undo')}
                  </ActionLink>
                )
              }
              closeLabel={t('toast.close')}
              onClose={store.dismiss}
            />
          </div>
        )}
      </div>
    </ToastContext.Provider>
  )
}
