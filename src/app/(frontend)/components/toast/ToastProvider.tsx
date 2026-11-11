'use client'

import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  useTransition,
  type ReactNode,
} from 'react'

import { createPortal } from 'react-dom'

import { ToastHostsContext } from './ToastHost'
import { undoAction } from '../../actions/undo'
import { ActionLink, TextLink } from '../Link'
import { reportFailure, settleAction } from '../request'
import { createToastStore, toastMessage, type ToastStore } from './store'
import { ToastView } from './ToastView'

type ToastContextValue = Pick<ToastStore, 'show' | 'dismiss' | 'withdraw' | 'release'> & {
  /** Runs `listener` after each successful Undo from the toast; returns the unsubscribe. */
  onUndone: (listener: () => void) => () => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast called outside ToastProvider')
  return context
}

/**
 * Owns the one toast (spine, Toasts). Mounted once in the root layout, above
 * the pages, so a toast survives client navigation.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const t = useTranslations()
  const [store] = useState(() => createToastStore())
  const [undoneListeners] = useState(() => new Set<() => void>())
  const state = useSyncExternalStore(store.subscribe, store.getState, () => null)
  const router = useRouter()
  const [hosts] = useState(() => new Map<string, HTMLDivElement>())
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  const registerHost = useCallback(
    (id: string, node: HTMLDivElement | null) => {
      if (node) hosts.set(id, node)
      else hosts.delete(id)
      setHost([...hosts.values()].at(-1) ?? null)
    },
    [hosts],
  )
  const [undoPending, startUndo] = useTransition()
  const value = useMemo(
    () => ({
      show: store.show,
      dismiss: store.dismiss,
      withdraw: store.withdraw,
      release: store.release,
      onUndone: (listener: () => void) => {
        undoneListeners.add(listener)
        return () => {
          undoneListeners.delete(listener)
        }
      },
    }),
    [store, undoneListeners],
  )

  /**
   * EXPERIENCE.md, Feedback: Undo becomes "Undone" for a moment (a timed
   * success, also on Scan: the hold is for Edit and Undo, which "Undone"
   * offers neither of) or "Couldn't undo."; any other failure is reported
   * like every action's (`reportFailure`, with this store: the provider sits
   * outside its own context). After a successful Undo the `onUndone`
   * listeners run, so a list showing the undone change reloads (the
   * collection's rows, AD-7); the toast itself changes nothing else.
   */
  const undoToken = state?.undoToken ?? null
  const runUndo = () => {
    if (undoToken === null) return
    startUndo(async () => {
      const result = await settleAction(undoAction(undoToken))
      if (result.ok) {
        store.show({ kind: 'success', message: t('toast.undone') })
        for (const listener of undoneListeners) listener()
        return
      }
      reportFailure(result.code, {
        show: store.show,
        dismiss: store.dismiss,
        replace: (href) => router.replace(href),
      })
    })
  }

  // An action from an older build: it did not happen, and a reload fixes it.
  const appUpdated = state?.input.kind === 'error' && state.input.code === 'APP_UPDATED'
  // Edit goes with the first frame of leaving, as Undo does, and while Undo is
  // in flight (the copy may be going); tapping it dismisses.
  const edit =
    state?.input.kind === 'success' && !state.leaving && !undoPending ? state.input.edit : undefined

  const region = (
    <>
      {/* The status region is SSR'd at the root, empty with no toast.
          Opening a modal remounts the region inside its host; closing returns
          it to the preceding host or root. The store survives those portal changes.
          A polite region announces inserted content; errors use role="alert".
          Under 900px it rises above a bar pinned to the bottom (the App bar):
          the region follows the layout's `peer` <main>. From 900px it rises
          only above a bar pinned on every width (`data-pinned-wide`, Save on
          Edit book). `data-toast-region`
          keeps it still while a section slides (styles.css). */}
      <div
        role="status"
        data-toast-region
        className={
          host
            ? 'absolute inset-x-4 bottom-[calc(max(0px,var(--sheet-offset,0px))+var(--spacing-4))] z-10 in-data-pinned-footer:bottom-[calc(max(0px,var(--sheet-offset,0px))+var(--spacing-app-bar)+var(--spacing-4)+env(safe-area-inset-bottom))]'
            : 'fixed inset-x-page-margin-phone bottom-4 z-10 max-wide:peer-has-data-pinned-bottom:bottom-[calc(var(--spacing-pinned-bar)+var(--spacing-4)+env(safe-area-inset-bottom))] wide:inset-x-page-margin wide:peer-has-data-pinned-wide:bottom-[calc(var(--spacing-pinned-bar)+var(--spacing-4)+env(safe-area-inset-bottom))]'
        }
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
                <>
                  {edit !== undefined && (
                    <TextLink href={edit} onClick={store.dismiss}>
                      {t('toast.edit')}
                    </TextLink>
                  )}
                  {undoToken !== null ? (
                    <ActionLink onClick={runUndo} disabled={undoPending}>
                      {t('toast.undo')}
                    </ActionLink>
                  ) : (
                    appUpdated && (
                      <ActionLink onClick={() => window.location.reload()}>
                        {t('toast.reload')}
                      </ActionLink>
                    )
                  )}
                </>
              }
              closeLabel={t('toast.close')}
              onClose={store.dismiss}
            />
          </div>
        )}
      </div>
    </>
  )
  return (
    <ToastContext.Provider value={value}>
      <ToastHostsContext value={registerHost}>
        {children}
        {host ? createPortal(region, host) : region}
      </ToastHostsContext>
    </ToastContext.Provider>
  )
}
