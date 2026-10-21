import { ValidationError, type Payload } from 'payload'

import type { User } from '@/payload-types'

/** A refused `email`: a duplicate from a concurrent seed, or an invalid `SEED_EMAIL`. */
const isEmailError = (err: unknown): boolean =>
  err instanceof ValidationError && err.data.errors.some((e) => e.path === 'email')

/**
 * Spine, AD-3: the first-user seed in `onInit`, one of the system-privilege
 * places. Two processes booting on an empty database can both pass the count;
 * the loser's create fails on `email`, and a re-count that now finds a user
 * tells that race from an invalid `SEED_EMAIL`, which still aborts boot.
 */
export async function seedFirstUser(
  payload: Payload,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const { totalDocs } = await payload.count({ collection: 'users' })
  if (totalDocs > 0) return

  const email = env.SEED_EMAIL
  const password = env.SEED_PASSWORD
  if (!email || !password) {
    const missing = [!email && 'SEED_EMAIL', !password && 'SEED_PASSWORD'].filter(Boolean)
    payload.logger.warn(`No users and no first-user seed: ${missing.join(' and ')} not set.`)
    return
  }

  const roles: User['roles'] = ['admin', 'user']
  try {
    await payload.create({
      collection: 'users',
      data: {
        email,
        password,
        roles,
        displayName: email.slice(0, email.lastIndexOf('@')),
        language: 'en',
        profileVisibility: 'hidden',
        collectionVisibility: 'closed',
      },
    })
  } catch (err) {
    if (!isEmailError(err) || (await payload.count({ collection: 'users' })).totalDocs === 0)
      throw err
    payload.logger.info('First user already seeded by another process.')
    return
  }
  payload.logger.info(`Seeded the first user ${email} (${roles.join(', ')}).`)
}
