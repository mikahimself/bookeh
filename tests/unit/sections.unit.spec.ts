import { describe, expect, it } from 'vitest'

import { sectionAfter, sectionOf, sectionRow } from '@/app/(frontend)/components/sections'

describe('sectionOf', () => {
  it.each([
    ['/', 'collection'],
    ['/loans', 'loans'],
    ['/wishlists', 'wishlists'],
    ['/wishlists/3', 'wishlists'],
    ['/settings', 'settings'],
  ])('%s is %s', (pathname, key) => {
    expect(sectionOf(pathname).key).toBe(key)
  })

  it.each(['/loansx', '/scan', ''])('%j falls back to collection', (pathname) => {
    expect(sectionOf(pathname).key).toBe('collection')
  })
})

describe('sectionRow', () => {
  const keys = (current: Parameters<typeof sectionRow>[0]) =>
    sectionRow(current).map(({ key }) => key)

  it.each([
    ['collection', ['collection', 'loans', 'wishlists', 'settings']],
    ['loans', ['loans', 'wishlists', 'settings', 'collection']],
    ['settings', ['settings', 'collection', 'loans', 'wishlists']],
  ] as const)('leads with %s and wraps round', (current, row) => {
    expect(keys(current)).toEqual(row)
  })

  it('pairs each section with its address', () => {
    expect(sectionRow('wishlists').map(({ href }) => href)).toEqual([
      '/wishlists',
      '/settings',
      '/',
      '/loans',
    ])
  })
})

describe('sectionAfter', () => {
  it.each([
    ['collection', 1, 'loans'],
    ['loans', 1, 'wishlists'],
    ['wishlists', 1, 'settings'],
    ['settings', 1, 'collection'],
    ['collection', -1, 'settings'],
    ['loans', -1, 'collection'],
    ['settings', -1, 'wishlists'],
  ] as const)('%s by %i is %s', (current, step, key) => {
    expect(sectionAfter(current, step).key).toBe(key)
  })
})
