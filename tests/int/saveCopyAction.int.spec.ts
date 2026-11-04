import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'

import { cookies, headers } from 'next/headers'
import { getPayload, type Payload } from 'payload'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { undoAction } from '@/app/(frontend)/actions/undo'
import { saveCopyAction, saveManualAction } from '@/app/(frontend)/scan/actions'
import { LOOKUP_LIMIT, limitLookups } from '@/lib/catalogue/lookupLimit'
import { lookupSources } from '@/lib/metadata/lookup'
import config from '@/payload.config'
import type { User, UserLocation } from '@/payload-types'

import { contextFor, createUser } from '../helpers/harness'
import { randomIsbn } from '../helpers/isbn'

// The action behind Add to library. A shared Book already holds the ISBN, so
// the save asks no source.

vi.mock('next/headers', () => ({ headers: vi.fn(), cookies: vi.fn() }))

const password = 'save-copy-action-password'

let requestHeaders: Headers

describe('saveCopyAction', () => {
  let payload: Payload
  let user: User
  let location: UserLocation
  let isbn13: string

  const copies = async () =>
    (
      await payload.find({
        collection: 'copies',
        where: { owner: { equals: user.id } },
        overrideAccess: true,
        depth: 0,
        pagination: false,
      })
    ).docs

  beforeAll(async () => {
    payload = await getPayload({ config })
    vi.mocked(headers).mockImplementation(async () => requestHeaders as never)
    vi.mocked(cookies).mockImplementation(async () => ({ get: () => undefined }) as never)
  })

  beforeEach(async () => {
    const created = await createUser({ password, displayName: 'Save Copy Action' })
    location = await payload.create({
      collection: 'locations',
      data: { owner: created.id, name: 'Tampere', nameKey: '' },
      overrideAccess: false,
      depth: 0,
      req: (await contextFor(created)).req,
    })
    user = await payload.update({
      collection: 'users',
      id: created.id,
      data: { defaultLocation: location.id },
      overrideAccess: true,
    })
    isbn13 = randomIsbn()
    await payload.create({
      collection: 'books',
      data: { title: 'Seitsemän veljestä', isbn13, visibility: 'shared' },
      overrideAccess: true,
      depth: 0,
    })
    const login = await payload.login({
      collection: 'users',
      data: { email: user.email, password },
    })
    if (!login.token) throw new Error('login returned no token')
    requestHeaders = new Headers({ cookie: `payload-token=${login.token}` })
  })

  it('saves one owned copy at the default location, once per requestId', async () => {
    const input = { requestId: randomUUID(), target: { isbn13 } }

    const result = await saveCopyAction(input)
    expect(result).toEqual({
      ok: true,
      data: {
        bookId: expect.any(Number),
        copyId: expect.any(Number),
        savedTo: { id: location.id, name: 'Tampere' },
        undoToken: expect.any(String),
        undoSeconds: expect.any(Number),
      },
    })
    expect(await copies()).toMatchObject([{ status: 'owned', location: location.id }])

    expect(await saveCopyAction(input)).toMatchObject({
      ok: true,
      data: { copyId: result.ok ? result.data.copyId : -1 },
    })
    expect(await copies()).toHaveLength(1)
  })

  it('undoes the save with its token once', async () => {
    const result = await saveCopyAction({ requestId: randomUUID(), target: { isbn13 } })
    if (!result.ok) throw new Error(`save failed: ${result.code}`)

    expect(await undoAction(result.data.undoToken)).toEqual({ ok: true, data: null })
    expect(await copies()).toEqual([])
    expect(await undoAction(result.data.undoToken)).toEqual({ ok: false, code: 'UNDO_FAILED' })
  })

  it('adds another owned copy of a Book the user already holds', async () => {
    expect(await saveCopyAction({ requestId: randomUUID(), target: { isbn13 } })).toMatchObject({
      ok: true,
    })

    expect(await saveCopyAction({ requestId: randomUUID(), target: { isbn13 } })).toMatchObject({
      ok: true,
      data: { savedTo: { id: location.id, name: 'Tampere' } },
    })
    expect(await copies()).toMatchObject([
      { status: 'owned', location: location.id },
      { status: 'owned', location: location.id },
    ])
  })

  // I12: the Answer for a Book with no ISBN saves by id, gated by `requireOwnBook()`.
  it('adds one more owned copy of a Book the user holds, by id', async () => {
    const first = await saveCopyAction({ requestId: randomUUID(), target: { isbn13 } })
    if (!first.ok) throw new Error(`save failed: ${first.code}`)

    expect(
      await saveCopyAction({ requestId: randomUUID(), target: { bookId: first.data.bookId } }),
    ).toMatchObject({ ok: true, data: { savedTo: { id: location.id, name: 'Tampere' } } })
    expect(await copies()).toHaveLength(2)
  })

  it('answers NOT_FOUND for a bookId the user holds nothing of', async () => {
    const other = await payload.create({
      collection: 'books',
      data: { title: 'Ei hallussa', isbn13: randomIsbn(), visibility: 'shared' },
      overrideAccess: true,
      depth: 0,
    })
    expect(await saveCopyAction({ requestId: randomUUID(), target: { bookId: other.id } })).toEqual(
      { ok: false, code: 'NOT_FOUND' },
    )
    expect(await copies()).toEqual([])
  })

  it.each([
    ['a malformed input', { target: { isbn13: 5 } }],
    ['a target of no kind', { requestId: randomUUID(), target: {} }],
    [
      'a target of two kinds',
      { requestId: randomUUID(), target: { isbn13: '9789510396353', bookId: 1 } },
    ],
    ['a bookId that is not a row id', { requestId: randomUUID(), target: { bookId: 'x' } }],
    [
      'a manual target, which only the entry save takes',
      { requestId: randomUUID(), target: { manual: { title: 'Kotiseutu', author: 'A. K' } } },
    ],
    ['no input', undefined],
    ['an ISBN saveCopy refuses', { requestId: randomUUID(), target: { isbn13: 'not an isbn' } }],
  ])('answers SAVE_FAILED for %s and writes nothing', async (_, input) => {
    expect(await saveCopyAction(input)).toEqual({ ok: false, code: 'SAVE_FAILED' })
    expect(await copies()).toEqual([])
  })

  it('ignores pick and candidate once a shared Book holds the ISBN', async () => {
    const candidate = { source: 'finna', recordId: 'not.in.any.outcome' }
    expect(
      await saveCopyAction({ requestId: randomUUID(), target: { isbn13, pick: 1, candidate } }),
    ).toMatchObject({ ok: true })
    expect(await copies()).toMatchObject([{ status: 'owned', location: location.id }])
  })

  it.each(['1', -1, 1.5])('answers SAVE_FAILED for pick %s and writes nothing', async (pick) => {
    expect(await saveCopyAction({ requestId: randomUUID(), target: { isbn13, pick } })).toEqual({
      ok: false,
      code: 'SAVE_FAILED',
    })
    expect(await copies()).toEqual([])
  })

  it.each([
    ['a string', 'finna.1'],
    ['an empty recordId', { source: 'finna', recordId: '' }],
    ['no source', { recordId: 'finna.1' }],
  ])('answers SAVE_FAILED for a candidate that is %s and writes nothing', async (_, candidate) => {
    expect(
      await saveCopyAction({ requestId: randomUUID(), target: { isbn13, candidate } }),
    ).toEqual({
      ok: false,
      code: 'SAVE_FAILED',
    })
    expect(await copies()).toEqual([])
  })

  it("creates the Book from the picked edition's values", async () => {
    // Finna's two records for a fresh ISBN; the second has no cover.
    const fresh = randomIsbn()
    const body = readFileSync(
      new URL('../fixtures/finna/9780007466061.json', import.meta.url),
      'utf8',
    )
      .replaceAll('9780007466061', fresh)
      .replaceAll('978-0-00-746606-1', fresh)
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = new URL(String(input))
        if (url.hostname === 'api.finna.fi' && url.pathname.endsWith('/v1/search')) {
          return new Response(body, { headers: { 'Content-Type': 'application/json' } })
        }
        if (url.hostname === 'www.googleapis.com') return Response.json({ totalItems: 0 })
        // Open Library joins the fan-out when OPEN_LIBRARY_CONTACT is set; `{}` is its
        // answer for an ISBN it does not hold.
        if (url.hostname === 'openlibrary.org') return Response.json({})
        if (url.hostname === 'api.hardcover.app') return Response.json({ data: { editions: [] } })
        return new Response(null, { status: 404 })
      }),
    )
    try {
      const result = await saveCopyAction({
        requestId: randomUUID(),
        target: { isbn13: fresh, pick: 1 },
      })
      if (!result.ok) throw new Error(`save failed: ${result.code}`)
      const book = await payload.findByID({
        collection: 'books',
        id: result.data.bookId,
        overrideAccess: true,
        depth: 0,
      })
      expect(book).toMatchObject({ isbn13: fresh, rawMetadata: { coverUrl: null } })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("takes Finna's values before Google's, Google filling the gaps", async () => {
    // Both sources know the book; Finna's record has no summary, Google's volume a description.
    const fresh = randomIsbn()
    const fixture = (name: string) =>
      readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8').replaceAll(
        '9780007447831',
        fresh,
      )
    const finnaBody = fixture('finna/9780007447831.json')
    const volume = JSON.parse(fixture('google/volumes/zlwlTfBeiSoC.json')) as unknown
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = new URL(String(input))
        if (url.hostname === 'api.finna.fi' && url.pathname.endsWith('/v1/search')) {
          return new Response(finnaBody, { headers: { 'Content-Type': 'application/json' } })
        }
        if (url.hostname === 'www.googleapis.com') {
          return Response.json({ kind: 'books#volumes', totalItems: 1, items: [volume] })
        }
        // Open Library joins the fan-out when OPEN_LIBRARY_CONTACT is set; `{}` is its
        // answer for an ISBN it does not hold.
        if (url.hostname === 'openlibrary.org') return Response.json({})
        if (url.hostname === 'api.hardcover.app') return Response.json({ data: { editions: [] } })
        return new Response(null, { status: 404 })
      }),
    )
    try {
      const result = await saveCopyAction({ requestId: randomUUID(), target: { isbn13: fresh } })
      if (!result.ok) throw new Error(`save failed: ${result.code}`)
      const book = await payload.findByID({
        collection: 'books',
        id: result.data.bookId,
        overrideAccess: true,
        depth: 0,
      })
      expect(book).toMatchObject({ title: 'A clash of kings', source: 'finna' })
      expect(book.description).toContain("George R. R. Martin's superb fantasy epic")
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('answers NOT_FOUND and writes nothing when the candidate sent is not in the outcome', async () => {
    const fresh = randomIsbn()
    const body = readFileSync(
      new URL('../fixtures/finna/9780007466061.json', import.meta.url),
      'utf8',
    )
      .replaceAll('9780007466061', fresh)
      .replaceAll('978-0-00-746606-1', fresh)
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = new URL(String(input))
        if (url.hostname === 'api.finna.fi' && url.pathname.endsWith('/v1/search')) {
          return new Response(body, { headers: { 'Content-Type': 'application/json' } })
        }
        if (url.hostname === 'www.googleapis.com') return Response.json({ totalItems: 0 })
        // Open Library joins the fan-out when OPEN_LIBRARY_CONTACT is set; `{}` is its
        // answer for an ISBN it does not hold.
        if (url.hostname === 'openlibrary.org') return Response.json({})
        if (url.hostname === 'api.hardcover.app') return Response.json({ data: { editions: [] } })
        return new Response(null, { status: 404 })
      }),
    )
    try {
      expect(
        await saveCopyAction({
          requestId: randomUUID(),
          target: { isbn13: fresh, candidate: { source: 'finna', recordId: 'not.in.outcome' } },
        }),
      ).toEqual({ ok: false, code: 'NOT_FOUND' })
    } finally {
      vi.unstubAllGlobals()
    }
    expect(await copies()).toEqual([])
    const { totalDocs } = await payload.count({
      collection: 'books',
      where: { isbn13: { equals: fresh } },
      overrideAccess: true,
    })
    expect(totalDocs).toBe(0)
  })

  it('answers NOT_FOUND and writes nothing when no source knows the ISBN', async () => {
    const fresh = randomIsbn()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = new URL(String(input))
        if (url.hostname === 'api.finna.fi') return Response.json({ resultCount: 0, status: 'OK' })
        if (url.hostname === 'www.googleapis.com') return Response.json({ totalItems: 0 })
        // Open Library joins the fan-out when OPEN_LIBRARY_CONTACT is set; `{}` is its
        // answer for an ISBN it does not hold.
        if (url.hostname === 'openlibrary.org') return Response.json({})
        if (url.hostname === 'api.hardcover.app') return Response.json({ data: { editions: [] } })
        return new Response(null, { status: 404 })
      }),
    )
    try {
      expect(await saveCopyAction({ requestId: randomUUID(), target: { isbn13: fresh } })).toEqual({
        ok: false,
        code: 'NOT_FOUND',
      })
    } finally {
      vi.unstubAllGlobals()
    }
    expect(await copies()).toEqual([])
    const { totalDocs } = await payload.count({
      collection: 'books',
      where: { isbn13: { equals: fresh } },
      overrideAccess: true,
    })
    expect(totalDocs).toBe(0)
  })

  // The source fan-out behind the save: `lookupSources` is the real one here, so what Open
  // Library answers decides the outcome the action then acts on.
  it('reads Open Library\'s `{}` as "answered, has none" and its 500 as a failure', async () => {
    const stub = (openLibrary: () => Response) =>
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: string | URL) => {
          const url = new URL(String(input))
          if (url.hostname === 'api.finna.fi')
            return Response.json({ resultCount: 0, status: 'OK' })
          if (url.hostname === 'www.googleapis.com') return Response.json({ totalItems: 0 })
          if (url.hostname === 'openlibrary.org') return openLibrary()
          if (url.hostname === 'api.hardcover.app') return Response.json({ data: { editions: [] } })
          return new Response(null, { status: 404 })
        }),
      )
    try {
      // `{}` is an answer, not a failure: the outcome stays what the other two made it.
      stub(() => Response.json({}))
      expect(await lookupSources(randomIsbn())).toEqual({ kind: 'none' })

      // A 500 is a failure, so the ISBN is unavailable rather than unknown.
      stub(() => new Response(null, { status: 500 }))
      expect(await lookupSources(randomIsbn())).toEqual({
        kind: 'unavailable',
        failed: ['openlibrary'],
      })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('answers SAVE_FAILED and writes nothing when the sources cannot be asked', async () => {
    const fresh = randomIsbn()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 503 })),
    )
    try {
      expect(await saveCopyAction({ requestId: randomUUID(), target: { isbn13: fresh } })).toEqual({
        ok: false,
        code: 'SAVE_FAILED',
      })
    } finally {
      vi.unstubAllGlobals()
    }
    expect(await copies()).toEqual([])
  })

  it('answers RATE_LIMITED, not SAVE_FAILED, at the lookup limit and asks no source', async () => {
    const ctx = await contextFor(user)
    for (let i = 0; i < LOOKUP_LIMIT; i++) limitLookups(ctx)
    const sources = vi.fn(async () => new Response(null, { status: 503 }))
    vi.stubGlobal('fetch', sources)
    try {
      expect(
        await saveCopyAction({ requestId: randomUUID(), target: { isbn13: randomIsbn() } }),
      ).toEqual({
        ok: false,
        code: 'RATE_LIMITED',
      })
    } finally {
      vi.unstubAllGlobals()
    }
    expect(sources).not.toHaveBeenCalled()
    expect(await copies()).toEqual([])
  })

  it('answers UNAUTHENTICATED without a session', async () => {
    requestHeaders = new Headers()
    expect(await saveCopyAction({ requestId: randomUUID(), target: { isbn13 } })).toEqual({
      ok: false,
      code: 'UNAUTHENTICATED',
    })
    expect(await copies()).toEqual([])
  })

  describe('saveManualAction', () => {
    const book = async (id: number) =>
      payload.findByID({ collection: 'books', id, overrideAccess: true, depth: 0 })

    it('saves a private Book with the typed ISBN and an owned copy at the default location', async () => {
      const typed = randomIsbn()
      const result = await saveManualAction({
        requestId: randomUUID(),
        isbn13: typed,
        title: 'Kotiseutu',
        author: 'A. Kirjoittaja',
      })
      expect(result).toMatchObject({
        ok: true,
        data: { savedTo: { id: location.id, name: 'Tampere' } },
      })
      if (!result.ok) return
      expect(await book(result.data.bookId)).toMatchObject({
        isbn13: typed,
        title: 'Kotiseutu',
        visibility: 'private',
      })
      expect(await copies()).toMatchObject([{ status: 'owned', location: location.id }])
    })

    it('saves a Book with no ISBN', async () => {
      const result = await saveManualAction({
        requestId: randomUUID(),
        title: 'Kotiseutu',
        author: 'A. Kirjoittaja',
      })
      if (!result.ok) throw new Error(`save failed: ${result.code}`)
      expect(await book(result.data.bookId)).toMatchObject({ isbn13: null, visibility: 'private' })
      expect(await copies()).toHaveLength(1)
    })

    it('undoes the save: the copy and the private Book are gone', async () => {
      const result = await saveManualAction({
        requestId: randomUUID(),
        title: 'Kotiseutu',
        author: 'A. Kirjoittaja',
      })
      if (!result.ok) throw new Error(`save failed: ${result.code}`)

      expect(await undoAction(result.data.undoToken)).toEqual({ ok: true, data: null })
      expect(await copies()).toEqual([])
      await expect(book(result.data.bookId)).rejects.toThrow()
    })

    it('answers VALIDATION with the blank fields and writes nothing', async () => {
      expect(await saveManualAction({ requestId: randomUUID(), title: ' ', author: '' })).toEqual({
        ok: false,
        code: 'VALIDATION',
        fields: { title: 'VALIDATION', authors: 'VALIDATION' },
      })
      expect(await copies()).toEqual([])
    })

    it('answers SAVE_FAILED for a malformed input', async () => {
      expect(await saveManualAction({ requestId: randomUUID(), title: 'x' })).toEqual({
        ok: false,
        code: 'SAVE_FAILED',
      })
    })

    it('answers SAVE_FAILED for an ISBN saveCopy refuses and writes nothing', async () => {
      expect(
        await saveManualAction({
          requestId: randomUUID(),
          isbn13: 'abc',
          title: 'Kotiseutu',
          author: 'A. Kirjoittaja',
        }),
      ).toEqual({ ok: false, code: 'SAVE_FAILED' })
      expect(await copies()).toEqual([])
    })

    it('answers UNAUTHENTICATED without a session', async () => {
      requestHeaders = new Headers()
      expect(
        await saveManualAction({
          requestId: randomUUID(),
          title: 'Kotiseutu',
          author: 'A. Kirjoittaja',
        }),
      ).toEqual({ ok: false, code: 'UNAUTHENTICATED' })
      expect(await copies()).toEqual([])
    })
  })
})
