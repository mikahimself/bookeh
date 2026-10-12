import { describe, expect, it } from 'vitest'

import { genreName } from '@/lib/books/genreName'

describe('genreName', () => {
  it('uses the Finnish name in Finnish', () => {
    expect(genreName({ name: 'History', nameFi: 'Historia' }, 'fi')).toBe('Historia')
  })

  it('trims a padded Finnish name', () => {
    expect(genreName({ name: 'History', nameFi: ' Historia ' }, 'fi')).toBe('Historia')
  })

  it.each([
    ['no Finnish name', null, 'fi'],
    ['an empty Finnish name', '', 'fi'],
    ['a blank Finnish name', '  ', 'fi'],
    ['English', 'Historia', 'en'],
  ] as const)('falls back to the English name with %s', (_, nameFi, locale) => {
    expect(genreName({ name: 'History', nameFi }, locale)).toBe('History')
  })
})
