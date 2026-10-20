import { createTranslator } from 'next-intl'
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
    INVALID_ISBN: true,
    INTERNAL: true,
    UNDO_FAILED: true,
    SAVE_FAILED: true,
    RATE_LIMITED: true,
    NO_CONNECTION: true,
    APP_UPDATED: true,
  } satisfies Record<ErrorCode, true>) as ErrorCode[]

  it.each(codes)('has errors.%s in both languages', (code) => {
    for (const catalogue of [en, fi]) {
      const message = lookup(catalogue, `errors.${code}`)
      expect(typeof message).toBe('string')
      expect(message).not.toBe('')
    }
  })

  // Consumed by the toast provider: the X, the Undo and Reload Links and the "Undone" toast.
  it.each(['toast.close', 'toast.undo', 'toast.undone', 'toast.reload'])(
    'has %s in both languages',
    (key) => {
      for (const catalogue of [en, fi]) {
        const label = lookup(catalogue, key)
        expect(typeof label).toBe('string')
        expect(label).not.toBe('')
      }
    },
  )

  // The In library Answer's copy lines: the status by select, after the location when there is one.
  it.each([
    ['en', en],
    ['fi', fi],
  ] as const)('formats a copy line with and without a location in %s', (locale, messages) => {
    const t = createTranslator({ locale, messages, namespace: 'answer' })
    expect(t('copyAt', { location: 'Tampere', status: 'owned' })).toContain('Tampere')
    const owned = t('copy', { status: 'owned' })
    const ordered = t('copy', { status: 'ordered' })
    expect(owned).not.toBe('')
    expect(ordered).not.toBe('')
    expect(owned).not.toBe(ordered)
  })

  // Couldn't look it up: the silent sources joined for the locale; Finnish verbs agree with the count.
  it.each([
    ['en', en, ['Finna'], "Finna didn't answer. 9789510397077 may still be known."],
    [
      'en',
      en,
      ['Finna', 'Google Books'],
      "Finna and Google Books didn't answer. 9789510397077 may still be known.",
    ],
    ['fi', fi, ['Finna'], 'Finna ei vastannut. 9789510397077 voi silti löytyä.'],
    [
      'fi',
      fi,
      ['Finna', 'Google Books'],
      'Finna ja Google Books eivät vastanneet. 9789510397077 voi silti löytyä.',
    ],
  ] as const)(
    'names the sources that did not answer in %s: %j',
    (locale, messages, names, text) => {
      const t = createTranslator({ locale, messages, namespace: 'answer' })
      const sources = new Intl.ListFormat(locale, { type: 'conjunction' }).format(names)
      expect(t('noAnswer', { sources, count: names.length, isbn: '9789510397077' })).toBe(text)
    },
  )
})
