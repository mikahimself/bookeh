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
    expect(toggleFilter(query({ location: [3], read: ['read'] }), 'location', 5)).toEqual(
      query({ location: [3, 5], read: ['read'] }),
    )
  })

  it('drops the field when its last value goes', () => {
    expect(toggleFilter(query({ status: ['owned'], genre: [2] }), 'status', 'owned')).toEqual(
      query({ genre: [2] }),
    )
  })

  it('toggles read states as a list', () => {
    expect(toggleFilter(query({ read: ['read'] }), 'read', 'reading')).toEqual(
      query({ read: ['read', 'reading'] }),
    )
    expect(toggleFilter(query({ read: ['reading'] }), 'read', 'reading')).toEqual(query({}))
  })
})

describe('addFilter', () => {
  it('adds a value to its field and keeps search, sort and the other fields', () => {
    expect(addFilter(query({ genre: [2] }), 'author', 7)).toEqual(
      query({ genre: [2], author: [7] }),
    )
  })

  it('appends classification values and preserves already selected values', () => {
    const initial = query({ genre: [2], theme: ['System'], tag: [3] })
    const genre = addFilter(initial, 'genre', 'tag:4')
    const theme = addFilter(genre, 'theme', 'Private theme')
    const tags = addFilter(theme, 'tag', 5)
    expect(tags).toEqual(
      query({ genre: [2, 'tag:4'], theme: ['System', 'Private theme'], tag: [3, 5] }),
    )
    expect(addFilter(tags, 'theme', 'Private theme')).toBe(tags)
    expect(addFilter(tags, 'genre', 'tag:4')).toBe(tags)
    expect(addFilter(tags, 'tag', 5)).toBe(tags)
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
