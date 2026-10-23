import { describe, expect, it } from 'vitest'

import { addFilter, toggleFilter } from '@/app/(frontend)/(sections)/filterToggle'
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

describe('addFilter', () => {
  it('adds a value to its field and keeps search, sort and the other fields', () => {
    expect(addFilter(query({ genre: [2] }), 'author', 7)).toEqual(
      query({ genre: [2], author: [7] }),
    )
  })

  it('widens a field that has a value', () => {
    expect(addFilter(query({ author: [3] }), 'author', 7)).toEqual(query({ author: [3, 7] }))
  })

  it('leaves the query as it is when the value is already on', () => {
    const on = query({ author: [7], location: [4] })
    expect(addFilter(on, 'author', 7)).toBe(on)
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
