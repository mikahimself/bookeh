import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { createLocation } from '@/lib/copies/locations'
import config from '@/payload.config'
import type { User } from '@/payload-types'

import { contextFor, createUser } from '../helpers/harness'

// `createLocation()`, AD-18/FR-31: adds my location, normalised; a name one
// of my locations already has fails `NAME_TAKEN` with its id, writing nothing.

describe('createLocation', () => {
  let payload: Payload

  const namesOf = async (user: User) =>
    (
      await payload.find({
        collection: 'locations',
        where: { owner: { equals: user.id } },
        sort: 'id',
        depth: 0,
      })
    ).docs.map(({ name, nameKey }) => ({ name, nameKey }))

  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  it("creates a normalised location, whatever another user's names are", async () => {
    const other = await createUser({ displayName: 'Create Location Other' })
    await createLocation(await contextFor(other), 'Mökki')
    const a = await createUser({ displayName: 'Create Location' })

    const id = await createLocation(await contextFor(a), '  Mökki   ranta ')
    await createLocation(await contextFor(a), 'Mökki')

    const created = await payload.findByID({ collection: 'locations', id, depth: 0 })
    expect(created).toMatchObject({ name: 'Mökki ranta', nameKey: 'mökki ranta' })
    expect(await namesOf(a)).toEqual([
      { name: 'Mökki ranta', nameKey: 'mökki ranta' },
      { name: 'Mökki', nameKey: 'mökki' },
    ])
  })

  it("fails NAME_TAKEN with the existing location's id, writing nothing", async () => {
    const a = await createUser({ displayName: 'Create Location Taken' })
    const ctx = await contextFor(a)
    const existing = await createLocation(ctx, 'Mökki')

    const error = await createLocation(ctx, ' MÖKKI ').catch((e: unknown) => e)

    expect(error).toMatchObject({ code: 'NAME_TAKEN', conflictId: existing })
    expect(await namesOf(a)).toEqual([{ name: 'Mökki', nameKey: 'mökki' }])
  })
})
