import { randomUUID } from 'node:crypto'

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { lookupBook, retryLookup } from '@/lib/catalogue/lookupBook'
import { LOOKUP_LIMIT } from '@/lib/catalogue/lookupLimit'
import type { Source, SourceResult } from '@/lib/metadata/source'
import type { Context } from '@/lib/payload/context'

import { contextFor, createUser } from '../helpers/harness'
import { randomIsbn } from '../helpers/isbn'

// AD-11 and the partial Answer: the real lookup and its cache, with fake
// sources. A held partial outcome keeps `failed` until `retryLookup` replaces it.

const fakes = vi.hoisted(() => [] as Source[])
vi.mock('@/lib/metadata/sources', () => ({ sources: fakes }))

type Answer = 'found' | 'failed'

const record = (isbn13: string, source: string): SourceResult => ({
  isbn13,
  title: `Book ${randomUUID().slice(0, 8)}`,
  authors: [],
  subjects: [],
  themes: [],
  source,
  recordId: `${source}.1`,
  raw: { [source]: {} },
})

describe('a partial lookup', () => {
  let ctx: Context
  const answers: Record<string, Answer> = {}

  const fake = (id: string): Source => ({
    id,
    lookupByIsbn: async (isbn13) => (answers[id] === 'found' ? [record(isbn13, id)] : undefined),
  })

  beforeAll(async () => {
    ctx = await contextFor(await createUser({ displayName: 'Partial Lookup User' }))
    fakes.push(fake('finna'), fake('google'))
  })

  beforeEach(() => {
    answers.finna = 'failed'
    answers.google = 'found'
  })

  it('keeps `failed` on the held outcome, past the source healing', async () => {
    const isbn = randomIsbn()
    const first = await lookupBook(ctx, { isbn })
    expect(first).toMatchObject({ kind: 'source', failed: ['finna'] })

    answers.finna = 'found'
    expect(await lookupBook(ctx, { isbn })).toEqual(first)
  })

  it('is replaced by a retry the source answers', async () => {
    const isbn = randomIsbn()
    await lookupBook(ctx, { isbn })

    answers.finna = 'found'
    await retryLookup(ctx, isbn)

    const result = await lookupBook(ctx, { isbn })
    expect(result).toMatchObject({ kind: 'source', failed: [] })
    expect(result).toHaveProperty('candidates.0.source', 'finna')
  })

  it('stays held when every source fails the retry', async () => {
    const isbn = randomIsbn()
    const first = await lookupBook(ctx, { isbn })

    answers.google = 'failed'
    expect(await retryLookup(ctx, isbn)).toEqual(['finna', 'google'])

    expect(await lookupBook(ctx, { isbn })).toEqual(first)
  })

  it('counts a retry against the lookup limit, and a refused one keeps the Answer', async () => {
    const limited = await contextFor(await createUser({ displayName: 'Partial Limit User' }))
    const isbn = randomIsbn()
    const first = await lookupBook(limited, { isbn })

    answers.finna = 'found'
    for (let i = 1; i < LOOKUP_LIMIT; i++) await lookupBook(limited, { isbn })
    await expect(retryLookup(limited, isbn)).rejects.toMatchObject({ code: 'RATE_LIMITED' })

    expect(await lookupBook(ctx, { isbn })).toEqual(first)
  })
})
