import type { ErrorCode } from '@/lib/errors'

export type ToastInput =
  | { kind: 'success'; message: string; hold?: boolean }
  | { kind: 'error'; code: ErrorCode }

/** The text a toast shows: the caller's message, or the `errors.<CODE>` catalogue line. */
export function toastMessage(
  input: ToastInput,
  t: (key: `errors.${ErrorCode}`) => string,
): string {
  return input.kind === 'error' ? t(`errors.${input.code}`) : input.message
}

/** `id` increments per `show`: the provider keys on it so a repeat remounts. */
export type ToastState = { input: ToastInput; id: number; leaving: boolean } | null

export type ToastStore = {
  show: (input: ToastInput) => void
  dismiss: () => void
  subscribe: (listener: () => void) => () => void
  getState: () => ToastState
}

/**
 * Pure toast state, one toast at a time (DESIGN.md, Toast; spine, Toasts).
 * A success without `hold` leaves after `successMs`; errors and held
 * successes stay until dismissed or replaced. Leaving takes `leaveMs`, which
 * must equal `--default-transition-duration` in `styles.css`: the box fades
 * out for exactly as long as it is still mounted.
 */
export function createToastStore(leaveMs = 200, successMs = 8000): ToastStore {
  let state: ToastState = null
  let nextId = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const listeners = new Set<() => void>()

  const notify = () => {
    for (const listener of listeners) listener()
  }

  const set = (next: ToastState) => {
    state = next
    notify()
  }

  const clearTimer = () => {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }

  const startLeaving = () => {
    if (!state || state.leaving) return
    clearTimer()
    set({ ...state, leaving: true })
    timer = setTimeout(() => {
      timer = undefined
      set(null)
    }, leaveMs)
  }

  const show = (input: ToastInput) => {
    clearTimer()
    set({ input, id: nextId++, leaving: false })
    if (input.kind === 'success' && !input.hold) {
      timer = setTimeout(() => {
        timer = undefined
        startLeaving()
      }, successMs)
    }
  }

  const dismiss = () => {
    startLeaving()
  }

  const subscribe = (listener: () => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  return { show, dismiss, subscribe, getState: () => state }
}
