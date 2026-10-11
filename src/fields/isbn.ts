import type { TextField } from 'payload'
import { text } from 'payload/shared'

import { DomainError } from '@/lib/errors'

function isbn13CheckDigit(first12: string): number {
  let sum = 0
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3)
  return (10 - (sum % 10)) % 10
}

/**
 * ISBN-10 or ISBN-13, hyphens and spaces allowed, to the 13-digit form; null
 * when the text is not a valid ISBN (check digit included).
 */
export function toIsbn13(text: string): string | null {
  const compact = text.replace(/[\s-]/g, '').toUpperCase()
  if (/^97[89]\d{10}$/.test(compact)) {
    return isbn13CheckDigit(compact.slice(0, 12)) === Number(compact[12]) ? compact : null
  }
  if (/^\d{9}[\dX]$/.test(compact)) {
    let sum = 0
    for (let i = 0; i < 10; i++) {
      sum += (compact[i] === 'X' ? 10 : Number(compact[i])) * (10 - i)
    }
    if (sum % 11 !== 0) return null
    const first12 = `978${compact.slice(0, 9)}`
    return `${first12}${isbn13CheckDigit(first12)}`
  }
  return null
}

/** Spine, ISBN convention: the service that first receives an ISBN normalises it here. */
export function normaliseIsbn(text: string): string {
  const isbn13 = toIsbn13(text)
  if (isbn13 === null) throw new DomainError('INVALID_ISBN')
  return isbn13
}

/**
 * `isbn13`, stored only in its 13-digit form. Blank becomes null; text that
 * converts is converted; anything else is left for `validate` to reject.
 */
export const isbnField = (): TextField => ({
  name: 'isbn13',
  type: 'text',
  hooks: {
    beforeValidate: [
      ({ value }: { value?: unknown }) => {
        if (value === undefined || value === null) return null
        if (typeof value !== 'string') return value
        if (value.trim() === '') return null
        return toIsbn13(value) ?? value
      },
    ],
  },
  // Admin form state validates the raw input without running the hook, so
  // blank and convertible text pass here; the hook converts on the real save.
  validate: (value: unknown, options) => {
    const invalid =
      value !== null &&
      value !== undefined &&
      (typeof value !== 'string' || (value.trim() !== '' && toIsbn13(value) === null))
    if (invalid) return options.req.t('validation:invalidInput')
    return text(value as string | null | undefined, options)
  },
})
