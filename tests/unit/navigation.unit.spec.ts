// @vitest-environment jsdom
import { cleanup, render, renderHook } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const back = vi.fn()
const push = vi.fn()
const replace = vi.fn()

vi.mock('next/navigation', () => ({ useRouter: () => ({ back, push, replace }) }))

const {
  canGoBackInApp,
  depthOf,
  installNavigationTracking,
  stampPush,
  TaskBase,
  useCloseTask,
  useTaskBack,
} = await import('@/app/(frontend)/components/navigation')

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

describe('a task with a recorded base', () => {
  beforeEach(() => {
    installNavigationTracking()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame'] })
  })
  afterEach(() => {
    // Leave every exit settled, and the task unmounted (its base cleared).
    vi.runAllTimers()
    vi.useRealTimers()
    cleanup()
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  /** Opens the task at `base`, then lands `above` entries higher, as Scan → Answer does. */
  const openTask = (base: number, above: number) => {
    traverseTo(stampPush({}, base))
    render(createElement(TaskBase))
    traverseTo(stampPush({}, base + above))
  }

  it('closes past all of its entries in one go', () => {
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => undefined)
    openTask(1, 1)
    renderHook(() => useCloseTask()).result.current(null)
    expect(go).toHaveBeenCalledWith(-2)
    expect(back).not.toHaveBeenCalled()
  })

  it('replaces to / when the task was the first entry', () => {
    openTask(0, 1)
    renderHook(() => useCloseTask()).result.current(null)
    expect(replace).toHaveBeenCalledWith('/')
    expect(back).not.toHaveBeenCalled()
  })

  it('Open book leaves the task once, then pushes its address', () => {
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => undefined)
    openTask(1, 1)
    const tap = renderHook(() => useCloseTask()).result.current
    tap(null, '/?book=5')
    tap(null, '/?book=5')
    expect(go).toHaveBeenCalledTimes(1)
    expect(go).toHaveBeenCalledWith(-2)
    expect(push).not.toHaveBeenCalled()

    traverseTo(stampPush({}, 1))
    vi.advanceTimersToNextFrame()
    expect(push).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith('/?book=5', { scroll: false })
    expect(replace).not.toHaveBeenCalled()
  })

  it('Open book replaces to its address when the task was the first entry', () => {
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => undefined)
    openTask(0, 1)
    renderHook(() => useCloseTask()).result.current(null, '/?book=5')
    expect(replace).toHaveBeenCalledWith('/?book=5')
    expect(go).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  it('Back goes back above the base and replaces at it', () => {
    openTask(1, 1)
    renderHook(() => useTaskBack('/scan')).result.current()
    expect(back).toHaveBeenCalledTimes(1)

    traverseTo(stampPush({}, 1))
    vi.advanceTimersToNextFrame()
    renderHook(() => useTaskBack('/scan')).result.current()
    expect(back).toHaveBeenCalledTimes(1)
    expect(replace).toHaveBeenCalledWith('/scan')
  })

  it('Back goes back once for two taps', () => {
    openTask(1, 1)
    const tap = renderHook(() => useTaskBack('/scan')).result.current
    tap()
    tap()
    expect(back).toHaveBeenCalledTimes(1)
    expect(replace).not.toHaveBeenCalled()
  })
})

describe("a Filter chip in the phone's Book detail", () => {
  beforeEach(() => {
    installNavigationTracking()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame'] })
  })
  afterEach(() => {
    vi.runAllTimers()
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  const leave = () => renderHook(() => useTaskBack('/', true)).result.current

  it('from the list: goes back once for two taps, then replaces once to the chip', () => {
    // The row pushed `/?book=5` over `/`.
    traverseTo(stampPush({}, 1))
    const tap = leave()
    tap('/?location=4')
    tap('/?location=4')
    expect(back).toHaveBeenCalledTimes(1)
    expect(replace).not.toHaveBeenCalled()

    traverseTo(stampPush({}, 0))
    vi.advanceTimersToNextFrame()
    expect(replace).toHaveBeenCalledTimes(1)
    expect(replace).toHaveBeenCalledWith('/?location=4', { scroll: false })
    expect(push).not.toHaveBeenCalled()
  })

  it('a close after a chip in the wide panel replaces the stale list it reaches', () => {
    window.history.replaceState(null, '', '/?author=7&book=5')
    traverseTo(stampPush({}, 1))
    leave()()
    expect(back).toHaveBeenCalledTimes(1)

    // Back lands on the list as it was when the Book was opened.
    window.history.replaceState(null, '', '/')
    traverseTo(stampPush({}, 0))
    vi.advanceTimersToNextFrame()
    expect(replace).not.toHaveBeenCalled()

    window.history.replaceState(null, '', '/?author=7&book=5')
    traverseTo(stampPush({}, 1))
    renderHook(() => useTaskBack('/?author=7', true)).result.current()
    window.history.replaceState(null, '', '/')
    traverseTo(stampPush({}, 0))
    vi.advanceTimersToNextFrame()
    expect(replace).toHaveBeenCalledExactlyOnceWith('/?author=7', { scroll: false })
    window.history.replaceState(null, '', '/')
  })

  it('opened directly: replaces to the chip', () => {
    traverseTo(null)
    leave()('/?location=4')
    expect(replace).toHaveBeenCalledWith('/?location=4', { scroll: false })
    expect(back).not.toHaveBeenCalled()
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
