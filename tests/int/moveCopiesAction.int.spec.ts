import { cookies, headers } from 'next/headers'
import { getPayload, type Payload } from 'payload'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { moveCopiesAction } from '@/app/(frontend)/(sections)/actions'
import { undo } from '@/lib/undo/undo'
import config from '@/payload.config'
import type { User } from '@/payload-types'

import { contextFor, createUser } from '../helpers/harness'
import { randomIsbn } from '../helpers/isbn'

vi.mock('next/headers', () => ({ headers: vi.fn(), cookies: vi.fn() }))

const password = 'move-copies-action-password'

let requestHeaders: Headers

// The action's own part: the input check and the receipt (AD-20). The move
// and its restore are `moveCopies`', tested in moveCopies.int.spec.ts.
describe('moveCopiesAction', () => {
  let payload: Payload
  let user: User
  let home: number
  let copyIds: number[]

  const locationOf = async (id: number) =>
    (await payload.findByID({ collection: 'copies', id, depth: 0 })).location ?? null

  beforeAll(async () => {
    payload = await getPayload({ config })
    vi.mocked(headers).mockImplementation(async () => requestHeaders as never)
    vi.mocked(cookies).mockImplementation(async () => ({ get: () => undefined }) as never)
  })

  beforeEach(async () => {
    user = await createUser({ password })
    const { req } = await contextFor(user)
    const book = await payload.create({
      collection: 'books',
      data: { title: 'Sinuhe', isbn13: randomIsbn(), visibility: 'shared' },
      overrideAccess: true,
      depth: 0,
    })
    home = (
      await payload.create({
        collection: 'locations',
        data: { owner: user.id, name: 'Olohuone', nameKey: '' },
        overrideAccess: false,
        depth: 0,
        req,
      })
    ).id
    copyIds = []
    for (let i = 0; i < 2; i++) {
      const copy = await payload.create({
        collection: 'copies',
        data: { owner: user.id, book: book.id, status: 'owned', location: home },
        overrideAccess: false,
        depth: 0,
        req,
      })
      copyIds.push(copy.id)
    }
    const login = await payload.login({
      collection: 'users',
      data: { email: user.email, password },
    })
    if (!login.token) throw new Error('login returned no token')
    requestHeaders = new Headers({ cookie: `payload-token=${login.token}` })
  })

  it('moves the copies, names the target, and returns a token that Undo restores', async () => {
    const [a, b] = copyIds as [number, number]
    const result = await moveCopiesAction({ copyIds: [a, b, a], location: { create: ' Kellari ' } })
    if (!result.ok) throw new Error(`expected ok, got ${result.code}`)
    expect(result.data).toMatchObject({ location: { name: 'Kellari' }, count: 2 })
    expect(result.data.undoSeconds).toBeGreaterThan(0)
    expect(await locationOf(a)).toBe(result.data.location.id)
    expect(await locationOf(b)).toBe(result.data.location.id)

    await undo(await contextFor(user), result.data.undoToken)
    expect(await locationOf(a)).toBe(home)
    expect(await locationOf(b)).toBe(home)
  })

  it('answers VALIDATION for no location and writes nothing', async () => {
    expect(await moveCopiesAction({ copyIds, location: null })).toEqual({
      ok: false,
      code: 'VALIDATION',
    })
    for (const id of copyIds) expect(await locationOf(id)).toBe(home)
  })
})
