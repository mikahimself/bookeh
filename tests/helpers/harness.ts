import { randomUUID } from 'node:crypto'

import { createLocalReq, getPayload } from 'payload'

import { asRequestUser } from '@/access/asRequestUser'
import config from '@/payload.config'
import type { User } from '@/payload-types'

const password = 'test-password'

const payload = () => getPayload({ config })

/** Creates a user with a unique email. Never cleaned up. */
export async function createUser(
  data: Partial<Omit<User, 'id' | 'collection'>> = {},
): Promise<User> {
  return (await payload()).create({
    collection: 'users',
    data: { email: `user-${randomUUID()}@test.invalid`, password, ...data },
  })
}

/**
 * A Payload request acting as `user`, as Local API options from
 * `asRequestUser`. Spread into a call:
 * `payload.find({ collection, ...(await as(user)) })`.
 */
export async function as(user: User): Promise<ReturnType<typeof asRequestUser>> {
  const req = await createLocalReq({ user: { ...user, collection: 'users' } }, await payload())
  return asRequestUser(req)
}
