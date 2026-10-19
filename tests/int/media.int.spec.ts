import { readdir } from 'node:fs/promises'

import { REST_GET } from '@payloadcms/next/routes'
import { Forbidden, getPayload, MissingFile, type Payload, ValidationError } from 'payload'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { mediaDir } from '@/lib/catalogue/covers'
import * as gateway from '@/lib/payload/gateway'
import config from '@/payload.config'
import type { Media, User } from '@/payload-types'

import { contextFor, createUser } from '../helpers/harness'

// `media`, AD-14: read for any signed-in user (files included), writes for the
// admin only; other writes are system writes. Every stored name is random.

const randomName = /^[0-9a-f-]{36}\.png$/

const png = async (name: string) => {
  const data = await sharp({
    create: { width: 2, height: 3, channels: 3, background: { r: 200, g: 40, b: 40 } },
  })
    .png()
    .toBuffer()
  return { data, mimetype: 'image/png', name, size: data.length }
}

describe('media', () => {
  let payload: Payload
  let user: User
  let admin: User
  let cover: Media
  const created: number[] = []

  const filesInMedia = async () => (await readdir(mediaDir(payload)).catch(() => [])).sort()

  const systemCreate = async (name: string) => {
    const doc = await payload.create({
      collection: 'media',
      data: {},
      file: await png(name),
      overrideAccess: true,
    })
    created.push(doc.id)
    return doc
  }

  beforeAll(async () => {
    payload = await getPayload({ config })
    user = await createUser({ displayName: 'Media User' })
    admin = await createUser({ displayName: 'Media Admin', roles: ['admin'] })
    cover = await systemCreate('Tove Jansson - Muumipeikko.png')
  })

  afterAll(async () => {
    // Deleting the rows makes Payload remove their files.
    for (const id of created) {
      await payload.delete({ collection: 'media', id, overrideAccess: true }).catch(() => undefined)
    }
  })

  it('stores a system upload under a random name', async () => {
    expect(cover.filename).toMatch(randomName)
    expect(cover.filename).not.toMatch(/tove|jansson|muumi/i)
    expect(await filesInMedia()).toContain(cover.filename)
  })

  const getFile = (filename: string, headers: HeadersInit = {}) =>
    REST_GET(config)(new Request(`http://localhost/api/media/file/${filename}`, { headers }), {
      params: Promise.resolve({ slug: ['media', 'file', filename] }),
    })

  it('refuses the file to a signed-out request', async () => {
    const response = await getFile(cover.filename!)
    expect(response.status).toBe(403)
    expect(response.headers.get('content-type')).not.toMatch(/^image\//)
  })

  it('serves the file to a signed-in user', async () => {
    const { token } = await payload.login({
      collection: 'users',
      data: { email: user.email, password: 'test-password' },
    })
    const response = await getFile(cover.filename!, { Authorization: `JWT ${token}` })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
  })

  it('lets a user read a row', async () => {
    const ctx = await contextFor(user)
    const doc = await gateway.findByID(ctx, { collection: 'media', id: cover.id })
    expect(doc.id).toBe(cover.id)
  })

  it('refuses a create by a user and writes no file', async () => {
    const ctx = await contextFor(user)
    const before = await filesInMedia()
    const file = await png('mine.png')
    await expect(
      gateway.create(ctx, {
        collection: 'media',
        data: {},
        file,
      }),
    ).rejects.toThrow(Forbidden)
    expect(await filesInMedia()).toEqual(before)
  })

  it('refuses an update and a delete by a user', async () => {
    const ctx = await contextFor(user)
    await expect(
      gateway.updateByID(ctx, { collection: 'media', id: cover.id, data: { alt: 'Hijacked' } }),
    ).rejects.toThrow(Forbidden)
    await expect(gateway.deleteByID(ctx, { collection: 'media', id: cover.id })).rejects.toThrow(
      Forbidden,
    )
    const unchanged = await payload.findByID({ collection: 'media', id: cover.id })
    expect(unchanged.alt ?? null).toBeNull()
  })

  it('lets the admin create, update and delete', async () => {
    const ctx = await contextFor(admin)
    const file = await png('Admin cover.png')
    const doc = await gateway.create(ctx, {
      collection: 'media',
      data: {},
      file,
    })
    created.push(doc.id)
    expect(doc.filename).toMatch(randomName)

    const updated = await gateway.updateByID(ctx, {
      collection: 'media',
      id: doc.id,
      data: { alt: 'Cover' },
    })
    expect(updated.alt).toBe('Cover')

    const replaced = await gateway.updateByID(ctx, {
      collection: 'media',
      id: doc.id,
      data: {},
      file: await png('Replacement Name.png'),
    })
    expect(replaced.filename).toMatch(randomName)
    expect(replaced.filename).not.toMatch(/replacement|name/i)
    const files = await filesInMedia()
    expect(files).toContain(replaced.filename)
    expect(files).not.toContain(doc.filename)

    await gateway.deleteByID(ctx, { collection: 'media', id: doc.id })
    expect(await payload.count({ collection: 'media', where: { id: { equals: doc.id } } })).toEqual(
      { totalDocs: 0 },
    )
    expect(await filesInMedia()).not.toContain(replaced.filename)
  })

  it('refuses an admin create without a file', async () => {
    const ctx = await contextFor(admin)
    const before = await payload.count({ collection: 'media' })
    await expect(gateway.create(ctx, { collection: 'media', data: {} })).rejects.toThrow(
      MissingFile,
    )
    // Payload drops a submitted `filename` from a create without `overrideAccess`.
    await expect(
      gateway.create(ctx, { collection: 'media', data: { filename: 'chosen.png' } }),
    ).rejects.toThrow(MissingFile)
    expect(await payload.count({ collection: 'media' })).toEqual(before)
  })

  it('refuses a file that is not an image', async () => {
    const before = await payload.count({ collection: 'media' })
    const data = Buffer.from('not an image\n')
    await expect(
      payload.create({
        collection: 'media',
        data: {},
        file: { data, mimetype: 'image/png', name: 'cover.png', size: data.length },
        overrideAccess: true,
      }),
    ).rejects.toThrow(ValidationError)
    expect(await payload.count({ collection: 'media' })).toEqual(before)
  })

  it('refuses an image type outside JPEG, PNG and WebP', async () => {
    const before = await payload.count({ collection: 'media' })
    const data = await sharp({
      create: { width: 2, height: 3, channels: 3, background: { r: 200, g: 40, b: 40 } },
    })
      .gif()
      .toBuffer()
    await expect(
      payload.create({
        collection: 'media',
        data: {},
        file: { data, mimetype: 'image/gif', name: 'cover.gif', size: data.length },
        overrideAccess: true,
      }),
    ).rejects.toThrow(ValidationError)
    expect(await payload.count({ collection: 'media' })).toEqual(before)
  })
})
