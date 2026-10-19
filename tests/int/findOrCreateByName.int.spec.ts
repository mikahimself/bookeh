import { randomUUID } from 'node:crypto'

import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { deriveSortName } from '@/fields/sortName'
import { findOrCreateByName } from '@/lib/catalogue/findOrCreateByName'
import { DomainError } from '@/lib/errors'
import type { Context } from '@/lib/payload/context'
import { withTransaction } from '@/lib/payload/transaction'
import config from '@/payload.config'
import type { User } from '@/payload-types'

import { contextFor, createUser } from '../helpers/harness'

// `findOrCreateByName()`, AD-5/AD-18: the one matcher of `authors` and
// `series` matches by `nameKey` in the requested scope, creates in that scope
// with the caller as `createdBy` on private rows, and refreshes a still-derived
// author `sortName` from the source. Shared names carry a per-run suffix (the
// shared index is global); private names are safe on fresh users.

const unique = (name: string) => `${name} ${randomUUID().slice(0, 8)}`

describe('findOrCreateByName', () => {
  let payload: Payload
  let a: User
  let b: User
  let admin: User
  let asA: Context
  let asB: Context
  let asAdmin: Context

  const authorById = (id: number) =>
    payload.findByID({ collection: 'authors', id, overrideAccess: true, depth: 0 })

  beforeAll(async () => {
    payload = await getPayload({ config })
    a = await createUser({ displayName: 'Match User A' })
    b = await createUser({ displayName: 'Match User B' })
    admin = await createUser({ displayName: 'Match Admin', roles: ['admin'] })
    asA = await contextFor(a)
    asB = await contextFor(b)
    asAdmin = await contextFor(admin)
  })

  it('creates a shared author with the given sortName and matches it by key', async () => {
    const name = unique('Tove Jansson')
    const created = await findOrCreateByName(asA, 'authors', 'shared', {
      name,
      sortName: 'Jansson, Tove',
    })
    expect(created.created).toBe(true)
    const row = await authorById(created.id)
    expect(row).toMatchObject({ name, sortName: 'Jansson, Tove', visibility: 'shared' })
    expect(row.createdBy ?? null).toBeNull()

    const matched = await findOrCreateByName(asB, 'authors', 'shared', {
      name: name.replace('Tove Jansson', ' tove  JANSSON '),
    })
    expect(matched).toEqual({ id: created.id, created: false })
    expect((await authorById(created.id)).name).toBe(name)
  })

  it('refreshes a derived sortName and keeps a hand-set one', async () => {
    const derived = await findOrCreateByName(asA, 'authors', 'shared', {
      name: unique('Tove Jansson'),
    })
    const stored = await authorById(derived.id)
    expect(stored.sortName).toBe(deriveSortName(stored.name))

    const refreshed = await findOrCreateByName(asA, 'authors', 'shared', {
      name: stored.name,
      sortName: ' Jansson,  Tove Marika ',
    })
    expect(refreshed).toEqual({ id: derived.id, created: false })
    expect((await authorById(derived.id)).sortName).toBe('Jansson, Tove Marika')

    await payload.update({
      collection: 'authors',
      id: derived.id,
      data: { sortName: 'Custom, Name' },
      overrideAccess: true,
      depth: 0,
    })
    await findOrCreateByName(asA, 'authors', 'shared', {
      name: stored.name,
      sortName: 'Jansson, Tove',
    })
    expect((await authorById(derived.id)).sortName).toBe('Custom, Name')
  })

  it('returns the shared row from a private scope', async () => {
    const name = unique('Shared First')
    const shared = await findOrCreateByName(asA, 'authors', 'shared', { name })
    const matched = await findOrCreateByName(asA, 'authors', 'private', {
      name: name.toLowerCase(),
    })
    expect(matched).toEqual({ id: shared.id, created: false })
  })

  it('keeps private rows per creator and out of the shared scope', async () => {
    const name = 'Private Author'
    const ownA = await findOrCreateByName(asA, 'authors', 'private', { name })
    expect(ownA.created).toBe(true)
    expect((await authorById(ownA.id)).createdBy).toBe(a.id)

    const ownB = await findOrCreateByName(asB, 'authors', 'private', { name })
    expect(ownB.created).toBe(true)
    expect(ownB.id).not.toBe(ownA.id)
    expect((await authorById(ownB.id)).createdBy).toBe(b.id)

    expect(await findOrCreateByName(asA, 'authors', 'private', { name: 'PRIVATE AUTHOR' })).toEqual(
      { id: ownA.id, created: false },
    )
    expect(await findOrCreateByName(asB, 'authors', 'private', { name })).toEqual({
      id: ownB.id,
      created: false,
    })

    // The admin reads every private row through access; the matcher still scopes to their own.
    const ownAdmin = await findOrCreateByName(asAdmin, 'authors', 'private', { name })
    expect(ownAdmin.created).toBe(true)
    expect([ownA.id, ownB.id]).not.toContain(ownAdmin.id)
    expect((await authorById(ownAdmin.id)).createdBy).toBe(admin.id)

    const sharedName = unique('Private Then Shared')
    await findOrCreateByName(asA, 'authors', 'private', { name: sharedName })
    const shared = await findOrCreateByName(asB, 'authors', 'shared', { name: sharedName })
    expect(shared.created).toBe(true)
    expect((await authorById(shared.id)).visibility).toBe('shared')
    expect(await findOrCreateByName(asA, 'authors', 'private', { name: sharedName })).toEqual({
      id: shared.id,
      created: false,
    })
  })

  it('matches a series and sees its own create inside one transaction', async () => {
    const name = unique('Muumit')
    const ids = await withTransaction(asA, async (tx) => [
      await findOrCreateByName(tx, 'series', 'shared', { name }),
      await findOrCreateByName(tx, 'series', 'shared', { name: name.toUpperCase() }),
    ])
    expect(ids[1]).toEqual({ id: ids[0].id, created: false })
    const row = await payload.findByID({
      collection: 'series',
      id: ids[0].id,
      overrideAccess: true,
      depth: 0,
    })
    expect(row).toMatchObject({ name, visibility: 'shared' })
  })

  it('rejects a blank name', async () => {
    const err = await findOrCreateByName(asA, 'authors', 'shared', { name: ' \u00a0 ' }).catch(
      (e: unknown) => e,
    )
    expect(err).toBeInstanceOf(DomainError)
    expect(err).toMatchObject({ code: 'VALIDATION', fields: { name: 'VALIDATION' } })
  })
})
