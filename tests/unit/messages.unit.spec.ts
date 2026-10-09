import { describe, expect, it } from 'vitest'

import type { ErrorCode } from '@/lib/errors'

import en from '../../messages/en.json'
import fi from '../../messages/fi.json'

type Catalogue = { [key: string]: string | Catalogue }

/** Dotted paths of every string leaf in a nested catalogue. */
function keys(catalogue: Catalogue, prefix = ''): string[] {
  return Object.entries(catalogue).flatMap(([key, value]) =>
    typeof value === 'string' ? [prefix + key] : keys(value, `${prefix}${key}.`),
  )
}

/** Keys present in one catalogue and missing from the other. */
function keyDiff(a: Catalogue, b: Catalogue): { onlyInA: string[]; onlyInB: string[] } {
  const ka = new Set(keys(a))
  const kb = new Set(keys(b))
  return {
    onlyInA: [...ka].filter((k) => !kb.has(k)),
    onlyInB: [...kb].filter((k) => !ka.has(k)),
  }
}

function lookup(catalogue: Catalogue, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (node, key) =>
        typeof node === 'object' && node !== null ? (node as Catalogue)[key] : undefined,
      catalogue,
    )
}

describe('keyDiff', () => {
  it('reports a key missing on either side', () => {
    const a = { errors: { A: 'a', B: 'b' }, only: { here: 'x' } }
    const b = { errors: { A: 'a', C: 'c' } }
    expect(keyDiff(a, b)).toEqual({ onlyInA: ['errors.B', 'only.here'], onlyInB: ['errors.C'] })
  })

  it('reports nothing for equal key sets', () => {
    expect(keyDiff({ a: { b: 'x' } }, { a: { b: 'y' } })).toEqual({ onlyInA: [], onlyInB: [] })
  })
})

describe('message catalogues', () => {
  it('en and fi have the same keys', () => {
    expect(keyDiff(en, fi)).toEqual({ onlyInA: [], onlyInB: [] })
  })

  // Exhaustive: adding an ErrorCode fails typecheck until it is listed here.
  const codes = Object.keys({
    UNAUTHENTICATED: true,
    WRONG_CREDENTIALS: true,
    NOT_FOUND: true,
    VALIDATION: true,
    INTERNAL: true,
  } satisfies Record<ErrorCode, true>) as ErrorCode[]

  it.each(codes)('has errors.%s in both languages', (code) => {
    for (const catalogue of [en, fi]) {
      const message = lookup(catalogue, `errors.${code}`)
      expect(typeof message).toBe('string')
      expect(message).not.toBe('')
    }
  })

  // Consumed dynamically by the toast provider's t('toast.close').
  it('has toast.close in both languages', () => {
    for (const catalogue of [en, fi]) {
      const label = lookup(catalogue, 'toast.close')
      expect(typeof label).toBe('string')
      expect(label).not.toBe('')
    }
  })
})
