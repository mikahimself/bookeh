import { cookies, headers } from 'next/headers'
import { getPayload, type Payload } from 'payload'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { removeCopiesAction } from '@/app/(frontend)/(sections)/actions'
import { createCopy } from '@/lib/copies/createCopy'
import config from '@/payload.config'

import { contextFor, createUser } from '../helpers/harness'
import { randomIsbn } from '../helpers/isbn'

vi.mock('next/headers', () => ({ headers: vi.fn(), cookies: vi.fn() }))

const password = 'remove-copies-action-password'

let requestHeaders: Headers

// The action's own checks: the input shape and the session. All or none is
// `removeCopies`'s, tested in copyWrites.int.spec.ts.
describe('removeCopiesAction', () => {
  let payload: Payload
  let copyId: number

  /** The copy is still there, read past access control. */
  const stillThere = async () =>
    expect((await payload.findByID({ collection: 'copies', id: copyId, depth: 0 })).id).toBe(copyId)

  beforeAll(async () => {
    payload = await getPayload({ config })
    vi.mocked(headers).mockImplementation(async () => requestHeaders as never)
    vi.mocked(cookies).mockImplementation(async () => ({ get: () => undefined }) as never)
  })

  beforeEach(async () => {
    const user = await createUser({ password })
    const book = await payload.create({
      collection: 'books',
      data: { title: 'Sinuhe', isbn13: randomIsbn(), visibility: 'shared' },
      overrideAccess: true,
      depth: 0,
    })
    copyId = (await createCopy(await contextFor(user), { bookId: book.id, status: 'owned' })).data
    const login = await payload.login({
      collection: 'users',
      data: { email: user.email, password },
    })
    if (!login.token) throw new Error('login returned no token')
    requestHeaders = new Headers({ cookie: `payload-token=${login.token}` })
  })

  it.each<[string, (id: number) => unknown]>([
    ['not an array', (id) => id],
    ['a numeric string', (id) => [String(id)]],
    ['zero', (id) => [id, 0]],
    ['a negative id', (id) => [id, -1]],
    ['a fraction', (id) => [id, 1.5]],
  ])('answers VALIDATION for %s and removes nothing', async (_, input) => {
    expect(await removeCopiesAction(input(copyId))).toEqual({ ok: false, code: 'VALIDATION' })
    await stillThere()
  })

  it('answers UNAUTHENTICATED without a session and removes nothing', async () => {
    requestHeaders = new Headers()
    expect(await removeCopiesAction([copyId])).toEqual({ ok: false, code: 'UNAUTHENTICATED' })
    await stillThere()
  })
})
