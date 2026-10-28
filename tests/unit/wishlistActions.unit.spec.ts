import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Ref } from '@/lib/payload/ref'

// The opened entry's "For" (FR-38): client input is checked before
// `setEntryRecipient()`, never repaired; a bad entry id or recipient is
// `VALIDATION` with no write.

const ctx = { user: { id: 1 } }
const setEntryRecipient =
  vi.fn<(ctx: unknown, entry: number, person: Ref | null) => Promise<number | null>>()

vi.mock('@/lib/payload/context', () => ({ requireUserOrThrow: async () => ctx }))
vi.mock('@/lib/wishlists/entries', () => ({ setEntryRecipient }))
vi.mock('@/lib/wishlists/wishlists', () => ({}))

const { setEntryRecipientAction } = await import('@/app/(frontend)/actions/wishlists')

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
