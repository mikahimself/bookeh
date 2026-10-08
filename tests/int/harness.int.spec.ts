import { getPayload } from 'payload'
import { describe, expect, it } from 'vitest'

import config from '@/payload.config'

import { as, createUser } from '../helpers/harness'

describe('test harness', () => {
  it('runs on bookeh_test', async () => {
    const payload = await getPayload({ config })
    const { rows } = await payload.db.pool.query<{ db: string }>('select current_database() as db')
    expect(rows[0]?.db).toBe('bookeh_test')
  })

  it('creates two distinct users and acts as each', async () => {
    const a = await createUser()
    const b = await createUser()
    expect(a.id).not.toBe(b.id)
    expect(a.email).not.toBe(b.email)

    const asA = await as(a)
    const asB = await as(b)
    expect(asA.req.user?.id).toBe(a.id)
    expect(asA.req.user?.collection).toBe('users')
    expect(asB.req.user?.id).toBe(b.id)
    expect(asA.overrideAccess).toBe(false)
    expect(asB.overrideAccess).toBe(false)

    // The shape spreads into a Local API call.
    const payload = await getPayload({ config })
    const found = await payload.findByID({ collection: 'users', id: a.id, ...asA })
    expect(found.id).toBe(a.id)
  })
})
