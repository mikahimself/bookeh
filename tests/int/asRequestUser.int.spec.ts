import { createLocalReq, Forbidden, getPayload } from 'payload'
import { describe, expect, it } from 'vitest'

import { asRequestUser } from '@/access/asRequestUser'
import config from '@/payload.config'

import { as, createUser } from '../helpers/harness'

// The Local API skips access unless overrideAccess is false. `users` read
// access needs a signed-in user, so a request without one shows whether
// access ran.
describe('asRequestUser in a Local API call', () => {
  it('denies a request without a user', async () => {
    const payload = await getPayload({ config })
    const u = await createUser()
    const req = await createLocalReq({}, payload)
    const where = { id: { equals: u.id } }

    await expect(
      payload.find({ collection: 'users', where, ...asRequestUser(req) }),
    ).rejects.toThrow(Forbidden)
    // Without the helper the same request reads the user.
    const bypassed = await payload.find({ collection: 'users', where, req })
    expect(bypassed.docs.map((d) => d.id)).toEqual([u.id])
  })

  it('reads as the request user', async () => {
    const payload = await getPayload({ config })
    const u = await createUser()
    const { req } = await as(u)

    const found = await payload.findByID({ collection: 'users', id: u.id, ...asRequestUser(req) })
    expect(found.id).toBe(u.id)
  })
})
