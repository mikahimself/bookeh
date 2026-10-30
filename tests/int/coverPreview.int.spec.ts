import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { headers } from 'next/headers'
import { getPayload, type Payload } from 'payload'
import sharp from 'sharp'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { GET } from '@/app/(frontend)/data/cover/[isbn13]/route'
import {
  fetchCoverPreview,
  PREVIEW_SIZE,
  PREVIEW_TTL_MS,
  recordCoverPreview,
} from '@/lib/catalogue/coverPreview'
import { coverPolicy } from '@/lib/catalogue/covers'
import { lookupBook } from '@/lib/catalogue/lookupBook'
import { LOOKUP_LIMIT, limitLookups } from '@/lib/catalogue/lookupLimit'
import { lookupSources } from '@/lib/metadata/lookup'
import type { SourceResult, SourcesOutcome } from '@/lib/metadata/source'
import type { Context } from '@/lib/payload/context'
import config from '@/payload.config'

import { contextFor, createUser } from '../helpers/harness'
import { randomIsbn } from '../helpers/isbn'

// The pre-save cover preview, AD-9/AD-10/AD-14: `lookupBook` records every
// candidate's cover URL per user; `/data/cover/[isbn13]?pick=` fetches one
// with the cover download's checks, counting one lookup per record (and
// again after a failed fetch), and holds it. The
// source is a local fixture server, which the mocked `coverPolicy` allows;
// `lookupSources` is faked.

const fixture = vi.hoisted(() => ({ origin: '' }))

vi.mock('next/headers', () => ({ headers: vi.fn() }))
vi.mock('@/lib/metadata/lookup', () => ({ lookupSources: vi.fn() }))
vi.mock('@/lib/catalogue/covers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/catalogue/covers')>()
  return {
    ...actual,
    coverPolicy: { ...actual.coverPolicy, allows: (url: URL) => url.origin === fixture.origin },
  }
})

const password = 'cover-preview-password'

const candidate = (isbn13: string, coverUrl?: string): SourceResult => ({
  isbn13,
  title: 'Seitsemän veljestä',
  authors: [],
  subjects: [],
  themes: [],
  source: 'finna',
  recordId: 'finna.1',
  raw: { finna: {} },
  ...(coverUrl !== undefined && { coverUrl }),
})

const found = (...candidates: SourceResult[]): SourcesOutcome => ({
  kind: 'found',
  failed: [],
  candidates,
  raw: {
    v: 1,
    fetchedAt: '2026-10-20T00:00:00.000Z',
    sources: {},
    subjects: {},
    coverUrl: candidates[0]?.coverUrl ?? null,
  },
})

let requestHeaders: Headers

describe('cover preview', () => {
  let payload: Payload
  let asA: Context
  let asB: Context
  let cookieA: string
  let server: Server
  let jpeg: Buffer
  let png: Buffer
  const hits = new Map<string, number>()

  const totalHits = () => [...hits.values()].reduce((a, b) => a + b, 0)
  const at = (route: string) => `${fixture.origin}${route}`

  /** Looks up a fresh ISBN as `ctx`, the sources answering `coverUrls` as candidates. */
  const lookUp = async (ctx: Context, coverUrls: (string | undefined)[], pick?: number) => {
    const isbn = randomIsbn()
    vi.mocked(lookupSources).mockResolvedValue(
      found(...coverUrls.map((url) => candidate(isbn, url))),
    )
    await lookupBook(ctx, { isbn, ...(pick !== undefined && { pick }) })
    return isbn
  }

  const get = (isbn13: string, cookie?: string, query = '') => {
    requestHeaders = new Headers(cookie ? { cookie } : {})
    return GET(new Request(`http://localhost/data/cover/${isbn13}${query}`), {
      params: Promise.resolve({ isbn13 }),
    })
  }

  /** A new signed-in user: its context and session cookie. */
  const signedIn = async (displayName: string) => {
    const user = await createUser({ password, displayName })
    const login = await payload.login({
      collection: 'users',
      data: { email: user.email, password },
    })
    if (!login.token) throw new Error('login returned no token')
    return { ctx: await contextFor(user), cookie: `payload-token=${login.token}` }
  }

  beforeAll(async () => {
    payload = await getPayload({ config })
    vi.mocked(headers).mockImplementation(async () => requestHeaders as never)

    const a = await signedIn('Preview User A')
    asA = a.ctx
    cookieA = a.cookie
    asB = await contextFor(await createUser({ displayName: 'Preview User B' }))

    jpeg = await sharp({
      create: { width: 4, height: 6, channels: 3, background: { r: 20, g: 90, b: 160 } },
    })
      .jpeg()
      .toBuffer()
    png = await sharp({
      create: { width: 4, height: 6, channels: 3, background: { r: 160, g: 90, b: 20 } },
    })
      .png()
      .toBuffer()

    server = createServer((req, res) => {
      const route = req.url ?? ''
      hits.set(route, (hits.get(route) ?? 0) + 1)
      switch (route) {
        case '/cover.jpg':
          res.writeHead(200, { 'Content-Type': 'image/jpeg' }).end(jpeg)
          return
        case '/other.png':
          res.writeHead(200, { 'Content-Type': 'image/png' }).end(png)
          return
        case '/page.html':
          res.writeHead(200, { 'Content-Type': 'text/html' }).end('<html><body>Hi</body></html>')
          return
        case '/big.jpg':
          res.writeHead(200, { 'Content-Type': 'image/jpeg' }).end(Buffer.alloc(4096))
          return
        case '/moved.jpg':
          res.writeHead(302, { Location: '/cover.jpg' }).end()
          return
        default:
          res.writeHead(404).end('Not found')
      }
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    fixture.origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  beforeEach(() => {
    vi.mocked(lookupSources).mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  afterAll(async () => {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  })

  it('serves the looked-up cover to the same user, checked and not cached by the browser', async () => {
    const isbn = await lookUp(asA, [at('/cover.jpg')])
    const response = await get(isbn, cookieA)
    expect(response.status).toBe(200)
    expect(Buffer.from(await response.arrayBuffer()).equals(jpeg)).toBe(true)
    expect(Object.fromEntries(response.headers)).toMatchObject({
      'content-type': 'image/jpeg',
      'content-length': String(jpeg.length),
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    })
  })

  // The limit is in process and shared by every test in the run, so the
  // counting cases have their own users.
  it('asks the source once per image, whichever pick points at it, across a re-lookup', async () => {
    const { ctx, cookie } = await signedIn('Preview User Held')
    const isbn = await lookUp(ctx, [at('/cover.jpg'), at('/other.png'), at('/cover.jpg')])
    const before = hits.get('/cover.jpg') ?? 0

    for (const query of ['', '', '?pick=2']) {
      const response = await get(isbn, cookie, query)
      expect(response.status).toBe(200)
      expect(Buffer.from(await response.arrayBuffer()).equals(jpeg)).toBe(true)
    }
    expect(hits.get('/cover.jpg')).toBe(before + 1)

    vi.mocked(lookupSources).mockResolvedValue(found(candidate(isbn, at('/cover.jpg'))))
    await lookupBook(ctx, { isbn })
    expect((await get(isbn, cookie)).status).toBe(200)
    expect(hits.get('/cover.jpg')).toBe(before + 1)
  })

  it('counts one lookup per record, and answers 429 without a request past the limit', async () => {
    const { ctx, cookie } = await signedIn('Preview User Limited')
    const isbn = await lookUp(ctx, [at('/cover.jpg'), at('/other.png')])
    // The lookup counted one; one lookup remains.
    for (let i = 2; i < LOOKUP_LIMIT; i++) limitLookups(ctx)

    // Loading at once, the record's covers take the last lookup between them.
    const both = await Promise.all([get(isbn, cookie), get(isbn, cookie, '?pick=1')])
    expect(both.map((response) => response.status)).toEqual([200, 200])
    const before = totalHits()

    const other = randomIsbn()
    recordCoverPreview(ctx, other, [at('/cover.jpg')])
    const refused = await get(other, cookie)
    expect(refused.status).toBe(429)
    expect(await refused.text()).toBe('')
    const held = await get(isbn, cookie)
    expect(held.status).toBe(200)
    expect(Buffer.from(await held.arrayBuffer()).equals(jpeg)).toBe(true)
    expect(totalHits()).toBe(before)
  })

  it('counts a cover whose fetch failed again, and does not hold it', async () => {
    const { ctx, cookie } = await signedIn('Preview User Failed')
    vi.spyOn(payload.logger, 'warn').mockImplementation(() => {})
    const isbn = await lookUp(ctx, [at('/missing.jpg'), at('/cover.jpg')])
    const before = hits.get('/missing.jpg') ?? 0
    expect((await get(isbn, cookie)).status).toBe(404)
    expect((await get(isbn, cookie, '?pick=1')).status).toBe(200)
    expect((await get(isbn, cookie)).status).toBe(404)
    expect(hits.get('/missing.jpg')).toBe(before + 2)
    // The lookup, the first fetch and the failed URL's retry counted three; the other cover none.
    for (let i = 3; i < LOOKUP_LIMIT; i++) limitLookups(ctx)
    expect((await get(isbn, cookie)).status).toBe(429)
    expect(hits.get('/missing.jpg')).toBe(before + 2)
  })

  it('answers 404 without a request for an ISBN never looked up', async () => {
    const before = totalHits()
    const response = await get(randomIsbn(), cookieA)
    expect(response.status).toBe(404)
    expect(await response.text()).toBe('')
    expect(totalHits()).toBe(before)
  })

  it('answers 401 when signed out', async () => {
    const isbn = await lookUp(asA, [at('/cover.jpg')])
    const before = totalHits()
    const response = await get(isbn)
    expect(response.status).toBe(401)
    expect(await response.text()).toBe('')
    expect(totalHits()).toBe(before)
  })

  it("never shows one user another's preview", async () => {
    const isbn = await lookUp(asA, [at('/cover.jpg')])
    const before = totalHits()
    expect(await fetchCoverPreview(asB, isbn)).toBeUndefined()
    expect(totalHits()).toBe(before)
  })

  it("serves each candidate's cover by its index, whichever was picked", async () => {
    const isbn = await lookUp(asA, [at('/cover.jpg'), at('/other.png'), undefined], 2)

    const second = await get(isbn, cookieA, '?pick=1')
    expect(second.status).toBe(200)
    expect(Buffer.from(await second.arrayBuffer()).equals(png)).toBe(true)
    // No `pick`, or one out of range, is the best candidate's.
    expect((await get(isbn, cookieA)).headers.get('content-type')).toBe('image/jpeg')
    expect((await get(isbn, cookieA, '?pick=7')).headers.get('content-type')).toBe('image/jpeg')

    const before = totalHits()
    expect(await fetchCoverPreview(asA, isbn, coverPolicy, 2)).toBeUndefined()
    for (const query of ['?pick=abc', '?pick=-1', '?pick=1.5']) {
      expect((await get(isbn, cookieA, query)).status).toBe(404)
    }
    expect(totalHits()).toBe(before)
  })

  it('forgets a record past its lifetime', async () => {
    const isbn = await lookUp(asA, [at('/cover.jpg')])
    const before = totalHits()
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now + PREVIEW_TTL_MS + 1)
    expect(await fetchCoverPreview(asA, isbn)).toBeUndefined()
    vi.restoreAllMocks()
    // Deleted, not only skipped: the clock going back does not revive it.
    expect(await fetchCoverPreview(asA, isbn)).toBeUndefined()
    expect(totalHits()).toBe(before)
  })

  it('drops the oldest record past PREVIEW_SIZE', async () => {
    const isbns = Array.from({ length: PREVIEW_SIZE + 1 }, () => randomIsbn())
    for (const isbn of isbns) recordCoverPreview(asA, isbn, [at('/cover.jpg')])
    const before = totalHits()
    expect(await fetchCoverPreview(asA, isbns[0]!)).toBeUndefined()
    expect(totalHits()).toBe(before)
    expect(await fetchCoverPreview(asA, isbns.at(-1)!)).toMatchObject({ mimeType: 'image/jpeg' })
  })

  it.each([
    ['a 404', '/missing.jpg', {}],
    ['an HTML body', '/page.html', {}],
    ['a body over the limit', '/big.jpg', { maxBytes: 1000 }],
    ['a redirect', '/moved.jpg', {}],
  ])('gives up on %s with one warning', async (_, route, options) => {
    const isbn = await lookUp(asA, [at(route)])
    const coverHits = hits.get('/cover.jpg') ?? 0
    const warn = vi.spyOn(payload.logger, 'warn')
    expect(await fetchCoverPreview(asA, isbn, { ...coverPolicy, ...options })).toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]![0]).toMatchObject({
      isbn13: isbn,
      host: new URL(fixture.origin).host,
    })
    expect(hits.get(route)).toBeGreaterThan(0)
    // The redirect is not followed.
    expect(hits.get('/cover.jpg') ?? 0).toBe(coverHits)
  })

  it('never requests a URL the policy rejects', async () => {
    // Same server, another origin: the policy allows only the fixture origin.
    const { port } = server.address() as AddressInfo
    const isbn = await lookUp(asA, [`http://localhost:${port}/rejected.jpg`])
    const warn = vi.spyOn(payload.logger, 'warn')
    expect(await fetchCoverPreview(asA, isbn)).toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(hits.get('/rejected.jpg')).toBeUndefined()
  })
})
