import { afterEach, describe, expect, it, vi } from 'vitest'

import { DomainError } from '@/lib/errors'

// Add to wishlist's action: client input is checked before `saveEntry()`,
// never repaired, and its failures read as the Answer needs them.

const ctx = { user: { id: 1 } }
const saveEntry = vi.fn()

vi.mock('@/lib/payload/context', () => ({ requireUserOrThrow: async () => ctx }))
vi.mock('@/lib/catalogue/saveCopy', () => ({ saveCopy: vi.fn(), saveEntry }))

const { saveEntryAction } = await import('@/app/(frontend)/scan/actions')

const ISBN = '9789510397077'
const valid = { requestId: 'r1', wishlist: 4, target: { isbn13: ISBN } }

describe('saveEntryAction', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it.each([
    ['no requestId', { wishlist: 4, target: { isbn13: ISBN } }],
    ['a wishlist { create: 1 }', { ...valid, wishlist: { create: 1 } }],
    ['a wishlist 0', { ...valid, wishlist: 0 }],
    ['a target { bookId: 0 }', { ...valid, target: { bookId: 0 } }],
    ['a target {}', { ...valid, target: {} }],
    ['a target with two kinds', { ...valid, target: { isbn13: ISBN, bookId: 9 } }],
    ['a pick of -1', { ...valid, target: { isbn13: ISBN, pick: -1 } }],
    ['a manual target with no author', { ...valid, target: { manual: { title: 'Sinuhe' } } }],
  ])('refuses %s before saveEntry', async (_, input) => {
    expect(await saveEntryAction(input)).toEqual({ ok: false, code: 'VALIDATION' })
    expect(saveEntry).not.toHaveBeenCalled()
  })

  it.each([
    [
      'an ISBN with its candidate',
      { isbn13: ISBN, pick: 1, candidate: { source: 'finna', recordId: 'helka.2' } },
      { isbn13: ISBN, pick: 1, candidate: { source: 'finna', recordId: 'helka.2' } },
    ],
    [
      'typed text with an ISBN',
      { manual: { title: 'Sinuhe', author: 'Waltari', isbn13: ISBN } },
      { manual: { isbn: ISBN, title: 'Sinuhe', authors: ['Waltari'] } },
    ],
    [
      'typed text alone',
      { manual: { title: 'Sinuhe', author: 'Waltari' } },
      { manual: { isbn: undefined, title: 'Sinuhe', authors: ['Waltari'] } },
    ],
    ['a held Book', { bookId: 9 }, { bookId: 9 }],
  ])('saves %s to the list', async (_, target, expected) => {
    const data = { bookId: 9, entryId: 12, savedTo: { id: 4, name: 'Omat' } }
    saveEntry.mockResolvedValue(data)
    const wishlist = { create: 'Joululahjat' }

    expect(await saveEntryAction({ requestId: 'r1', wishlist, target })).toEqual({ ok: true, data })
    expect(saveEntry).toHaveBeenCalledExactlyOnceWith(ctx, {
      requestId: 'r1',
      target: expected,
      save: { kind: 'entry', wishlist },
    })
  })

  it.each([
    ['NOT_FOUND', new DomainError('NOT_FOUND'), { ok: false, code: 'NOT_FOUND' }],
    ['RATE_LIMITED', new DomainError('RATE_LIMITED'), { ok: false, code: 'RATE_LIMITED' }],
    [
      'a title refusal',
      new DomainError('VALIDATION', { fields: { title: 'TOO_LONG', isbn13: 'VALIDATION' } }),
      { ok: false, code: 'VALIDATION', fields: { title: 'TOO_LONG' } },
    ],
    [
      'a wishlist refusal',
      new DomainError('VALIDATION', { fields: { wishlist: 'VALIDATION' } }),
      { ok: false, code: 'SAVE_FAILED' },
    ],
    ['an unexpected error', new Error('boom'), { ok: false, code: 'SAVE_FAILED' }],
  ])('answers %s as the Answer needs it', async (_, err, expected) => {
    saveEntry.mockRejectedValue(err)
    expect(await saveEntryAction(valid)).toEqual(expected)
  })
})
