import { describe, expect, it } from 'vitest'

import {
  parseShelfQuery,
  shelfHref,
  shelfRowsPath,
  type ShelfAddress,
  type ShelfQuery,
} from '@/lib/shelf/query'

const DEFAULT: ShelfQuery = { filters: {}, sort: 'author', dir: 'asc' }

/** A page's awaited `searchParams`: a repeated key becomes an array. */
const asRecord = (search: string): Record<string, string | string[]> => {
  const record: Record<string, string | string[]> = {}
  for (const [key, value] of new URLSearchParams(search)) {
    const prev = record[key]
    record[key] = prev === undefined ? value : [...(Array.isArray(prev) ? prev : [prev]), value]
  }
  return record
}

const both = (search: string): ShelfAddress[] => [
  parseShelfQuery(new URLSearchParams(search)),
  parseShelfQuery(asRecord(search)),
]

describe('shelf query parameters', () => {
  it('round-trips every field through shelfHref and both parameter shapes', () => {
    const query: ShelfQuery = {
      q: '50% & _x\\ ä',
      filters: {
        location: [4, 2],
        status: ['ordered', 'owned'],
        read: false,
        genre: [11, 'tag:12'],
        tag: [12, 13],
        language: ['fin', 'swe'],
        author: [3, 7],
        series: [8, 9],
        publisher: ['Gummerus, Otava', 'WSOY'],
        ratingMin: 4,
        year: [1990, undefined],
        pages: [undefined, 300],
      },
      sort: 'year',
      dir: 'desc',
    }
    const href = shelfHref(query, { book: 12 })
    expect(href.startsWith('/?')).toBe(true)
    for (const address of both(href.slice(2))) {
      expect(address).toStrictEqual({ query, book: 12 })
    }
  })

  it.each<[string, ShelfAddress]>([
    [
      'author=x&author=5&location=-1&location=2.5',
      { query: { ...DEFAULT, filters: { author: [5] } }, book: null },
    ],
    ['status=lent&sort=price&dir=up&read=maybe', { query: DEFAULT, book: null }],
    ['rating=0&year=2000-1990&pages=a-b', { query: DEFAULT, book: null }],
    ['rating=6&year=-', { query: DEFAULT, book: null }],
    ['rating=x&pages=1-2-3', { query: DEFAULT, book: null }],
    ['book=0', { query: DEFAULT, book: null }],
    ['book=abc', { query: DEFAULT, book: null }],
    ['sort=title&sort=year&q=a&q=b', { query: { ...DEFAULT, q: 'a', sort: 'title' }, book: null }],
    ['q=&language=', { query: DEFAULT, book: null }],
    ['page=3&foo=1', { query: DEFAULT, book: null }],
    [
      'tag=1&theme=Sota',
      { query: { ...DEFAULT, filters: { tag: [1], theme: ['Sota'] } }, book: null },
    ],
    [
      'genre=1&genre=tag:1&genre=tag:01&genre=tag:0&genre=tag:-2&genre=tag:2.1&genre=tag:2147483648&tag=2&tag=2&tag=x',
      { query: { ...DEFAULT, filters: { genre: [1, 'tag:1'], tag: [2] } }, book: null },
    ],
    // `q` is NFC-normalised: a combining diaeresis becomes the precomposed letter.
    ['q=a%CC%88', { query: { ...DEFAULT, q: 'ä' }, book: null }],
    [
      'year=1990-2000&read=true',
      { query: { ...DEFAULT, filters: { read: true, year: [1990, 2000] } }, book: null },
    ],
  ])('parses %s', (search, expected) => {
    for (const address of both(search)) expect(address).toStrictEqual(expected)
    const href = shelfHref(expected.query, { book: expected.book })
    const params = new URLSearchParams(href.slice(href.indexOf('?') + 1))
    for (const dropped of ['page', 'foo']) expect(params.has(dropped)).toBe(false)
  })

  it('gives / for the default query and no book', () => {
    expect(parseShelfQuery({})).toStrictEqual({ query: DEFAULT, book: null })
    expect(shelfHref(DEFAULT)).toBe('/')
    expect(
      shelfHref(parseShelfQuery(new URLSearchParams('page=3&sort=author&dir=asc')).query),
    ).toBe('/')
  })

  it('writes the same shelf params for /data/shelf as for links, without book', () => {
    const query: ShelfQuery = { q: 'linna', filters: { location: [3] }, sort: 'title', dir: 'desc' }
    const params = shelfHref(query).slice('/?'.length)
    expect(params).toBe('q=linna&location=3&sort=title&dir=desc')
    expect(shelfRowsPath(query, { offset: 50, limit: 50 })).toBe(
      `/data/shelf?${params}&offset=50&limit=50`,
    )
  })
})

it('round trips distinct text themes with other address values and ignores empty themes', () => {
  const address = parseShelfQuery(
    new URLSearchParams(
      'theme=Seikkailu&theme=Oma&theme=Seikkailu&theme=&q=book&sort=title&book=12&tag=3',
    ),
  )
  expect(address.query.filters.theme).toEqual(['Seikkailu', 'Oma'])
  expect(
    parseShelfQuery(
      new URL(shelfHref(address.query, { book: address.book }), 'http://test').searchParams,
    ),
  ).toEqual(address)
})
