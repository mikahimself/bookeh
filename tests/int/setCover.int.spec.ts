import fs from 'node:fs/promises'
import path from 'node:path'

import { getPayload, type Payload } from 'payload'
import sharp from 'sharp'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { mediaDir } from '@/lib/catalogue/covers'
import { removeCover, setCover } from '@/lib/catalogue/setCover'
import type { Corners } from '@/lib/catalogue/corners'
import { DomainError } from '@/lib/errors'
import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import config from '@/payload.config'
import type { Book, User } from '@/payload-types'

import { contextFor, createUser } from '../helpers/harness'
import { randomIsbn } from '../helpers/isbn'

// `setCover()` / `removeCover()`, AD-14: the admin sets a shared Book's cover,
// the creator a private Book's; anyone else gets `NOT_FOUND`. The stored file
// is a fresh 2:3 JPEG under a random name; a replaced or removed row goes when
// nothing references it. A failed write leaves nothing behind.

const WIDTH = 300
const HEIGHT = 450
const whole: Corners = [
  { x: 0, y: 0 },
  { x: WIDTH, y: 0 },
  { x: WIDTH, y: HEIGHT },
  { x: 0, y: HEIGHT },
]
const randomJpg = /^[0-9a-f-]{36}\.jpg$/

describe('setCover', () => {
  let payload: Payload
  let admin: User
  let a: User
  let asAdmin: Context
  let asA: Context
  let asB: Context
  let jpeg: File
  let png: File

  const image = async (format: 'jpeg' | 'png' | 'gif', name: string) => {
    const base = sharp({
      create: { width: WIDTH, height: HEIGHT, channels: 3, background: { r: 30, g: 90, b: 160 } },
    })
    const bytes = await base[format]().toBuffer()
    return new File([new Uint8Array(bytes)], name, { type: 'image/jpeg' })
  }

  const book = async (user: User, visibility: Book['visibility']) =>
    payload.create({
      collection: 'books',
      data: { title: 'Muumipeikko ja pyrstötähti', isbn13: randomIsbn(), visibility },
      overrideAccess: true,
      depth: 0,
      req: (await contextFor(user)).req,
    })

  const hold = async (ctx: Context, b: Book) => {
    await gateway.create(ctx, {
      collection: 'copies',
      data: { owner: ctx.user.id, book: b.id, status: 'owned' },
      depth: 0,
    })
  }

  const coverOf = async (b: Book) =>
    (await payload.findByID({ collection: 'books', id: b.id, depth: 0, overrideAccess: true }))
      .cover as number | null | undefined

  const mediaRow = (id: number) =>
    payload.findByID({
      collection: 'media',
      id,
      depth: 0,
      overrideAccess: true,
      disableErrors: true,
    })

  const mediaCount = async () =>
    (await payload.count({ collection: 'media', overrideAccess: true })).totalDocs
  const filesInMedia = async () => (await fs.readdir(mediaDir(payload)).catch(() => [])).sort()

  /** Captures everything the matrix says a refused call leaves unchanged. */
  const snapshot = async (b: Book) => ({
    cover: await coverOf(b),
    media: await mediaCount(),
    files: await filesInMedia(),
  })

  beforeAll(async () => {
    payload = await getPayload({ config })
    admin = await createUser({ displayName: 'Cover Admin', roles: ['admin', 'user'] })
    a = await createUser({ displayName: 'Cover User A' })
    asAdmin = await contextFor(admin)
    asA = await contextFor(a)
    asB = await contextFor(await createUser({ displayName: 'Cover User B' }))
    jpeg = await image('jpeg', 'Tove Jansson.jpg')
    png = await image('png', 'cover.png')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("stores the admin's cover on a shared Book and deletes the replaced row", async () => {
    const x = await book(admin, 'shared')
    await hold(asAdmin, x)

    await setCover(asAdmin, x.id, jpeg, whole)
    const first = await coverOf(x)
    expect(first).toEqual(expect.any(Number))
    const row = await mediaRow(first as number)
    expect(row).toMatchObject({ visibility: 'shared', mimeType: 'image/jpeg' })
    expect(row?.createdBy ?? null).toBeNull()
    expect(row?.filename).toMatch(randomJpg)

    const stored = await sharp(path.join(mediaDir(payload), row!.filename!)).metadata()
    expect(stored.format).toBe('jpeg')
    expect(stored.width * 3).toBe(stored.height * 2)
    expect(stored.height).toBeLessThanOrEqual(1200)
    expect(stored.exif).toBeUndefined()

    await setCover(asAdmin, x.id, png, whole)
    const second = await coverOf(x)
    expect(second).not.toBe(first)
    expect(await mediaRow(first as number)).toBeNull()

    // A row another Book still uses stays.
    const y = await book(admin, 'shared')
    await payload.update({
      collection: 'books',
      id: y.id,
      data: { cover: second },
      overrideAccess: true,
      depth: 0,
    })
    await setCover(asAdmin, x.id, jpeg, whole)
    expect(await mediaRow(second as number)).not.toBeNull()
  })

  it("stores the creator's cover on a private Book as private", async () => {
    const p = await book(a, 'private')
    await hold(asA, p)

    await setCover(asA, p.id, png, whole)
    const row = await mediaRow((await coverOf(p)) as number)
    expect(row).toMatchObject({ visibility: 'private', createdBy: a.id, mimeType: 'image/jpeg' })
  })

  it("refuses a user on a shared Book and anyone on another user's private Book", async () => {
    const x = await book(admin, 'shared')
    await hold(asA, x)
    const p = await book(a, 'private')
    await hold(asA, p)
    // The admin reads every Book, so a held private Book reaches the creator check.
    await payload.create({
      collection: 'copies',
      data: { owner: admin.id, book: p.id, status: 'owned' },
      overrideAccess: true,
      depth: 0,
      req: asAdmin.req,
    })

    for (const [ctx, b] of [
      [asA, x],
      [asAdmin, p],
      [asB, p],
    ] as const) {
      const before = await snapshot(b)
      await expect(setCover(ctx, b.id, jpeg, whole)).rejects.toMatchObject(
        new DomainError('NOT_FOUND'),
      )
      await expect(removeCover(ctx, b.id)).rejects.toMatchObject(new DomainError('NOT_FOUND'))
      expect(await snapshot(b)).toEqual(before)
    }
  })

  it('removes a cover and its row; no cover is a no-op', async () => {
    const p = await book(a, 'private')
    await hold(asA, p)
    await setCover(asA, p.id, jpeg, whole)
    const id = (await coverOf(p)) as number

    await removeCover(asA, p.id)
    expect(await coverOf(p)).toBeNull()
    expect(await mediaRow(id)).toBeNull()
    await expect(removeCover(asA, p.id)).resolves.toBeUndefined()
  })

  it('refuses a file that is too large or not a JPEG, PNG or WebP', async () => {
    const p = await book(a, 'private')
    await hold(asA, p)
    const before = await snapshot(p)

    const large = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.jpg')
    await expect(setCover(asA, p.id, large, whole)).rejects.toMatchObject(
      new DomainError('IMAGE_TOO_LARGE'),
    )
    for (const file of [await image('gif', 'cover.gif'), new File(['not an image\n'], 'a.jpg')]) {
      await expect(setCover(asA, p.id, file, whole)).rejects.toMatchObject(
        new DomainError('NOT_AN_IMAGE'),
      )
    }
    expect(await snapshot(p)).toEqual(before)
  })

  it('answers COVER_FAILED and leaves nothing behind when the rename fails', async () => {
    const x = await book(admin, 'shared')
    await hold(asAdmin, x)
    await setCover(asAdmin, x.id, jpeg, whole)
    const before = await snapshot(x)

    vi.spyOn(fs, 'rename').mockRejectedValueOnce(
      Object.assign(new Error('cross-device link'), { code: 'EXDEV' }),
    )
    const error = vi.spyOn(payload.logger, 'error')
    await expect(setCover(asAdmin, x.id, png, whole)).rejects.toMatchObject(
      new DomainError('COVER_FAILED'),
    )
    expect(error).toHaveBeenCalledTimes(1)
    expect(await snapshot(x)).toEqual(before)
  })
})
