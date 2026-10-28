import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Ref } from '@/lib/payload/ref'

// The opened entry's "For" (FR-38), Bought, Ordered and Remove (FR-28):
// client input is checked before the service, never repaired; a bad entry
// id, recipient or close kind is `VALIDATION` with no write.

const ctx = { user: { id: 1 } }
const setEntryRecipient =
  vi.fn<(ctx: unknown, entry: number, person: Ref | null) => Promise<number | null>>()

vi.mock('@/lib/payload/context', () => ({ requireUserOrThrow: async () => ctx }))
const tx = { user: { id: 1 }, tx: true }
const closeEntry = vi.fn<(ctx: unknown, entry: number, as: 'bought' | 'ordered') => unknown>()
const removeEntry = vi.fn<(ctx: unknown, entry: number) => Promise<void>>()
const withUndo = vi.fn(async (_ctx: unknown, run: (tx: unknown) => Promise<unknown>) => {
  await run(tx)
  return { copyId: null, savedTo: null, undoToken: 'u1', undoSeconds: 10 }
})

vi.mock('@/lib/payload/context', () => ({ requireUserOrThrow: async () => ctx }))
vi.mock('@/lib/wishlists/entries', () => ({ setEntryRecipient, closeEntry, removeEntry }))
vi.mock('@/lib/wishlists/wishlists', () => ({}))
vi.mock('@/lib/undo/undo', () => ({ withUndo }))

const { setEntryRecipientAction, closeEntryAction, removeEntryAction } =
  await import('@/app/(frontend)/actions/wishlists')

describe('setEntryRecipientAction', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it.each([
    [0, 5],
    [1.5, 5],
    ['x', 5],
    [12, { create: 1 }],
    [12, { id: 1 }],
  ])('answers VALIDATION with no write for entry %j and person %j', async (entry, person) => {
    expect(await setEntryRecipientAction(entry, person)).toEqual({ ok: false, code: 'VALIDATION' })
    expect(setEntryRecipient).not.toHaveBeenCalled()
  })

  it.each([
    [6, 6],
    [{ create: 'Leena' }, 9],
    [null, null],
  ])('passes person %j through and answers the recipient', async (person, recipient) => {
    setEntryRecipient.mockResolvedValue(recipient)
    expect(await setEntryRecipientAction(12, person)).toEqual({ ok: true, data: recipient })
    expect(setEntryRecipient).toHaveBeenCalledExactlyOnceWith(ctx, 12, person)
  })
})

describe('closeEntryAction', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it.each([
    [0, 'bought'],
    [1.5, 'bought'],
    ['x', 'ordered'],
    [13, 'lost'],
    [13, undefined],
  ])('answers VALIDATION with no write for entry %j as %j', async (entry, as) => {
    expect(await closeEntryAction(entry, as)).toEqual({ ok: false, code: 'VALIDATION' })
    expect(withUndo).not.toHaveBeenCalled()
    expect(closeEntry).not.toHaveBeenCalled()
  })

  it('closes the entry through withUndo', async () => {
    expect(await closeEntryAction(13, 'ordered')).toEqual({
      ok: true,
      data: { copyId: null, savedTo: null, undoToken: 'u1', undoSeconds: 10 },
    })
    expect(withUndo).toHaveBeenCalledOnce()
    expect(withUndo.mock.calls[0]?.[0]).toBe(ctx)
    expect(closeEntry).toHaveBeenCalledExactlyOnceWith(tx, 13, 'ordered')
  })
})

describe('removeEntryAction', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it.each([0, 1.5, 'x'])('answers VALIDATION with no write for entry %j', async (entry) => {
    expect(await removeEntryAction(entry)).toEqual({ ok: false, code: 'VALIDATION' })
    expect(removeEntry).not.toHaveBeenCalled()
  })

  it('removes the entry', async () => {
    removeEntry.mockResolvedValue(undefined)
    expect(await removeEntryAction(13)).toEqual({ ok: true, data: null })
    expect(removeEntry).toHaveBeenCalledExactlyOnceWith(ctx, 13)
  })
})
