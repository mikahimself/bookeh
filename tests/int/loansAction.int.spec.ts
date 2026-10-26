import { cookies, headers } from 'next/headers'
import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { lendCopyAction } from '@/app/(frontend)/actions/loans'
import config from '@/payload.config'

import { contextFor, createUser } from '../helpers/harness'
import { randomIsbn } from '../helpers/isbn'

vi.mock('next/headers', () => ({ headers: vi.fn(), cookies: vi.fn() }))

const password = 'loans-action-password'

let requestHeaders: Headers

// The action's own part: the input check and passing the Person and date
// on. Lend, return and their restores are `lib/loans`', tested in
// loansService.int.spec.ts.
describe('lendCopyAction', () => {
  let payload: Payload

  beforeAll(async () => {
    payload = await getPayload({ config })
    vi.mocked(headers).mockImplementation(async () => requestHeaders as never)
    vi.mocked(cookies).mockImplementation(async () => ({ get: () => undefined }) as never)
  })

  /** A user with one owned copy, signed in for the action. */
  const signedInWithCopy = async () => {
    const user = await createUser({ password })
    const { req } = await contextFor(user)
    const book = await payload.create({
      collection: 'books',
      data: { title: 'Sinuhe', isbn13: randomIsbn(), visibility: 'shared' },
      overrideAccess: true,
      depth: 0,
    })
    const copy = await payload.create({
      collection: 'copies',
      data: { owner: user.id, book: book.id, status: 'owned' },
      overrideAccess: false,
      depth: 0,
      req,
    })
    const login = await payload.login({
      collection: 'users',
      data: { email: user.email, password },
    })
    if (!login.token) throw new Error('login returned no token')
    requestHeaders = new Headers({ cookie: `payload-token=${login.token}` })
    return { user, copy }
  }

  it('lends to a named Person on the given date, with a receipt', async () => {
    const { copy } = await signedInWithCopy()

    const result = await lendCopyAction({
      copyId: copy.id,
      person: { create: 'Liisa' },
      lentOn: '2026-10-01',
    })
    if (!result.ok) throw new Error(`expected ok, got ${result.code}`)
    expect(result.data.undoToken).toEqual(expect.any(String))
    const loan = await payload.findByID({ collection: 'loans', id: result.data.loanId, depth: 1 })
    expect(loan.lentOn.startsWith('2026-10-01')).toBe(true)
    expect(loan.person).toMatchObject({ name: 'Liisa' })
  })

  it('answers VALIDATION for a bad copy id or person and opens no loan', async () => {
    const { user, copy } = await signedInWithCopy()

    for (const input of [
      { copyId: 'x', person: { create: 'Antti' } },
      { copyId: copy.id, person: { name: 'A' } },
    ]) {
      expect(await lendCopyAction(input)).toEqual({ ok: false, code: 'VALIDATION' })
    }
    const { totalDocs } = await payload.count({
      collection: 'loans',
      where: { owner: { equals: user.id } },
    })
    expect(totalDocs).toBe(0)
  })
})
