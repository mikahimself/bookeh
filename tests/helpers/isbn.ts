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
