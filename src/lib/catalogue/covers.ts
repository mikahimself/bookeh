import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import type { Payload } from 'payload'
import sharp from 'sharp'

import { normaliseIsbn } from '@/fields/isbn'
import { lookupSources } from '@/lib/metadata/lookup'
// A type only: `payload.config` imports this file and `context.ts` imports `payload.config`.
import type { Context } from '@/lib/payload/context'
import { assertLive } from '@/lib/payload/transaction'

/** Spine, AD-14: the hosts a cover is downloaded from. */
export const COVER_HOSTS: readonly string[] = ['api.finna.fi', 'books.google.com']

export type CoverPolicy = { allows(url: URL): boolean; maxBytes: number; timeoutMs: number }

export const coverPolicy: CoverPolicy = {
  allows: (url) => url.protocol === 'https:' && COVER_HOSTS.includes(url.hostname),
  maxBytes: 5 * 1024 * 1024,
  timeoutMs: 5000,
}

export type DownloadedCover = {
  filename: string
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
  filesize: number
  width: number
  height: number
}

const FORMATS = {
  jpeg: { mimeType: 'image/jpeg', ext: 'jpg' },
  png: { mimeType: 'image/png', ext: 'png' },
  webp: { mimeType: 'image/webp', ext: 'webp' },
} as const satisfies Record<string, { mimeType: DownloadedCover['mimeType']; ext: string }>

const HOUR_MS = 60 * 60 * 1000

/** The absolute path of the `media` collection's `upload.staticDir`. */
export function mediaDir(payload: Payload): string {
  const { staticDir } = payload.collections.media.config.upload
  if (!staticDir) throw new Error('The media collection has no staticDir')
  return path.resolve(staticDir)
}

/** A download failure with the reason to log. */
class CoverFailure extends Error {}

const isErrno = (err: unknown, code: string): boolean =>
  err instanceof Error && (err as NodeJS.ErrnoException).code === code

function reasonOf(err: unknown, stage: string): string {
  if (err instanceof CoverFailure) return err.message
  if (err instanceof Error && err.name === 'TimeoutError') return 'timeout'
  if (stage === 'fetch') return 'network error'
  const code = err instanceof Error ? (err as NodeJS.ErrnoException).code : undefined
  return `${stage} failed${code ? `: ${code}` : ''}`
}

/** The body of a 2xx answer, at most `policy.maxBytes` long. */
async function fetchBytes(url: URL, policy: CoverPolicy): Promise<Buffer> {
  // The timeout signal also covers reading the body.
  const response = await fetch(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(policy.timeoutMs),
  })
  const { body } = response
  const cancel = () => body?.cancel().catch(() => {})
  if (!response.ok) {
    await cancel()
    throw new CoverFailure(`HTTP ${response.status}`)
  }
  if (Number(response.headers.get('content-length')) > policy.maxBytes) {
    await cancel()
    throw new CoverFailure('too large')
  }
  if (!body) throw new CoverFailure('empty body')

  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > policy.maxBytes) {
      await reader.cancel().catch(() => {})
      throw new CoverFailure('too large')
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks)
}

async function imageOf(bytes: Buffer) {
  const metadata = await sharp(bytes)
    .metadata()
    .catch(() => undefined)
  if (!metadata) throw new CoverFailure('not an image')
  const { format, width, height } = metadata
  const known = format in FORMATS ? FORMATS[format as keyof typeof FORMATS] : undefined
  if (!known || !width || !height) throw new CoverFailure(`unsupported image format ${format}`)
  return { ...known, width, height }
}

/**
 * Spine, AD-14: the best candidate's cover for a new shared Book, stored in
 * the media directory before the save's transaction opens. `undefined` with
 * no request when a shared Book with the ISBN exists, no source knows the
 * ISBN or the candidate has no cover. The URL comes only from the server-held
 * source outcome and is fetched only when `policy` allows it: no redirects,
 * a 2xx answer within the time and size limits, a JPEG, PNG or WebP image.
 * The file is written under a temporary name and renamed into place, so a
 * partial file never carries a final name.
 *
 * Every download or write failure is one logged warning and `undefined`: a
 * Book is saved without a cover rather than not at all. Throws a plain
 * `Error` inside a transaction, and `INVALID_ISBN` before any read.
 */
export async function downloadCover(
  ctx: Context,
  isbn13: string,
  policy: CoverPolicy = coverPolicy,
): Promise<DownloadedCover | undefined> {
  if (ctx.transactionID !== undefined) {
    throw new Error('downloadCover runs before the transaction opens (AD-14)')
  }
  assertLive(ctx)
  const isbn = normaliseIsbn(isbn13)
  const { payload } = ctx.req

  // The find of `ensureSharedBook()`: an existing shared Book keeps its cover.
  const { docs } = await payload.find({
    collection: 'books',
    where: { and: [{ isbn13: { equals: isbn } }, { visibility: { equals: 'shared' } }] },
    select: { isbn13: true },
    limit: 1,
    pagination: false,
    req: ctx.req,
    overrideAccess: true,
    depth: 0,
  })
  if (docs[0]) return undefined

  const outcome = await lookupSources(isbn)
  if (outcome.kind !== 'found') return undefined
  const coverUrl = outcome.candidates[0]?.coverUrl
  if (!coverUrl) return undefined

  let host: string | undefined
  let tmp: string | undefined
  let stage = 'fetch'
  try {
    if (!URL.canParse(coverUrl)) throw new CoverFailure('invalid URL')
    const url = new URL(coverUrl)
    host = url.host
    if (!policy.allows(url)) throw new CoverFailure('URL not allowed')

    const bytes = await fetchBytes(url, policy)
    const image = await imageOf(bytes)

    stage = 'write'
    const dir = mediaDir(payload)
    await fs.mkdir(dir, { recursive: true })
    const id = randomUUID()
    tmp = path.join(dir, `.${id}.tmp`)
    await fs.writeFile(tmp, bytes, { flag: 'wx' })

    stage = 'rename'
    const filename = `${id}.${image.ext}`
    await fs.rename(tmp, path.join(dir, filename))
    tmp = undefined

    const { mimeType, width, height } = image
    return { filename, mimeType, filesize: bytes.length, width, height }
  } catch (err) {
    payload.logger.warn(
      { isbn13: isbn, host, ...(!(err instanceof CoverFailure) && { err }) },
      `Cover download failed: ${reasonOf(err, stage)}`,
    )
    // A leftover the sweep would remove anyway, so a failed unlink is not reported.
    if (tmp) await fs.unlink(tmp).catch(() => {})
    return undefined
  }
}

/**
 * The `media` row for a downloaded cover, created in the caller's
 * transaction. Payload stores the row and writes no file: the file is
 * already in place (`filesRequiredOnCreate: false`, system create).
 */
export async function attachCover(tx: Context, cover: DownloadedCover): Promise<number> {
  assertLive(tx)
  const { filename, mimeType, filesize, width, height } = cover
  const doc = await tx.req.payload.create({
    collection: 'media',
    data: { filename, mimeType, filesize, width, height },
    req: tx.req,
    overrideAccess: true,
    depth: 0,
  })
  return doc.id
}

/** Removes a downloaded cover's file; one already gone is fine. */
export async function discardCover(payload: Payload, cover: DownloadedCover): Promise<void> {
  try {
    await fs.unlink(path.join(mediaDir(payload), cover.filename))
  } catch (err) {
    if (!isErrno(err, 'ENOENT')) throw err
  }
}

// The names this app writes: covers and Payload uploads (`<uuid>.<ext>`, see
// `Media.ts`) and `downloadCover()`'s temporary files.
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const APP_NAME = new RegExp(`^(?:${UUID}\\.(?:jpe?g|png|webp)|\\.${UUID}\\.tmp)$`)

/**
 * Removes files in the media directory that no `media` row names and that
 * are more than an hour old: covers left by a crash between the rename and
 * the commit, and temporary files. The hour keeps a download whose save has
 * not committed yet. Only names the app writes are considered, and nothing is
 * removed while the `media` table is empty (a fresh database before a dump is
 * restored). Returns the count; logs and stops on any error.
 */
export async function sweepOrphanMedia(payload: Payload, now = Date.now()): Promise<number> {
  let count = 0
  try {
    const dir = mediaDir(payload)
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch((err: unknown) => {
      if (isErrno(err, 'ENOENT')) return []
      throw err
    })
    const candidates = entries.filter((entry) => entry.isFile() && APP_NAME.test(entry.name))

    if (candidates.length > 0) {
      const { docs } = await payload.find({
        collection: 'media',
        select: { filename: true },
        pagination: false,
        overrideAccess: true,
        depth: 0,
      })
      if (docs.length === 0) {
        payload.logger.warn('Media sweep skipped: files exist but the media table is empty.')
        return 0
      }
      const known = new Set(docs.map((doc) => doc.filename))
      for (const entry of candidates) {
        if (known.has(entry.name)) continue
        const file = path.join(dir, entry.name)
        const { mtimeMs } = await fs.stat(file)
        if (mtimeMs >= now - HOUR_MS) continue
        await fs.unlink(file)
        count++
      }
    }
    payload.logger.info(`Media sweep removed ${count} orphaned file(s).`)
  } catch (err) {
    payload.logger.error({ err }, `Media sweep stopped after removing ${count} file(s)`)
  }
  return count
}
