import { createTranslator } from 'next-intl'
import { describe, expect, it } from 'vitest'

import { activeValues } from '@/app/(frontend)/(sections)/countLine'
import type { ShelfQuery } from '@/lib/shelf/query'

import en from '../../messages/en.json'

const t = createTranslator({ locale: 'en', messages: en, namespace: 'collection' })

const query = (q: Partial<ShelfQuery>): ShelfQuery => ({
  filters: {},
  sort: 'author',
  dir: 'asc',
  ...q,
})

describe('activeValues', () => {
  it('lists the search, then each filter value in ShelfQuery order, ids by their labels', () => {
    const values = activeValues(
      query({
        q: 'linna',
        filters: {
          pages: [100, 300],
          author: [5],
          read: true,
          status: ['ordered'],
          location: [3],
          publisher: ['WSOY'],
          ratingMin: 4,
        },
      }),
      { 'location:3': 'Tampere', 'author:5': 'Väinö Linna' },
      t,
    )
    expect(values).toEqual([
      '“linna”',
      'Tampere',
      'ordered',
      'read',
      'Väinö Linna',
      'WSOY',
      '4+ stars',
      '100–300 pages',
    ])
  })

  it('leaves out an id without a label and shows read=false as unread', () => {
    const values = activeValues(
      query({ filters: { location: [3, 9], read: false } }),
      { 'location:3': 'Tampere' },
      t,
    )
    expect(values).toEqual(['Tampere', 'unread'])
  })

  it('leaves an open end of a range blank', () => {
    expect(
      activeValues(query({ filters: { year: [1950, undefined], pages: [undefined, 200] } }), {}, t),
    ).toEqual(['1950–', '–200 pages'])
  })
})
