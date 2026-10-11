import { readFileSync, readdirSync } from 'node:fs'

import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

import { logger } from '@/lib/errors'
import { finna } from '@/lib/metadata/sources/finna'

const FIXTURES = new URL('../fixtures/finna/', import.meta.url)

function fixture(isbn13: string): unknown {
  return JSON.parse(readFileSync(new URL(`${isbn13}.json`, FIXTURES), 'utf8'))
}

type Body = {
  records: {
    id: string
    subjects?: unknown[]
    series?: { name?: string; additional?: string }[]
    nonPresenterAuthors?: { name?: string }[]
  }[]
}

/** The record with this id; the fixtures are committed, so it is there. */
function record(body: Body, id: string): Body['records'][number] {
  return body.records.find((entry) => entry.id === id)!
}

/** Serves the recorded response for the ISBN in the request's `lookfor`, optionally edited. */
function serveFixtures(edit: (body: Body) => void = () => {}): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const lookfor = new URL(url).searchParams.get('lookfor') ?? ''
      const isbn13 = /isbn:"(\d{13})"/.exec(lookfor)?.[1] ?? ''
      const body = fixture(isbn13) as Body
      edit(body)
      return Response.json(body)
    }),
  )
}

let warn: MockInstance

beforeEach(() => {
  warn = vi.spyOn(logger(), 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('finna.lookupByIsbn', () => {
  beforeEach(() => serveFixtures())

  it('keeps only the record with the ISBN asked for, among other editions', async () => {
    const results = await finna.lookupByIsbn('9789524035699')

    expect(results).toStrictEqual([
      {
        isbn13: '9789524035699',
        title: 'Sapiens',
        subtitle: 'ihmisen lyhyt historia',
        authors: [{ name: 'Yuval Noah Harari', sortName: 'Harari, Yuval Noah' }],
        publisher: 'Bazar',
        year: 2024,
        language: 'fi',
        pages: 491,
        subjects: [],
        themes: [
          'ihminen',
          'evoluutio',
          'evoluutioteoria',
          'biologinen antropologia',
          'kulttuurievoluutio',
          'ihmiskunta',
          'sivilisaatio',
          'maailmanhistoria',
          'historia',
        ],
        binding: 'pehmeäkantinen',
        coverUrl: 'https://api.finna.fi/Cover/Show?source=Solr&id=helle.1637236&index=0&size=large',
        source: 'finna',
        raw: { finna: fixture('9789524035699') },
      },
    ])
  })

  it('orders several matches best first', async () => {
    const results = await finna.lookupByIsbn('9780007466061')

    expect(results).toHaveLength(2)
    expect(results[0].coverUrl).toContain('id=kirkes.399381')
    expect(results[0].binding).toBe('nidottu')
    expect(results[1]).not.toHaveProperty('coverUrl')
    expect(results[1]).not.toHaveProperty('binding')
  })

  it('puts a record with a cover first whatever Finna’s order', async () => {
    serveFixtures((body) => body.records.reverse())

    const [best] = await finna.lookupByIsbn('9780007466061')

    expect(best.coverUrl).toContain('id=kirkes.399381')
  })

  it('puts a record with subjects ahead of one without, when neither has a cover', async () => {
    // Finna lists heili (no binding) before eepos (`nidottu`); both have subjects.
    serveFixtures((body) => {
      body.records.find(({ id }) => id.startsWith('heili.'))!.subjects = []
    })

    const results = await finna.lookupByIsbn('9789515789631')

    expect(results.map(({ binding }) => binding)).toEqual(['nidottu', undefined])
  })

  it.each([
    ['9789517685535', ['Paulo Freire', 'Tuukka Tomperi', 'Juha Suoranta']], // "kirjoittaja, toimittaja"
    ['9789523521957', ['Veikka Lahtinen', 'Pontus Purokuru']], // afterword writer left out
    ['9780007448036', ['George R. R. Martin']], // "författare"
  ])('reads the author roles of %s', async (isbn13, names) => {
    const [result] = await finna.lookupByIsbn(isbn13)

    expect(result.authors.map(({ name }) => name)).toEqual(names)
  })

  it('leaves out a role-less translator and reads pages from the extent', async () => {
    const results = await finna.lookupByIsbn('9789515789631')

    expect(results.length).toBeGreaterThan(0)
    for (const result of results) {
      expect(result.authors).toEqual([{ name: 'Erlend Loe', sortName: 'Loe, Erlend' }])
      expect(result.pages).toBe(222)
    }
  })

  it('reads the older "s." page abbreviation', async () => {
    const [result] = await finna.lookupByIsbn('9789510397077')

    expect(result.pages).toBe(200)
  })

  it("takes the description from the record's first summary", async () => {
    const [result] = await finna.lookupByIsbn('9789511319177')

    expect(result.description).toMatch(/^Tähtitieteilijän oppipojan tie .* jää taakse\.$/)
  })

  it.each([
    ['9780007447831', 'A song of ice and fire', 2], // `Book 2`
    ['9789520453589', 'Keltainen kirjasto', 367], // numbered entry after `Keltainen pokkari`
    ['9789518581041', 'Kirjokansi', 223], // `223.`
  ])('reads the series of %s', async (isbn13, series, seriesIndex) => {
    const [result] = await finna.lookupByIsbn(isbn13)

    expect(result).toMatchObject({ series, seriesIndex })
  })

  it('takes the first series when no entry has a number', async () => {
    const [result] = await finna.lookupByIsbn('9789510397077')

    expect(result.series).toBe('Bon')
    expect(result).not.toHaveProperty('seriesIndex')
  })

  it('leaves series out when the record has none', async () => {
    const [result] = await finna.lookupByIsbn('9789524035699')

    expect(result).not.toHaveProperty('series')
    expect(result).not.toHaveProperty('seriesIndex')
  })

  it.each<[string, Body['records'][number]['series'], string, number | undefined]>([
    [
      'drops a qualifier',
      [{ name: 'Keltainen kirjasto (sarja)' }],
      'Keltainen kirjasto',
      undefined,
    ],
    [
      'drops a qualifier before a full stop',
      [{ name: 'Keltainen kirjasto (sarja).' }],
      'Keltainen kirjasto',
      undefined,
    ],
    ['reads a comma decimal', [{ name: 'Sarja', additional: '2,5' }], 'Sarja', 2.5],
  ])('%s in the series', async (_, entries, series, seriesIndex) => {
    serveFixtures((body) => {
      record(body, 'helle.1637236').series = entries
    })

    const [result] = await finna.lookupByIsbn('9789524035699')

    expect(result.series).toBe(series)
    expect(result.seriesIndex).toBe(seriesIndex)
  })

  it("reads themes from the record's subject headings, in order", async () => {
    const [result] = await finna.lookupByIsbn('9780007447831')

    expect(result.themes).toEqual([
      'Stark (fiktiivinen suku)',
      'Lannister (fiktiivinen suku)',
      'valtataistelu',
      'taistelut',
      'juonittelu',
      'kosto',
      'petos',
      'ritarit',
      'lohikäärmeet',
      'yliluonnolliset olennot',
      'sisällissodat',
      'kuningaskunnat',
      'Westeros (fiktiivinen paikka)',
    ])
  })

  it('joins a multi-part heading and drops repeats that differ only by a closing comma', async () => {
    const [result] = await finna.lookupByIsbn('9780007447848')

    expect(result.themes).toContain('kuningaskunnat Seitsemän kuningaskuntaa')
    expect(result.themes.filter((theme) => theme === 'Stark')).toHaveLength(1)
    expect(result.themes).toHaveLength(18)
  })

  it('drops the comma before a qualifier', async () => {
    const results = await finna.lookupByIsbn('9789515789631')

    const eepos = results.find(({ binding }) => binding === 'nidottu')
    expect(eepos?.themes).toContain('minä (fiktiivinen hahmo)')
  })

  it('drops the comma before a qualifier inside one part', async () => {
    // kirkes.399381: ["Stark,", "suku, (fiktiivinen hahmo)"]
    const [result] = await finna.lookupByIsbn('9780007466061')

    expect(result.themes).toContain('Stark suku (fiktiivinen hahmo)')
  })

  it('keeps the trailing full stop Finna gives', async () => {
    const [result] = await finna.lookupByIsbn('9789520408053')

    expect(result.themes).toContain('Poverty.')
  })

  it('reads no genre terms and leaves subjects and the raw body alone', async () => {
    const [result] = await finna.lookupByIsbn('9789510397077')

    expect(result.themes).not.toContain('pienoisromaanit')
    expect(result.subjects).toEqual([])
    expect(result.raw.finna).toEqual(fixture('9789510397077'))
  })

  it('drops the ENNAKKOTIETO mark of a preliminary record', async () => {
    serveFixtures((body) => {
      record(body, 'helle.1637236').subjects = [['Ranska', 'ENNAKKOTIETO']]
    })

    const [result] = await finna.lookupByIsbn('9789524035699')

    expect(result.themes).toEqual(['Ranska'])
  })

  it('gives no themes when the record has no subjects', async () => {
    serveFixtures((body) => {
      for (const entry of body.records) delete entry.subjects
    })

    const [result] = await finna.lookupByIsbn('9789524035699')

    expect(result.themes).toEqual([])
  })

  it.each<[string, string, Record<string, string>]>([
    [
      'drops a qualifier from',
      'Harari, Yuval Noah (historioitsija)',
      { name: 'Yuval Noah Harari', sortName: 'Harari, Yuval Noah' },
    ],
    ['gives no sortName to', 'Homeros', { name: 'Homeros' }],
  ])('%s the author name %s', async (_, name, author) => {
    serveFixtures((body) => {
      record(body, 'helle.1637236').nonPresenterAuthors![0].name = name
    })

    const [result] = await finna.lookupByIsbn('9789524035699')

    expect(result.authors).toStrictEqual([author])
  })

  const isbns = readdirSync(FIXTURES)
    .filter((file) => file.endsWith('.json'))
    .map((file) => file.replace(/\.json$/, ''))

  it.each(isbns)('maps %s within the contract', async (isbn13) => {
    const results = await finna.lookupByIsbn(isbn13)

    expect(results.length).toBeGreaterThan(0)
    for (const result of results) {
      expect(result.isbn13).toBe(isbn13)
      expect(result.title).not.toBe('')
      expect(result.authors.length).toBeGreaterThan(0)
      expect(result.authors.every(({ name }) => !name.includes(','))).toBe(true)
      for (const { sortName } of result.authors) {
        if (sortName !== undefined) expect(sortName).toMatch(/^[^,]+, [^,]+$/)
      }
      if (result.seriesIndex !== undefined) expect(result).toHaveProperty('series')
      const { raw: _raw, ...fields } = result
      for (const text of texts(fields)) {
        expect(text).toBe(text.normalize('NFC').trim())
        expect(text).not.toBe('')
      }
    }
    expect(warn).not.toHaveBeenCalled()
  })
})

function texts(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(texts)
  if (typeof value === 'object' && value !== null) return Object.values(value).flatMap(texts)
  return []
}

describe('finna.lookupByIsbn without a usable answer', () => {
  const stubFetch = (impl: () => Promise<Response>) => vi.stubGlobal('fetch', vi.fn(impl))

  it.each([
    ['records: []', { resultCount: 0, status: 'OK', records: [] }],
    ['records left out', { resultCount: 0, status: 'OK' }],
  ])('answers nothing for an empty result (%s), without logging', async (_, body) => {
    stubFetch(async () => Response.json(body))

    expect(await finna.lookupByIsbn('9789524035699')).toEqual([])
    expect(warn).not.toHaveBeenCalled()
  })

  it.each<[string, () => Promise<Response>]>([
    ['fetch rejects', () => Promise.reject(new TypeError('fetch failed'))],
    ['HTTP 500', async () => new Response('oops', { status: 500 })],
    ['body is not JSON', async () => new Response('not json')],
    ['status is not OK', async () => Response.json({ status: 'ERROR' })],
    ['records is not an array', async () => Response.json({ status: 'OK', records: {} })],
  ])('answers nothing when %s, logging once', async (_, impl) => {
    stubFetch(impl)

    await expect(finna.lookupByIsbn('9789524035699')).resolves.toEqual([])
    expect(warn).toHaveBeenCalledOnce()
  })
})
