import { randomUUID } from 'node:crypto'

import { getPayload, type Payload } from 'payload'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { seedFirstUser } from '@/lib/account/seedFirstUser'
import config from '@/payload.config'
import { createUser } from '../helpers/harness'

let payload: Payload

describe('first-user seed', () => {
  beforeAll(async () => {
    payload = await getPayload({ config })
    // bookeh_test is never emptied; make sure it has a user either way.
    await createUser()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('runs as onInit', () => {
    expect(payload.config.onInit).toBe(seedFirstUser)
  })

  it('runs without the SEED_* variables from .env', () => {
    expect(process.env.SEED_EMAIL).toBeUndefined()
    expect(process.env.SEED_PASSWORD).toBeUndefined()
  })

  it('creates nothing when users exist', async () => {
    const email = `seed-${randomUUID()}@test.invalid`
    vi.stubEnv('SEED_EMAIL', email)
    vi.stubEnv('SEED_PASSWORD', 'seed-password')

    await payload.config.onInit?.(payload)

    const { totalDocs } = await payload.count({
      collection: 'users',
      where: { email: { equals: email } },
    })
    expect(totalDocs).toBe(0)
  })
})
