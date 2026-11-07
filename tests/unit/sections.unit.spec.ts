import { describe, expect, it } from 'vitest'

import { sectionAfter, sectionOf, sectionRow } from '@/app/(frontend)/components/sections'

describe('sectionOf', () => {
  it.each([
    ['/', 'collection'],
    ['/loans', 'loans'],
    ['/wishlists', 'wishlists'],
    ['/wishlists/3', 'wishlists'],
    ['/stats', 'stats'],
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
    ['collection', ['collection', 'loans', 'wishlists', 'stats', 'settings']],
    ['loans', ['loans', 'wishlists', 'stats', 'settings', 'collection']],
    ['stats', ['stats', 'settings', 'collection', 'loans', 'wishlists']],
    ['settings', ['settings', 'collection', 'loans', 'wishlists', 'stats']],
  ] as const)('leads with %s and wraps round', (current, row) => {
    expect(keys(current)).toEqual(row)
  })
})

describe('sectionAfter', () => {
  it.each([
    ['collection', 1, 'loans'],
    ['loans', 1, 'wishlists'],
    ['wishlists', 1, 'stats'],
    ['stats', 1, 'settings'],
    ['settings', 1, 'collection'],
    ['collection', -1, 'settings'],
    ['loans', -1, 'collection'],
    ['stats', -1, 'wishlists'],
    ['settings', -1, 'stats'],
  ] as const)('%s by %i is %s', (current, step, key) => {
    expect(sectionAfter(current, step).key).toBe(key)
  })
})
