import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'

import { getPayload, type Payload } from 'payload'
import sharp from 'sharp'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  attachCover,
  coverPolicy,
  type CoverPolicy,
  discardCover,
  type DownloadedCover,
  downloadCover,
  mediaDir,
  sweepOrphanMedia,
} from '@/lib/catalogue/covers'
import { ensureSharedBook } from '@/lib/catalogue/ensureSharedBook'
import { lookupSources } from '@/lib/metadata/lookup'
import type { SourceResult, SourcesOutcome } from '@/lib/metadata/source'
import type { Context } from '@/lib/payload/context'
import { withTransaction } from '@/lib/payload/transaction'
import config from '@/payload.config'

import { contextFor, createUser } from '../helpers/harness'
import { randomIsbn } from '../helpers/isbn'

// Covers, AD-14: downloaded from the source before the save's transaction,
// recorded as a `media` row inside it, removed when it rolls back. The source
// is a local fixture server; `lookupSources` is faked.

vi.mock('@/lib/metadata/lookup', () => ({ lookupSources: vi.fn() }))

const WIDTH = 4
const HEIGHT = 6
const finalName = /^[0-9a-f-]{36}\.jpg$/

const found = (isbn13: string, coverUrl?: string): Extract<SourcesOutcome, { kind: 'found' }> => {
  const best: SourceResult = {
    isbn13,
    title: 'Seitsemän veljestä',
    authors: [],
    subjects: [],
    themes: [],
    source: 'finna',
    raw: { finna: {} },
    ...(coverUrl !== undefined && { coverUrl }),
  }
  return {
    kind: 'found',
    candidates: [best],
    raw: {
      v: 1,
      fetchedAt: '2026-10-19T00:00:00.000Z',
      sources: {},
      subjects: {},
      coverUrl: coverUrl ?? null,
    },
  }
}

describe('covers', () => {
  let payload: Payload
  let asA: Context
  let server: Server
  let origin: string
  let policy: CoverPolicy
  let jpeg: Buffer
  let png: Buffer
  const hits = new Map<string, number>()
  const mediaIds: number[] = []
  const filenames: string[] = []

  const totalHits = () => [...hits.values()].reduce((a, b) => a + b, 0)
  const filesInMedia = async () => (await fs.readdir(mediaDir(payload)).catch(() => [])).sort()
  const at = (route: string) => `${origin}${route}`

  /** Downloads `route` for a fresh ISBN; the file is cleaned up after the run. */
  const download = async (route: string, options: Partial<CoverPolicy> = {}) => {
    const isbn = randomIsbn()
    vi.mocked(lookupSources).mockResolvedValue(found(isbn, at(route)))
    const cover = await downloadCover(asA, isbn, { ...policy, ...options })
    if (cover) filenames.push(cover.filename)
    return { isbn, cover }
  }

  const booksWithIsbn = async (isbn13: string) =>
    (
      await payload.find({
        collection: 'books',
        where: { isbn13: { equals: isbn13 } },
        overrideAccess: true,
        depth: 0,
        pagination: false,
      })
    ).docs

  const mediaNamed = async (filename: string) =>
    (
      await payload.count({
        collection: 'media',
        where: { filename: { equals: filename } },
        overrideAccess: true,
      })
    ).totalDocs

  beforeAll(async () => {
    payload = await getPayload({ config })
    asA = await contextFor(await createUser({ displayName: 'Cover User' }))
    jpeg = await sharp({
      create: { width: WIDTH, height: HEIGHT, channels: 3, background: { r: 20, g: 90, b: 160 } },
    })
      .jpeg()
      .toBuffer()
    png = await sharp({
      create: { width: WIDTH, height: HEIGHT, channels: 3, background: { r: 160, g: 90, b: 20 } },
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
        case '/missing.jpg':
          res.writeHead(404).end('Not found')
          return
        case '/page.html':
          res.writeHead(200, { 'Content-Type': 'text/html' }).end('<html><body>Hi</body></html>')
          return
        case '/declared-big.jpg':
          res.writeHead(200, { 'Content-Type': 'image/jpeg' }).end(Buffer.alloc(4096))
          return
        case '/streamed-big.jpg':
          // No Content-Length: chunked, so only the streamed size can tell.
          res.writeHead(200, { 'Content-Type': 'image/jpeg' })
          res.write(Buffer.alloc(1024))
          res.write(Buffer.alloc(1024))
          res.end(Buffer.alloc(1024))
          return
        case '/silent.jpg':
          return // Never answers.
        case '/stalled.jpg':
          res.writeHead(200, { 'Content-Type': 'image/jpeg' })
          res.write(jpeg.subarray(0, 10)) // The body never ends.
          return
        case '/moved.jpg':
          res.writeHead(302, { Location: '/cover.jpg' }).end()
          return
        default:
          res.writeHead(404).end()
      }
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    policy = { ...coverPolicy, allows: (u) => u.origin === origin, timeoutMs: 300 }
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
    for (const id of mediaIds) {
      await payload.delete({ collection: 'media', id, overrideAccess: true }).catch(() => undefined)
    }
    for (const filename of filenames) {
      await fs.rm(path.join(mediaDir(payload), filename), { force: true })
    }
  })

  it('downloads the cover and records it on the created Book', async () => {
    const { isbn, cover } = await download('/cover.jpg')
    expect(cover).toEqual({
      filename: expect.stringMatching(finalName),
      mimeType: 'image/jpeg',
      filesize: jpeg.length,
      width: WIDTH,
      height: HEIGHT,
    })
    const files = await filesInMedia()
    expect(files).toContain(cover!.filename)
    expect(files.filter((name) => name.endsWith('.tmp'))).toEqual([])

    const { data: result } = await ensureSharedBook(asA, isbn, cover)
    expect(result.created).toBe(true)
    const book = await payload.findByID({
      collection: 'books',
      id: result.id,
      overrideAccess: true,
      depth: 1,
    })
    const media = book.cover
    if (typeof media !== 'object' || media === null) throw new Error('Book has no cover row')
    mediaIds.push(media.id)
    expect(media).toMatchObject({
      filename: cover!.filename,
      mimeType: 'image/jpeg',
      width: WIDTH,
      height: HEIGHT,
    })
    expect(await filesInMedia()).toContain(cover!.filename)
  })

  it("downloads the picked candidate's cover", async () => {
    const isbn = randomIsbn()
    const outcome = found(isbn, at('/cover.jpg'))
    outcome.candidates.push({ ...outcome.candidates[0]!, coverUrl: at('/other.png') })
    vi.mocked(lookupSources).mockResolvedValue(outcome)
    const cover = await downloadCover(asA, isbn, policy, 1)
    if (cover) filenames.push(cover.filename)
    expect(cover).toMatchObject({ mimeType: 'image/png', filesize: png.length })
  })

  it('requests nothing without a cover URL, for another outcome or a known Book', async () => {
    const before = totalHits()
    const isbn = randomIsbn()
    vi.mocked(lookupSources).mockResolvedValue(found(isbn))
    expect(await downloadCover(asA, isbn, policy)).toBeUndefined()

    vi.mocked(lookupSources).mockResolvedValue({ kind: 'none' })
    expect(await downloadCover(asA, isbn, policy)).toBeUndefined()

    const known = randomIsbn()
    await payload.create({
      collection: 'books',
      data: { title: 'Kotiseutu', isbn13: known, visibility: 'shared' },
      overrideAccess: true,
      depth: 0,
    })
    vi.mocked(lookupSources).mockReset()
    vi.mocked(lookupSources).mockResolvedValue(found(known, at('/cover.jpg')))
    expect(await downloadCover(asA, known, policy)).toBeUndefined()
    expect(lookupSources).not.toHaveBeenCalled()

    expect(totalHits()).toBe(before)
  })

  it.each([
    ['a 404', '/missing.jpg', {}],
    ['an HTML body', '/page.html', {}],
    ['a declared length over the limit', '/declared-big.jpg', { maxBytes: 1000 }],
    ['a streamed body over the limit', '/streamed-big.jpg', { maxBytes: 2000 }],
    ['no answer before the timeout', '/silent.jpg', {}],
    ['a body that stalls past the timeout', '/stalled.jpg', {}],
    ['a redirect', '/moved.jpg', {}],
  ])('gives up on %s with one warning and no file', async (_, route, options) => {
    const warn = vi.spyOn(payload.logger, 'warn')
    const before = await filesInMedia()
    const coverHits = hits.get('/cover.jpg') ?? 0
    const { cover } = await download(route, options)
    expect(cover).toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]![0]).toMatchObject({ host: new URL(origin).host })
    expect(await filesInMedia()).toEqual(before)
    expect(hits.get(route)).toBeGreaterThan(0)
    // The redirect is not followed.
    expect(hits.get('/cover.jpg') ?? 0).toBe(coverHits)
  })

  it('never requests a URL the policy rejects', async () => {
    const warn = vi.spyOn(payload.logger, 'warn')
    const before = await filesInMedia()
    const isbn = randomIsbn()
    // Same server, another origin: the policy allows only `origin`.
    const port = (server.address() as AddressInfo).port
    vi.mocked(lookupSources).mockResolvedValue(found(isbn, `http://localhost:${port}/rejected.jpg`))
    expect(await downloadCover(asA, isbn, policy)).toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(hits.get('/rejected.jpg')).toBeUndefined()
    expect(await filesInMedia()).toEqual(before)
  })

  it('leaves no file when the write fails part way', async () => {
    const before = await filesInMedia()
    const writeFile = fs.writeFile.bind(fs)
    vi.spyOn(fs, 'writeFile').mockImplementation(async (file, data, options) => {
      await writeFile(file, (data as Buffer).subarray(0, 10), options)
      throw Object.assign(new Error('no space left on device'), { code: 'ENOSPC' })
    })
    const warn = vi.spyOn(payload.logger, 'warn')
    const { cover } = await download('/cover.jpg')
    expect(cover).toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(await filesInMedia()).toEqual(before)
  })

  it('refuses to run inside a transaction', async () => {
    const before = totalHits()
    const isbn = randomIsbn()
    vi.mocked(lookupSources).mockResolvedValue(found(isbn, at('/cover.jpg')))
    const error = await withTransaction(asA, (tx) => downloadCover(tx, isbn, policy)).catch(
      (err: unknown) => err,
    )
    expect(error).toBeInstanceOf(Error)
    expect(lookupSources).not.toHaveBeenCalled()
    expect(totalHits()).toBe(before)
  })

  it('removes the file when the save rolls back', async () => {
    const { isbn, cover } = await download('/cover.jpg')
    expect(cover).toBeDefined()
    const e = new Error('boom')
    await expect(
      withTransaction(asA, async (tx) => {
        await ensureSharedBook(tx, isbn, cover)
        throw e
      }),
    ).rejects.toBe(e)
    expect(await filesInMedia()).not.toContain(cover!.filename)
    expect(await mediaNamed(cover!.filename)).toBe(0)
    expect(await booksWithIsbn(isbn)).toEqual([])
  })

  it('discards the file when the shared Book already exists', async () => {
    const { isbn, cover } = await download('/cover.jpg')
    expect(cover).toBeDefined()
    const existing = await payload.create({
      collection: 'books',
      data: { title: 'Nummisuutarit', isbn13: isbn, visibility: 'shared' },
      overrideAccess: true,
      depth: 0,
    })

    expect((await ensureSharedBook(asA, isbn, cover)).data).toEqual({
      id: existing.id,
      created: false,
    })
    expect(await filesInMedia()).not.toContain(cover!.filename)
    expect(await mediaNamed(cover!.filename)).toBe(0)
    const [book] = await booksWithIsbn(isbn)
    expect(book).toEqual(existing)
  })

  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)

  /** Writes a file into the media directory, two hours old when `old`. */
  const place = async (old: boolean, filename = `${randomUUID()}.jpg`) => {
    const dir = mediaDir(payload)
    await fs.mkdir(dir, { recursive: true })
    filenames.push(filename)
    const file = path.join(dir, filename)
    await fs.writeFile(file, jpeg)
    if (old) await fs.utimes(file, twoHoursAgo, twoHoursAgo)
    return filename
  }

  /** A media row for a placed file. */
  const record = async (filename: string) => {
    const cover: DownloadedCover = {
      filename,
      mimeType: 'image/jpeg',
      filesize: jpeg.length,
      width: WIDTH,
      height: HEIGHT,
    }
    mediaIds.push(await attachCover(asA, cover))
    return cover
  }

  it('keeps the int lane in its own media directory', () => {
    expect(mediaDir(payload)).toBe(path.resolve('media-test'))
  })

  it('sweeps only orphaned app files older than an hour', async () => {
    const oldOrphan = await place(true)
    const freshOrphan = await place(false)
    const recorded = await place(true)
    const foreign = await place(true, '.DS_Store')
    const cover = await record(recorded)

    expect(await sweepOrphanMedia(payload)).toBe(1)
    const files = await filesInMedia()
    expect(files).not.toContain(oldOrphan)
    expect(files).toContain(freshOrphan)
    expect(files).toContain(recorded)
    expect(files).toContain(foreign)

    await discardCover(payload, { ...cover, filename: freshOrphan })
    expect(await filesInMedia()).not.toContain(freshOrphan)
  })

  it('removes nothing while the media table is empty', async () => {
    const oldOrphan = await place(true)
    // An empty table, without deleting the rows of other tests.
    vi.spyOn(payload, 'find').mockResolvedValueOnce({
      docs: [],
      totalDocs: 0,
    } as unknown as Awaited<ReturnType<Payload['find']>>)
    const warn = vi.spyOn(payload.logger, 'warn')

    expect(await sweepOrphanMedia(payload)).toBe(0)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(await filesInMedia()).toContain(oldOrphan)
  })

  it('sweeps on init', async () => {
    await record(await place(true))
    const oldOrphan = await place(true)
    await payload.config.onInit?.(payload)
    expect(await filesInMedia()).not.toContain(oldOrphan)
  })

  it('allows only https on the source hosts', () => {
    const allows = (url: string) => coverPolicy.allows(new URL(url))
    expect(allows('https://api.finna.fi/Cover/Show?source=Solr&id=x&index=0&size=large')).toBe(true)
    expect(
      allows('https://books.google.com/books/content?id=x&printsec=frontcover&fife=w2000'),
    ).toBe(true)
    expect(allows('http://books.google.com/books/content?id=x')).toBe(false)
    expect(allows('https://books.google.com.evil.test/books/content?id=x')).toBe(false)
  })
})
