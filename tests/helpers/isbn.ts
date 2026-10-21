import { randomInt } from 'node:crypto'

import { toIsbn13 } from '@/fields/isbn'

/**
 * A random valid 978 ISBN-13. The shared-Book ISBN index is global and test
 * rows stay, so every test Book carries a fresh one.
 */
export const randomIsbn = (): string => {
  const first12 = `978${String(randomInt(1e9)).padStart(9, '0')}`
  for (let digit = 0; digit < 10; digit++) {
    const isbn = toIsbn13(`${first12}${digit}`)
    if (isbn) return isbn
  }
  throw new Error('unreachable: one check digit always fits')
}

/** The ISBN-10 of a 978 ISBN-13, hyphenated as printed in a book. */
export const hyphenatedIsbn10 = (isbn13: string): string => {
  const core = isbn13.slice(3, 12)
  let sum = 0
  for (let i = 0; i < 9; i++) sum += Number(core[i]) * (10 - i)
  const check = (11 - (sum % 11)) % 11
  return `${core.slice(0, 1)}-${core.slice(1, 4)}-${core.slice(4)}-${check === 10 ? 'X' : check}`
}
