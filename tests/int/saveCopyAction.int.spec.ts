import { randomUUID } from 'node:crypto'

import { cookies, headers } from 'next/headers'
import { getPayload, type Payload } from 'payload'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { undoAction } from '@/app/(frontend)/actions/undo'
import { saveCopyAction } from '@/app/(frontend)/scan/actions'
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
    const input = { requestId: randomUUID(), isbn13 }

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
    const result = await saveCopyAction({ requestId: randomUUID(), isbn13 })
    if (!result.ok) throw new Error(`save failed: ${result.code}`)

    expect(await undoAction(result.data.undoToken)).toEqual({ ok: true, data: null })
    expect(await copies()).toEqual([])
    expect(await undoAction(result.data.undoToken)).toEqual({ ok: false, code: 'UNDO_FAILED' })
  })

  it('adds another owned copy of a Book the user already holds', async () => {
    expect(await saveCopyAction({ requestId: randomUUID(), isbn13 })).toMatchObject({ ok: true })

    expect(await saveCopyAction({ requestId: randomUUID(), isbn13 })).toMatchObject({
      ok: true,
      data: { savedTo: { id: location.id, name: 'Tampere' } },
    })
    expect(await copies()).toMatchObject([
      { status: 'owned', location: location.id },
      { status: 'owned', location: location.id },
    ])
  })

  it.each([
    ['a malformed input', { isbn13: 5 }],
    ['no input', undefined],
    ['an ISBN saveCopy refuses', { requestId: randomUUID(), isbn13: 'not an isbn' }],
  ])('answers SAVE_FAILED for %s and writes nothing', async (_, input) => {
    expect(await saveCopyAction(input)).toEqual({ ok: false, code: 'SAVE_FAILED' })
    expect(await copies()).toEqual([])
  })

  it('answers UNAUTHENTICATED without a session', async () => {
    requestHeaders = new Headers()
    expect(await saveCopyAction({ requestId: randomUUID(), isbn13 })).toEqual({
      ok: false,
      code: 'UNAUTHENTICATED',
    })
    expect(await copies()).toEqual([])
  })
})
