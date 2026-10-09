import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createToastStore, toastMessage } from '@/app/(frontend)/components/toast/store'

const success = { kind: 'success', message: 'Saved' } as const
const error = { kind: 'error', code: 'INTERNAL' } as const

describe('toastMessage', () => {
  // `messages.unit.spec.ts` holds errors.<CODE> to the catalogues for every code.
  it('renders an error from its errors.<CODE> catalogue key', () => {
    expect(toastMessage(error, (key) => `<${key}>`)).toBe('<errors.INTERNAL>')
  })

  it("renders a success from the caller's message", () => {
    const t = () => {
      throw new Error('no catalogue lookup for a success')
    }
    expect(toastMessage(success, t)).toBe('Saved')
    expect(toastMessage({ ...success, hold: true }, t)).toBe('Saved')
  })
})

describe('createToastStore', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts empty', () => {
    expect(createToastStore().getState()).toBeNull()
  })

  it('shows a success, leaves at 8 s and is gone 200 ms later', () => {
    const store = createToastStore()
    store.show(success)
    expect(store.getState()).toMatchObject({ input: success, leaving: false })

    vi.advanceTimersByTime(7999)
    expect(store.getState()).toMatchObject({ leaving: false })
    vi.advanceTimersByTime(1)
    expect(store.getState()).toMatchObject({ input: success, leaving: true })

    vi.advanceTimersByTime(199)
    expect(store.getState()).not.toBeNull()
    vi.advanceTimersByTime(1)
    expect(store.getState()).toBeNull()
  })

  it('holds a success with hold: true until dismissed', () => {
    const store = createToastStore()
    store.show({ ...success, hold: true })
    vi.advanceTimersByTime(10 * 60 * 1000)
    expect(store.getState()).toMatchObject({ input: { ...success, hold: true }, leaving: false })

    store.dismiss()
    vi.advanceTimersByTime(200)
    expect(store.getState()).toBeNull()
  })

  it('never leaves an error on a timer', () => {
    const store = createToastStore()
    store.show(error)
    vi.advanceTimersByTime(10 * 60 * 1000)
    expect(store.getState()).toMatchObject({ input: error, leaving: false })
  })

  it('replaces a visible toast at once, with a new id and a fresh timer', () => {
    const store = createToastStore()
    store.show(success)
    const first = store.getState()
    expect(first).not.toBeNull()

    vi.advanceTimersByTime(7000)
    store.show(error)
    const second = store.getState()
    expect(second).toMatchObject({ input: error, leaving: false })
    expect(second?.id).not.toBe(first?.id)

    // The replaced success's timer was cancelled: the error never leaves.
    vi.advanceTimersByTime(10 * 60 * 1000)
    expect(store.getState()).toMatchObject({ input: error, leaving: false })
  })

  it('replaces a leaving toast and restarts the success timer', () => {
    const store = createToastStore()
    store.show(success)
    store.dismiss()
    expect(store.getState()).toMatchObject({ leaving: true })

    store.show(success)
    expect(store.getState()).toMatchObject({ input: success, leaving: false })

    // The old leave timer is gone: still visible at what would have been its end.
    vi.advanceTimersByTime(200)
    expect(store.getState()).toMatchObject({ leaving: false })

    // The new 8 s timer runs from the replacement.
    vi.advanceTimersByTime(7800)
    expect(store.getState()).toMatchObject({ leaving: true })
    vi.advanceTimersByTime(200)
    expect(store.getState()).toBeNull()
  })

  it('dismisses at once and is gone 200 ms later', () => {
    const store = createToastStore()
    store.show(error)
    store.dismiss()
    expect(store.getState()).toMatchObject({ input: error, leaving: true })
    vi.advanceTimersByTime(200)
    expect(store.getState()).toBeNull()
  })

  it('dismiss is a no-op with nothing shown and while already leaving', () => {
    const store = createToastStore()
    expect(() => store.dismiss()).not.toThrow()
    expect(store.getState()).toBeNull()

    store.show(success)
    store.dismiss()
    vi.advanceTimersByTime(100)
    store.dismiss()
    // The second dismiss did not restart the leave timer.
    vi.advanceTimersByTime(100)
    expect(store.getState()).toBeNull()
  })

  it('increments id per show', () => {
    const store = createToastStore()
    store.show(success)
    const a = store.getState()?.id
    store.show(success)
    const b = store.getState()?.id
    expect(a).not.toBe(b)
  })

  it('notifies subscribers on every change and stops after unsubscribe', () => {
    const store = createToastStore()
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)

    store.show(success)
    expect(listener).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(8000)
    expect(listener).toHaveBeenCalledTimes(2) // leaving
    vi.advanceTimersByTime(200)
    expect(listener).toHaveBeenCalledTimes(3) // gone

    unsubscribe()
    store.show(success)
    expect(listener).toHaveBeenCalledTimes(3)
  })

  it('takes its own timings', () => {
    const store = createToastStore(50, 1000)
    store.show(success)
    vi.advanceTimersByTime(1000)
    expect(store.getState()).toMatchObject({ leaving: true })
    vi.advanceTimersByTime(50)
    expect(store.getState()).toBeNull()
  })

  it('unmounts exactly when the CSS --default-transition-duration ends', () => {
    // The box fades out for as long as it is mounted: the default leaveMs
    // must equal the transition duration in styles.css. A change to either
    // side fails here.
    const styles = readFileSync(
      fileURLToPath(new URL('../../src/app/(frontend)/styles.css', import.meta.url)),
      'utf8',
    )
    const cssMs = Number(styles.match(/--default-transition-duration:\s*(\d+)ms/)?.[1])
    expect(cssMs).toBeGreaterThan(0)

    const store = createToastStore()
    store.show(success)
    store.dismiss()
    vi.advanceTimersByTime(cssMs - 1)
    expect(store.getState()).not.toBeNull()
    vi.advanceTimersByTime(1)
    expect(store.getState()).toBeNull()
  })
})
