// Prepares bookeh_test for the e2e lane (Story 3.52); run by Playwright's web server
// command as `payload run tests/e2e/seed.ts`, before `next dev` starts. Refuses any
// other database, because it deletes rows.
import { getPayload, type Where } from 'payload'

import { updateProfile } from '@/lib/account/profile'
import { resolveLocation } from '@/lib/copies/locations'
import config from '@/payload.config'

import { contextFor } from '../helpers/harness'
import { assertTestDatabase } from '../helpers/testDatabase'

import { E2E_EMAIL, E2E_ISBN, E2E_LOCATION, E2E_PASSWORD } from './account'

assertTestDatabase(process.env.DATABASE_URL)

const payload = await getPayload({ config })
const system = { overrideAccess: true, depth: 0 } as const

// The fixed user, its password reset on every run.
const {
  docs: [existing],
} = await payload.find({
  collection: 'users',
  where: { email: { equals: E2E_EMAIL } },
  limit: 1,
  pagination: false,
  ...system,
})
const account = { password: E2E_PASSWORD, roles: ['user' as const], language: 'en' as const }
// Unlocked too: failed sign-ins in an earlier run would otherwise lock every later one out.
const user = existing
  ? await payload.update({
      collection: 'users',
      id: existing.id,
      data: { ...account, loginAttempts: 0, lockUntil: null },
      ...system,
    })
  : await payload.create({
      collection: 'users',
      data: {
        ...account,
        email: E2E_EMAIL,
        displayName: 'E2E',
        profileVisibility: 'hidden',
        collectionVisibility: 'closed',
      },
      ...system,
    })

// New copies land at the E2E location.
const ctx = await contextFor(user)
await updateProfile(ctx, { defaultLocation: await resolveLocation(ctx, { create: E2E_LOCATION }) })

// Earlier runs' Book of the ISBN, so the Answer is again "Not in library" from the source.
const { docs: books } = await payload.find({
  collection: 'books',
  where: { isbn13: { equals: E2E_ISBN } },
  pagination: false,
  ...system,
})
if (books.length > 0) {
  const ofBooks: Where = { book: { in: books.map((book) => book.id) } }
  // Spine, AD-19: loans and entries refuse the deletes below (`ON DELETE restrict`).
  const { docs: copies } = await payload.find({
    collection: 'copies',
    where: ofBooks,
    pagination: false,
    ...system,
  })
  await payload.delete({
    collection: 'loans',
    where: { copy: { in: copies.map((copy) => copy.id) } },
    ...system,
  })
  await payload.delete({ collection: 'wishlist-entries', where: ofBooks, ...system })
  await payload.delete({ collection: 'copies', where: ofBooks, ...system })
  await payload.delete({ collection: 'user-books', where: ofBooks, ...system })
  for (const book of books) {
    await payload.delete({ collection: 'books', id: book.id, ...system })
    if (typeof book.cover === 'number') {
      await payload.delete({ collection: 'media', id: book.cover, ...system })
    }
  }
}

payload.logger.info(`E2E seed: ${E2E_EMAIL} ready, ${books.length} earlier Book(s) removed`)
