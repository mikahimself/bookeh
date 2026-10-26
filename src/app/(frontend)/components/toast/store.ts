import type { ErrorCode } from '@/lib/errors'

export type ToastInput =
  | {
      kind: 'success'
      message: string
      hold?: boolean
      /** AD-20: the receipt token and the whole seconds it is still good for. */
      undo?: { token: string; seconds: number }
      /** The href of an Edit Link, shown before Undo until the toast leaves. */
      edit?: string
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
  /** Returns the new toast's id, for `withdraw`. */
  show: (input: ToastInput) => number
  dismiss: () => void
  /** `dismiss`, but only while toast `id` is the one shown: a newer toast stays. */
  withdraw: (id: number) => void
  /** A held success starts the ordinary `successMs` timer; anything else is untouched. */
  release: () => void
  subscribe: (listener: () => void) => () => void
  getState: () => ToastState
}

/**
 * Pure toast state, one toast at a time (DESIGN.md, Toast; spine, Toasts).
 * A success without `hold` leaves after `successMs`; errors and held
 * successes stay until dismissed, replaced or released (`release()` gives a
 * held success the usual timer). Leaving takes `leaveMs`, which
 * must equal `--default-transition-duration` in `styles.css`: the box fades
 * out for exactly as long as it is still mounted. A success with `undo`
 * keeps its token for `undo.seconds`, then drops it and stays as it is: the
 * client-side expiry of the Undo Link lives here and nowhere else.
 */
export function createToastStore(leaveMs = 200, successMs = 4000): ToastStore {
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
    const id = nextId++
    set({ input, id, leaving: false, undoToken: undo?.token ?? null })
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
    return id
  }

  const dismiss = () => {
    startLeaving()
  }

  const withdraw = (id: number) => {
    if (state?.id === id) startLeaving()
  }

  const release = () => {
    if (!state || state.leaving || timer !== undefined) return
    if (state.input.kind !== 'success' || !state.input.hold) return
    timer = setTimeout(() => {
      timer = undefined
      startLeaving()
    }, successMs)
  }

  const subscribe = (listener: () => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  return { show, dismiss, withdraw, release, subscribe, getState: () => state }
}
