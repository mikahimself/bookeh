import { randomUUID } from 'node:crypto'

import { createLocalReq, getPayload, type PayloadRequest, type TypedUser } from 'payload'

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
 * A Payload request acting as `user`. Spread into a Local API call:
 * `payload.find({ collection, ...(await as(user)) })`. The Local API bypasses
 * access by default even with a `req` carrying a user, so `overrideAccess:
 * false` is part of the shape.
 */
export async function as(
  user: User,
): Promise<{ req: PayloadRequest; user: TypedUser; overrideAccess: false }> {
  // The spread's `user` option wins over `req.user` in a Local API call, so
  // return the same `collection`-tagged actor that the request carries.
  const actor = { ...user, collection: 'users' as const }
  const req = await createLocalReq({ user: actor }, await payload())
  return { req, user: actor, overrideAccess: false }
}
