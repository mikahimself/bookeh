import type { ErrorCode } from '@/lib/errors'

export type ToastInput =
  | {
      kind: 'success'
      message: string
      hold?: boolean
      /** AD-20: the receipt token and the whole seconds it is still good for. */
      undo?: { token: string; seconds: number }
    }
  | { kind: 'error'; code: ErrorCode }

/** The text a toast shows: the caller's message, or the `errors.<CODE>` catalogue line. */
export function toastMessage(input: ToastInput, t: (key: `errors.${ErrorCode}`) => string): string {
  return input.kind === 'error' ? t(`errors.${input.code}`) : input.message
}

/**
 * `id` increments per `show`: the provider keys on it so a repeat remounts.
 * `undoToken` is the input's token while its seconds last and `null` after:
 * the one signal the provider reads for the Undo Link.
 */
export type ToastState = {
  input: ToastInput
  id: number
  leaving: boolean
  undoToken: string | null
} | null

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
 * out for exactly as long as it is still mounted. A success with `undo`
 * keeps its token for `undo.seconds`, then drops it and stays as it is: the
 * client-side expiry of the Undo Link lives here and nowhere else.
 */
export function createToastStore(leaveMs = 200, successMs = 8000): ToastStore {
  let state: ToastState = null
  let nextId = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let undoTimer: ReturnType<typeof setTimeout> | undefined
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

  const clearUndoTimer = () => {
    if (undoTimer !== undefined) clearTimeout(undoTimer)
    undoTimer = undefined
  }

  const startLeaving = () => {
    if (!state || state.leaving) return
    clearTimer()
    clearUndoTimer()
    // The box stays mounted through the fade: the Link goes with the first frame.
    set({ ...state, leaving: true, undoToken: null })
    timer = setTimeout(() => {
      timer = undefined
      set(null)
    }, leaveMs)
  }

  const show = (input: ToastInput) => {
    clearTimer()
    clearUndoTimer()
    const undo =
      input.kind === 'success' && input.undo && input.undo.seconds > 0 ? input.undo : null
    set({ input, id: nextId++, leaving: false, undoToken: undo?.token ?? null })
    if (undo) {
      undoTimer = setTimeout(() => {
        undoTimer = undefined
        if (state) set({ ...state, undoToken: null })
      }, undo.seconds * 1000)
    }
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
