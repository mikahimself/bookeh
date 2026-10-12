import { describe, expect, it } from 'vitest'

import { mergeResults } from '@/lib/metadata/merge'
import type { Source, SourceResult } from '@/lib/metadata/source'

const ISBN = '9789510396266'
const NOW = new Date('2026-10-11T08:00:00.000Z')
const author = { name: 'Tove Jansson', sortName: 'Jansson, Tove' }

const finnaRecord: SourceResult = {
  isbn13: ISBN,
  title: 'A',
  authors: [author],
  publisher: '',
  subjects: [],
  themes: ['muumit'],
  source: 'finna',
  raw: { finna: 'F' },
}

const googleRecord: SourceResult = {
  isbn13: ISBN,
  title: 'B',
  authors: [{ name: 'Someone Else' }],
  publisher: 'P',
  pages: 300,
  subjects: ['Fiction'],
  themes: [],
  coverUrl: 'https://example.test/cover.jpg',
  source: 'google',
  raw: { google: 'G' },
}

const googleSecond: SourceResult = {
  ...googleRecord,
  title: 'Second',
  description: 'only in the second record',
  raw: { google: 'G2' },
}

const fake = (id: string, records: SourceResult[]): Source => ({
  id,
  lookupByIsbn: async () => records,
})

const lookup = (sources: Source[]) =>
  Promise.all(sources.map(async (s) => (await s.lookupByIsbn(ISBN)) ?? []))

describe('mergeResults', () => {
  it('fills each field from the first source that has it', async () => {
    const lists = await lookup([
      fake('finna', [finnaRecord]),
      fake('google', [googleRecord, googleSecond]),
    ])
    const { result } = mergeResults(lists, NOW)!

    expect(result).toMatchObject({
      title: 'A',
      authors: [author],
      publisher: 'P',
      pages: 300,
      subjects: ['Fiction'],
      themes: ['muumit'],
      coverUrl: googleRecord.coverUrl,
      source: 'finna',
    })
    expect(result.description).toBeUndefined()
  })

  it('takes the values of the first source that answered', async () => {
    const lists = await lookup([fake('finna', []), fake('google', [googleRecord])])
    const { result, raw } = mergeResults(lists, NOW)!

    expect(result).toEqual(googleRecord)
    expect(raw.sources).toEqual({ google: 'G' })
  })

  it('builds RawMetadata per source', async () => {
    const lists = await lookup([fake('finna', [finnaRecord]), fake('google', [googleRecord])])
    const { result, raw } = mergeResults(lists, NOW)!

    expect(result.raw).toEqual({ finna: 'F', google: 'G' })
    expect(raw).toEqual({
      v: 1,
      fetchedAt: NOW.toISOString(),
      sources: { finna: 'F', google: 'G' },
      subjects: { finna: [], google: ['Fiction'] },
      coverUrl: googleRecord.coverUrl,
    })
  })

  it('reports a missing cover as null', () => {
    expect(mergeResults([[finnaRecord]], NOW)!.raw.coverUrl).toBeNull()
  })

  it('returns null when no source has a record', async () => {
    expect(mergeResults([], NOW)).toBeNull()
    expect(mergeResults(await lookup([fake('finna', []), fake('google', [])]), NOW)).toBeNull()
  })
})
