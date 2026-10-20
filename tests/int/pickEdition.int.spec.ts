import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'

import { getPayload, type Payload } from 'payload'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { lookupBook } from '@/lib/catalogue/lookupBook'
import { saveCopy } from '@/lib/catalogue/saveCopy'
import type { Context } from '@/lib/payload/context'
import config from '@/payload.config'

import { contextFor, createUser } from '../helpers/harness'
import { randomIsbn } from '../helpers/isbn'

// Pick the edition (D-7, FR-11) through the real Finna adapter and
// `lookupSources`: Finna's two records for one ISBN become two candidates, and
// a save with `pick` builds the shared Book from the one picked, keeping the
// ISBN asked for. Only `fetch` is faked: Finna answers the recorded response
// under a fresh ISBN, Google knows nothing, and every cover is a 404.

const FIXTURE = readFileSync(
  new URL('../fixtures/finna/9780007466061.json', import.meta.url),
  'utf8',
)

describe('pick the edition', () => {
  let payload: Payload
  let ctx: Context
  let isbn: string

  const save = (pick: number) =>
    saveCopy(ctx, {
      requestId: randomUUID(),
      target: { isbn13: isbn, pick },
      save: { kind: 'copy' },
    })

  const bookOf = async (bookId: number) =>
    payload.findByID({ collection: 'books', id: bookId, overrideAccess: true, depth: 0 })

  beforeAll(async () => {
    payload = await getPayload({ config })
    ctx = await contextFor(await createUser({ displayName: 'Pick Edition User' }))
  })

  beforeEach(() => {
    // A fresh ISBN per test, so no cached outcome or shared Book carries over.
    isbn = randomIsbn()
    const body = FIXTURE.replaceAll('9780007466061', isbn).replaceAll('978-0-00-746606-1', isbn)
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = new URL(String(input))
        if (url.hostname === 'api.finna.fi' && url.pathname.endsWith('/v1/search')) {
          return new Response(body, { headers: { 'Content-Type': 'application/json' } })
        }
        if (url.hostname === 'www.googleapis.com') return Response.json({ totalItems: 0 })
        return new Response(null, { status: 404 })
      }),
    )
    vi.spyOn(payload.logger, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("answers both of Finna's records, the covered one first", async () => {
    const result = await lookupBook(ctx, { isbn })
    expect(result).toMatchObject({ kind: 'source', pick: 0 })
    if (result.kind !== 'source') throw new Error('unreachable')
    expect(result.candidates).toHaveLength(2)
    expect(result.candidates[0]).toMatchObject({ isbn13: isbn, binding: 'nidottu', hasCover: true })
    expect(result.candidates[1]).toMatchObject({ isbn13: isbn, hasCover: false })
  })

  it('creates the shared Book from the picked candidate, keeping the ISBN', async () => {
    const { bookId } = await save(1)
    const book = await bookOf(bookId)
    expect(book).toMatchObject({ isbn13: isbn, pages: 690, visibility: 'shared' })
    expect(book.cover ?? null).toBeNull()
    expect(book.rawMetadata).toMatchObject({ coverUrl: null })
  })

  it('creates it from the best candidate for a pick out of range', async () => {
    const { bookId } = await save(5)
    const book = await bookOf(bookId)
    expect(book).toMatchObject({ isbn13: isbn, pages: 690 })
    // The best candidate's cover, which the 404 kept from being stored.
    expect(book.rawMetadata).toMatchObject({
      coverUrl: expect.stringContaining('/Cover/Show?source=Solr&id=kirkes.399381'),
    })
    expect(book.cover ?? null).toBeNull()
  })
})
