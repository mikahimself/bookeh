import { randomUUID } from 'node:crypto'

import { createLocalReq, getPayload } from 'payload'

import { asRequestUser } from '@/access/asRequestUser'
import type { Context } from '@/lib/payload/context'
import config from '@/payload.config'
import type { User } from '@/payload-types'

const password = 'test-password'

const payload = () => getPayload({ config })

/** Creates a user (role `user` unless given) with a unique email. Never cleaned up. */
export async function createUser(
  data: Partial<Omit<User, 'id' | 'collection'>> = {},
): Promise<User> {
  return (await payload()).create({
    collection: 'users',
    data: {
      email: `user-${randomUUID()}@test.invalid`,
      password,
      displayName: 'Test User',
      // Payload's create type requires `required` fields even with a defaultValue.
      roles: ['user'],
      language: 'en',
      profileVisibility: 'hidden',
      collectionVisibility: 'closed',
      ...data,
    },
  })
}

/**
 * A gateway context acting as `user` (Spine, AD-16: tests build contexts with
 * an explicit user; `src/lib` exports no such builder).
 */
export async function contextFor(user: User): Promise<Context> {
  const typed = { ...user, collection: 'users' as const }
  return { req: await createLocalReq({ user: typed }, await payload()), user: typed }
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
