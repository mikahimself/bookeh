import { describe, expect, it } from 'vitest'

import { createReadGate, LEFT_VIEW_MS } from '@/app/(frontend)/scan/readGate'

const X = '9789510123456'
const Y = '9789510123457'

describe('createReadGate', () => {
  it('passes any read while nothing is held, and never holds by itself', () => {
    const gate = createReadGate()
    expect(gate.see(null, 0)).toBeNull()
    expect(gate.see(X, 0)).toBe(X)
    expect(gate.see(X, 10)).toBe(X)
  })

  it('ignores the held ISBN while it is read, and releases it after it has gone unread', () => {
    const gate = createReadGate()
    gate.hold(X, 0)
    expect(gate.see(X, 1000)).toBeNull()
    // Each read of X restarts the wait.
    expect(gate.see(X, 2000)).toBeNull()
    expect(gate.see(null, 2000 + LEFT_VIEW_MS - 1)).toBeNull()
    expect(gate.see(X, 2000 + LEFT_VIEW_MS - 1)).toBeNull()
    expect(gate.see(null, 2000 + 2 * LEFT_VIEW_MS - 1)).toBeNull()
    expect(gate.see(X, 2000 + 2 * LEFT_VIEW_MS - 1)).toBe(X)
  })

  it('counts nothing decoded and other ISBNs as X out of view', () => {
    const gate = createReadGate()
    gate.hold(X, 0)
    expect(gate.see(null, 500)).toBeNull()
    expect(gate.see(Y, 1000)).toBe(Y)
    expect(gate.see(X, LEFT_VIEW_MS - 1)).toBeNull()
    expect(gate.see(Y, 2 * LEFT_VIEW_MS - 2)).toBe(Y)
    expect(gate.see(X, 2 * LEFT_VIEW_MS - 1)).toBe(X)
  })

  it('releases at exactly the wait', () => {
    const gate = createReadGate(100)
    gate.hold(X, 0)
    expect(gate.see(X, 99)).toBeNull()
    gate.hold(X, 0)
    expect(gate.see(X, 100)).toBe(X)
  })

  it('restarts the wait on resume, and resume holds nothing', () => {
    const gate = createReadGate()
    gate.resume(0)
    expect(gate.see(X, 1)).toBe(X)

    gate.hold(X, 0)
    gate.resume(10_000)
    expect(gate.see(X, 10_000 + LEFT_VIEW_MS - 1)).toBeNull()
  })

  it('replaces the hold', () => {
    const gate = createReadGate()
    gate.hold(X, 0)
    gate.hold(Y, 10)
    expect(gate.see(X, 20)).toBe(X)
    expect(gate.see(Y, 20)).toBeNull()
  })
})
