import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import type { Payload } from 'payload'
import sharp from 'sharp'

import { fixtureOrigin, usesFixtureSources, type SourceEnv } from '@/lib/metadata/sources/fixture'
// A type only: `payload.config` imports this file and `context.ts` imports `payload.config`.
import type { Context } from '@/lib/payload/context'
import { assertLive } from '@/lib/payload/transaction'

/** Spine, AD-14: the hosts a cover is downloaded from. */
export const COVER_HOSTS: readonly string[] = ['api.finna.fi', 'books.google.com']

export type CoverPolicy = { allows(url: URL): boolean; maxBytes: number; timeoutMs: number }

/**
 * Whether a cover may be downloaded from `url`: https from `COVER_HOSTS`, and
 * under `BOOKEH_SOURCES=fixture` (never production) the app's own origin,
 * which serves the fixture covers.
 */
export function allowsCoverUrl(url: URL, env: SourceEnv = process.env): boolean {
  if (url.protocol === 'https:' && COVER_HOSTS.includes(url.hostname)) return true
  return usesFixtureSources(env) && url.origin === fixtureOrigin(env)
}

export const coverPolicy: CoverPolicy = {
  allows: (url) => allowsCoverUrl(url),
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

/** A checked cover image: its bytes, type, file extension and size in pixels. */
export type FetchedCover = {
  bytes: Buffer
  mimeType: DownloadedCover['mimeType']
  ext: string
  width: number
  height: number
}

/**
 * The outcome of `fetchCover()`. `host` is the URL's host once it parses, for
 * the caller's log line; `err` is present when the failure was an unexpected
 * error rather than a failed check.
 */
export type CoverFetch =
  | ({ ok: true; host: string } & FetchedCover)
  | { ok: false; host: string | undefined; reason: string; err?: unknown }

/**
 * Spine, AD-14: the one network call for a source's cover, shared by
 * `storeCover()` and the cover preview. Requests `coverUrl` only when it
 * parses and `policy` allows it; no redirects, a 2xx answer within the time
 * and size limits, a JPEG, PNG or WebP image. Never throws: a failure is the
 * reason to log.
 */
export async function fetchCover(coverUrl: string, policy: CoverPolicy): Promise<CoverFetch> {
  let host: string | undefined
  try {
    if (!URL.canParse(coverUrl)) throw new CoverFailure('invalid URL')
    const url = new URL(coverUrl)
    host = url.host
    if (!policy.allows(url)) throw new CoverFailure('URL not allowed')

    const bytes = await fetchBytes(url, policy)
    const image = await imageOf(bytes)
    return { ok: true, host, bytes, ...image }
  } catch (err) {
    return {
      ok: false,
      host,
      reason: reasonOf(err, 'fetch'),
      ...(!(err instanceof CoverFailure) && { err }),
    }
  }
}

/**
 * Spine, AD-14: the save's cover step, for the chosen candidate's cover URL
 * from the outcome the save resolved (never from the client): `fetchCover()`,
 * then the file in the media directory under a temporary name renamed into
 * place, so a partial file never carries a final name. Runs before the save's
 * transaction opens (a plain `Error` inside one). Every download or write
 * failure is one logged warning and `undefined`: a Book is saved without a
 * cover rather than not at all.
 */
export async function storeCover(
  ctx: Context,
  isbn13: string,
  coverUrl: string,
  policy: CoverPolicy = coverPolicy,
): Promise<DownloadedCover | undefined> {
  if (ctx.transactionID !== undefined) {
    throw new Error('storeCover runs before the transaction opens (AD-14)')
  }
  assertLive(ctx)
  const { payload } = ctx.req

  const fetched = await fetchCover(coverUrl, policy)
  const { host } = fetched
  if (!fetched.ok) {
    payload.logger.warn(
      { isbn13, host, ...('err' in fetched && { err: fetched.err }) },
      `Cover download failed: ${fetched.reason}`,
    )
    return undefined
  }

  const { bytes, ext, mimeType, width, height } = fetched
  let tmp: string | undefined
  let stage = 'write'
  try {
    const dir = mediaDir(payload)
    await fs.mkdir(dir, { recursive: true })
    const id = randomUUID()
    tmp = path.join(dir, `.${id}.tmp`)
    await fs.writeFile(tmp, bytes, { flag: 'wx' })

    stage = 'rename'
    const filename = `${id}.${ext}`
    await fs.rename(tmp, path.join(dir, filename))
    tmp = undefined

    return { filename, mimeType, filesize: bytes.length, width, height }
  } catch (err) {
    payload.logger.warn({ isbn13, host, err }, `Cover download failed: ${reasonOf(err, stage)}`)
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

/**
 * Deletes a `media` row in the caller's transaction and leaves its file:
 * Payload unlinks an upload's file before its delete and outside the
 * transaction, so a delete that rolls back would leave the row without its
 * file. `sweepOrphanMedia()` removes the file on the next start. A row
 * already gone matches nothing.
 */
export async function deleteMediaRow(tx: Context, id: number): Promise<void> {
  assertLive(tx)
  await tx.req.payload.db.deleteMany({
    collection: 'media',
    where: { id: { equals: id } },
    req: tx.req,
  })
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
// `Media.ts`) and `storeCover()`'s temporary files.
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
