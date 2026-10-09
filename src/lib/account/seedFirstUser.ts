import type { Payload } from 'payload'

import type { User } from '@/payload-types'

/** Spine, AD-3: the first-user seed in `onInit`, one of the system-privilege places. */
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
  await payload.create({
    collection: 'users',
    data: {
      email,
      password,
      roles,
      displayName: email.slice(0, email.lastIndexOf('@')),
      language: 'en',
    },
  })
  payload.logger.info(`Seeded the first user ${email} (${roles.join(', ')}).`)
}
