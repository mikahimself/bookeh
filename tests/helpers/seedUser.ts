import { getPayload } from 'payload'
import config from '../../src/payload.config.js'

export type TestUser = { email: string; password: string }

export const testUser: TestUser = {
  email: 'dev@payloadcms.com',
  password: 'test',
}

/**
 * Seeds a test user for e2e tests, `testUser` unless another is given. A spec
 * that runs beside others seeds its own user, so the two do not race.
 */
export async function seedTestUser(user: TestUser = testUser): Promise<void> {
  const payload = await getPayload({ config })

  // Delete existing test user if any
  await payload.delete({
    collection: 'users',
    where: {
      email: {
        equals: user.email,
      },
    },
  })

  // Create fresh test user; only admins enter /admin.
  await payload.create({
    collection: 'users',
    data: {
      ...user,
      displayName: 'E2E Admin',
      roles: ['admin', 'user'],
      language: 'en',
      profileVisibility: 'hidden',
      collectionVisibility: 'closed',
    },
  })
}

/**
 * Cleans up a test user after tests, `testUser` unless another is given.
 */
export async function cleanupTestUser(user: TestUser = testUser): Promise<void> {
  const payload = await getPayload({ config })

  await payload.delete({
    collection: 'users',
    where: {
      email: {
        equals: user.email,
      },
    },
  })
}
