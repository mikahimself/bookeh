import { describe, expect, it, vi } from 'vitest'

import { processState } from '@/lib/processState'

describe('processState', () => {
  it('calls init once and returns the same object for the same key', () => {
    const init = vi.fn(() => ({ hits: 0 }))
    const first = processState('test.processState.repeat', init)
    const again = processState('test.processState.repeat', () => ({ hits: 99 }))

    expect(init).toHaveBeenCalledOnce()
    expect(first).toEqual({ hits: 0 })
    expect(again).toBe(first)
  })

  it('keeps a separate value per key', () => {
    const a = processState('test.processState.a', () => new Map<string, number>())
    const b = processState('test.processState.b', () => new Map<string, number>())

    expect(a).not.toBe(b)
  })

  it('returns the same object from a fresh copy of the module', async () => {
    const first = processState('test.processState.reload', () => ({}))

    vi.resetModules()
    const reloaded = await import('@/lib/processState')
    const init = vi.fn(() => ({}))

    expect(reloaded.processState).not.toBe(processState)
    expect(reloaded.processState('test.processState.reload', init)).toBe(first)
    expect(init).not.toHaveBeenCalled()
  })
})
