'use client'

import { useTranslations } from 'next-intl'
import { usePathname } from 'next/navigation'
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'

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
  const value = useMemo(
    () => ({ show: store.show, dismiss: store.dismiss }),
    [store],
  )

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
          region exists. An error's own role="alert" announces on insertion. */}
      <div
        role="status"
        className="fixed inset-x-page-margin-phone bottom-4 z-10 wide:inset-x-page-margin"
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
              closeLabel={t('toast.close')}
              onClose={store.dismiss}
            />
          </div>
        )}
      </div>
    </ToastContext.Provider>
  )
}
