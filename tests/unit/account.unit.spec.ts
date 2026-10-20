import { describe, expect, it } from 'vitest'

import { parseProfileChanges } from '@/app/(frontend)/profileChanges'
import { parseRef } from '@/app/(frontend)/ref'

describe('parseProfileChanges', () => {
  it.each<[string, unknown]>([
    ['a string', 'x'],
    ['null', null],
    ['an array', ['displayName']],
    ['an unknown key', { id: 1 }],
    ['an unknown language', { language: 'sv' }],
    ['a display name of the wrong type', { displayName: 1 }],
    ['an undefined display name', { displayName: undefined }],
    ['a valid key beside an extra one', { displayName: 'A', roles: ['admin'] }],
    ['a class instance', new Date()],
    ['an unknown profile visibility', { profileVisibility: 'x' }],
    ['a collection visibility from the wrong tuple', { collectionVisibility: 'hidden' }],
    ['a profile visibility from the wrong tuple', { profileVisibility: 'open' }],
    ['a collection visibility of the wrong type', { collectionVisibility: true }],
  ])('rejects %s', (_, value) => {
    expect(parseProfileChanges(value)).toBeNull()
  })

  it('passes a display name through untouched (the service trims and normalises)', () => {
    expect(parseProfileChanges({ displayName: '  Mäki ' })).toStrictEqual({
      displayName: '  Mäki ',
    })
  })

  it.each(['en', 'fi'] as const)('accepts the language %s', (language) => {
    expect(parseProfileChanges({ language })).toStrictEqual({ language })
  })

  it.each(['public', 'hidden'] as const)('accepts the profile visibility %s', (value) => {
    expect(parseProfileChanges({ profileVisibility: value })).toStrictEqual({
      profileVisibility: value,
    })
  })

  it.each(['open', 'closed'] as const)('accepts the collection visibility %s', (value) => {
    expect(parseProfileChanges({ collectionVisibility: value })).toStrictEqual({
      collectionVisibility: value,
    })
  })

  it('accepts both keys together', () => {
    expect(parseProfileChanges({ displayName: 'Mika', language: 'fi' })).toStrictEqual({
      displayName: 'Mika',
      language: 'fi',
    })
  })

  it('accepts an empty object as no change', () => {
    expect(parseProfileChanges({})).toStrictEqual({})
    expect(parseProfileChanges(Object.create(null))).toStrictEqual({})
  })
})

describe('parseRef', () => {
  it.each<[string, unknown]>([
    ['a numeric string', '2'],
    ['zero', 0],
    ['a negative id', -1],
    ['a fraction', 1.5],
    ['an unsafe integer', Number.MAX_SAFE_INTEGER + 1],
    ['NaN', Number.NaN],
    ['null', null],
    ['an array', [{ create: 'A' }]],
    ['a non-string name', { create: 1 }],
    ['a name beside an id', { create: 'A', id: 1 }],
    ['an empty object', {}],
    ['a class instance', new Date()],
  ])('rejects %s', (_, value) => {
    expect(parseRef(value)).toBeUndefined()
  })

  it('accepts a positive integer id', () => {
    expect(parseRef(2)).toBe(2)
  })

  it('passes a name through untrimmed, blank included (the service checks it)', () => {
    expect(parseRef({ create: ' Työ ' })).toStrictEqual({ create: ' Työ ' })
    expect(parseRef({ create: '  ' })).toStrictEqual({ create: '  ' })
    expect(parseRef(Object.assign(Object.create(null), { create: 'A' }))).toStrictEqual({
      create: 'A',
    })
  })
})
