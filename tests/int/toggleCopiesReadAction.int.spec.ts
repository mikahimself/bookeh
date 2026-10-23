import { cookies, headers } from 'next/headers'
import { getPayload, type Payload } from 'payload'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { toggleCopiesReadAction } from '@/app/(frontend)/(sections)/actions'
import { createCopy } from '@/lib/copies/createCopy'
import { undo } from '@/lib/undo/undo'
import config from '@/payload.config'
import type { User } from '@/payload-types'

import { contextFor, createUser } from '../helpers/harness'
import { randomIsbn } from '../helpers/isbn'

vi.mock('next/headers', () => ({ headers: vi.fn(), cookies: vi.fn() }))

const password = 'toggle-copies-read-action-password'

let requestHeaders: Headers

// The action's own part: the input check and the receipt (AD-20). The toggle
// and its restore are `setRead`'s, tested in setRead.int.spec.ts.
describe('toggleCopiesReadAction', () => {
  let payload: Payload
  let user: User
  let bookId: number
  let copyIds: number[]

  const isRead = async () =>
    (
      await payload.find({
        collection: 'user-books',
        where: { and: [{ owner: { equals: user.id } }, { book: { equals: bookId } }] },
        depth: 0,
        overrideAccess: true,
      })
    ).docs.some((row) => row.read === true)

  beforeAll(async () => {
    payload = await getPayload({ config })
    vi.mocked(headers).mockImplementation(async () => requestHeaders as never)
    vi.mocked(cookies).mockImplementation(async () => ({ get: () => undefined }) as never)
  })

  beforeEach(async () => {
    user = await createUser({ password })
    const book = await payload.create({
      collection: 'books',
      data: { title: 'Sinuhe', isbn13: randomIsbn(), visibility: 'shared' },
      overrideAccess: true,
      depth: 0,
    })
    bookId = book.id
    const ctx = await contextFor(user)
    copyIds = [
      (await createCopy(ctx, { bookId, status: 'owned' })).data,
      (await createCopy(ctx, { bookId, status: 'owned' })).data,
    ]
    const login = await payload.login({
      collection: 'users',
      data: { email: user.email, password },
    })
    if (!login.token) throw new Error('login returned no token')
    requestHeaders = new Headers({ cookie: `payload-token=${login.token}` })
  })

  it('marks the copies’ Book read once and returns a token that Undo restores', async () => {
    const result = await toggleCopiesReadAction(copyIds)
    if (!result.ok) throw new Error(`expected ok, got ${result.code}`)
    expect(result.data).toMatchObject({ read: true, count: 1 })
    expect(result.data.undoSeconds).toBeGreaterThan(0)
    expect(await isRead()).toBe(true)

    await undo(await contextFor(user), result.data.undoToken)
    expect(await isRead()).toBe(false)
  })

  it('answers VALIDATION for a non-array and writes nothing', async () => {
    expect(await toggleCopiesReadAction(copyIds[0])).toEqual({ ok: false, code: 'VALIDATION' })
    expect(await isRead()).toBe(false)
  })
})
