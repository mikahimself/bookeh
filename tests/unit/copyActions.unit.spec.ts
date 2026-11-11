import { expect, it } from 'vitest'

import { copyActions } from '@/app/(frontend)/(sections)/copyActions'
import type { CopyLine } from '@/lib/books/holdings'

it('orders and deduplicates eligible actions while preserving their copy targets', () => {
  const owned: CopyLine = {
    copyId: 1,
    status: 'owned',
    location: null,
    note: null,
    loan: null,
    acquiredAt: '2026-11-01',
    price: null,
  }
  const lent = {
    ...owned,
    copyId: 2,
    loan: { loanId: 3, person: { id: 4, name: 'A' }, since: '2026-11-02' },
  }
  const ordered: CopyLine = { ...lent, copyId: 5, status: 'ordered' }
  const second = { ...owned, copyId: 6 }
  const actions = (lines: CopyLine[]) =>
    copyActions(lines).map(({ name, copies }) => [name, copies.map(({ copyId }) => copyId)])
  expect(actions([owned])).toEqual([
    ['lend', [1]],
    ['move', [1]],
    ['remove', [1]],
  ])
  expect(actions([lent])).toEqual([['returned', [2]]])
  expect(actions([ordered, { ...ordered, copyId: 7, loan: null }])).toEqual([['received', [5, 7]]])
  expect(actions([lent, ordered, owned, second])).toEqual([
    ['returned', [2]],
    ['received', [5]],
    ['lend', [1, 6]],
    ['move', [1, 6]],
    ['remove', [1, 6]],
  ])
  expect(actions([])).toEqual([])
})
