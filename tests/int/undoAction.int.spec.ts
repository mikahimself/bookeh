import { cookies, headers } from 'next/headers'
import { getPayload, type Payload } from 'payload'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { undoAction } from '@/app/(frontend)/actions/undo'
import * as gateway from '@/lib/payload/gateway'
import { withUndo } from '@/lib/undo/undo'
import config from '@/payload.config'
import type { User } from '@/payload-types'

import { contextFor, createUser } from '../helpers/harness'

vi.mock('next/headers', () => ({ headers: vi.fn(), cookies: vi.fn() }))

const password = 'undo-action-password'

let requestHeaders: Headers

describe('undoAction', () => {
  let payload: Payload
  let user: User

  beforeAll(async () => {
    payload = await getPayload({ config })
    vi.mocked(headers).mockImplementation(async () => requestHeaders as never)
    vi.mocked(cookies).mockImplementation(async () => ({ get: () => undefined }) as never)
  })

  beforeEach(async () => {
    user = await createUser({ password, displayName: 'Undo Action' })
    const login = await payload.login({
      collection: 'users',
      data: { email: user.email, password },
    })
    if (!login.token) throw new Error('login returned no token')
    requestHeaders = new Headers({ cookie: `payload-token=${login.token}` })
  })

  /** Reads past access: whether the row is there. */
  const exists = async (id: number) =>
    (await payload.count({ collection: 'locations', where: { id: { equals: id } } })).totalDocs ===
    1

  it('undoes a real receipt of the signed-in user', async () => {
    const ctx = await contextFor(user)
    const { id, undoToken } = await withUndo(ctx, async (tx) => {
      const { id } = await gateway.create(tx, {
        collection: 'locations',
        data: { owner: user.id, name: 'Hylly', nameKey: 'ignored' },
        depth: 0,
      })
      return {
        data: { id },
        restore: async (tx) => {
          await gateway.deleteByID(tx, { collection: 'locations', id })
        },
      }
    })
    expect(await exists(id)).toBe(true)

    expect(await undoAction(undoToken)).toEqual({ ok: true, data: null })
    expect(await exists(id)).toBe(false)
  })

  it('answers UNDO_FAILED for a token never issued', async () => {
    expect(await undoAction('never-issued')).toEqual({ ok: false, code: 'UNDO_FAILED' })
  })

  it('answers VALIDATION for a non-string token', async () => {
    expect(await undoAction(42)).toEqual({ ok: false, code: 'VALIDATION' })
  })

  it('answers UNAUTHENTICATED without a session', async () => {
    requestHeaders = new Headers()
    expect(await undoAction('never-issued')).toEqual({ ok: false, code: 'UNAUTHENTICATED' })
  })
})
