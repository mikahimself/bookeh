// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const back = vi.fn()
const replace = vi.fn()

vi.mock('next/navigation', () => ({ useRouter: () => ({ back, replace }) }))

const { canGoBackInApp, depthOf, installNavigationTracking, stampPush, useCloseTask } =
  await import('@/app/(frontend)/components/navigation')

/** navigation.ts's safety timeout. */
const EXIT_TIMEOUT_MS = 1000

/** Lands on an entry carrying `state`, as the browser does on Back or Forward. */
const traverseTo = (state: unknown) =>
  window.dispatchEvent(new PopStateEvent('popstate', { state }))

describe('depth tracking', () => {
  beforeEach(() => {
    installNavigationTracking()
    traverseTo(null)
  })

  it('an unstamped entry means no in-app back', () => {
    expect(depthOf(null)).toBe(0)
    expect(depthOf({ __NA: true })).toBe(0)
    expect(canGoBackInApp()).toBe(false)
  })

  it('a push stamps one deeper and keeps the state keys; a replace carries the depth', () => {
    window.history.pushState({ __NA: true }, '', '/scan')
    expect(window.history.state).toEqual({ __NA: true, __bookehDepth: 1 })
    expect(canGoBackInApp()).toBe(true)

    window.history.replaceState({ __NA: true }, '', '/scan?isbn=1')
    expect(window.history.state).toEqual({ __NA: true, __bookehDepth: 1 })
    expect(canGoBackInApp()).toBe(true)

    window.history.pushState(null, '', '/scan?isbn=2')
    expect(depthOf(window.history.state)).toBe(2)
  })

  it('a traversal restores the depth of the entry landed on', () => {
    window.history.pushState({}, '', '/scan')
    traverseTo(stampPush({}, 0))
    expect(canGoBackInApp()).toBe(false)
    traverseTo(stampPush({}, 1))
    expect(canGoBackInApp()).toBe(true)
  })
})

describe('useCloseTask', () => {
  beforeEach(() => {
    installNavigationTracking()
    vi.useFakeTimers({
      toFake: [
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'Date',
        'requestAnimationFrame',
        'cancelAnimationFrame',
      ],
    })
  })
  afterEach(() => {
    // Leave every exit settled, so the next test's first tap is live.
    vi.runAllTimers()
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  const close = () => renderHook(() => useCloseTask()).result.current

  it('replaces to / when nothing in-app was pushed', () => {
    traverseTo(null)
    close()(null)
    expect(replace).toHaveBeenCalledWith('/')
    expect(back).not.toHaveBeenCalled()
  })

  it('goes back once for two taps, and is live again a frame after the traversal', () => {
    traverseTo(stampPush({}, 1))
    const tap = close()
    tap(null)
    tap(null)
    expect(back).toHaveBeenCalledTimes(1)
    expect(replace).not.toHaveBeenCalled()

    traverseTo(stampPush({}, 1))
    vi.advanceTimersToNextFrame()
    tap(null)
    expect(back).toHaveBeenCalledTimes(2)
  })

  it('stays dead until the safety timeout when no traversal comes', () => {
    traverseTo(stampPush({}, 1))
    const tap = close()
    tap(null)
    vi.advanceTimersByTime(EXIT_TIMEOUT_MS - 1)
    tap(null)
    expect(back).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(1)
    tap(null)
    expect(back).toHaveBeenCalledTimes(2)
  })
})

// Last: a fresh module instance wraps history a second time in this tab.
describe('a reload', () => {
  it('keeps the depth stamped on the current entry', async () => {
    traverseTo(stampPush({}, 1))
    window.history.replaceState(stampPush({}, 1), '', '/scan')
    vi.resetModules()
    const fresh = await import('@/app/(frontend)/components/navigation')
    expect(fresh.canGoBackInApp()).toBe(false)
    fresh.installNavigationTracking()
    expect(fresh.canGoBackInApp()).toBe(true)
  })
})
