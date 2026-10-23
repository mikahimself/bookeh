import { describe, expect, it } from 'vitest'

import { toggleFilter } from '@/app/(frontend)/(sections)/filterToggle'
import { languageName } from '@/lib/books/languageName'
import type { ShelfQuery } from '@/lib/shelf/query'

const query = (filters: ShelfQuery['filters']): ShelfQuery => ({
  q: 'linna',
  filters,
  sort: 'title',
  dir: 'desc',
})

describe('toggleFilter', () => {
  it('adds a value to its field and keeps the rest', () => {
    expect(toggleFilter(query({ location: [3], read: true }), 'location', 5)).toEqual(
      query({ location: [3, 5], read: true }),
    )
  })

  it('drops the field when its last value goes', () => {
    expect(toggleFilter(query({ status: ['owned'], genre: [2] }), 'status', 'owned')).toEqual(
      query({ genre: [2] }),
    )
  })

  it('switches read to the other value and clears it when the one on is tapped', () => {
    expect(toggleFilter(query({ read: true }), 'read', false)).toEqual(query({ read: false }))
    expect(toggleFilter(query({ read: false }), 'read', false)).toEqual(query({}))
  })
})

describe('languageName', () => {
  it('names a code in the locale and passes text it cannot name through', () => {
    expect(languageName('fi', 'en')).toBe('Finnish')
    expect(languageName('fi', 'fi')).toBe('suomi')
    expect(languageName('Finnish', 'en')).toBe('Finnish')
    expect(languageName('not a code', 'en')).toBe('not a code')
  })
})
