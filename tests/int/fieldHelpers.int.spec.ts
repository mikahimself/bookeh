import { randomUUID } from 'node:crypto'

import { postgresAdapter } from '@payloadcms/db-postgres'
import {
  buildConfig,
  createLocalReq,
  getPayload,
  type Access,
  type CollectionSlug,
  type Payload,
  type TypedUser,
  type Where,
} from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { asRequestUser } from '@/access/asRequestUser'
import { ownerField } from '@/fields/owner'
import { ownedRelation, readableRelation } from '@/fields/relation'
import { withTransaction } from '@/lib/payload/transaction'
import appConfig from '@/payload.config'

import { rejectedPaths } from '../helpers/validation'

// Throwaway collections on a second, keyed Payload instance in its own
// Postgres schema: nothing reaches payload.config.ts, migrations or types.
// The slugs are unknown to the generated types, hence the one cast here.
const schemaName = 'field_helpers_test'
const notes = 'field-test-notes' as CollectionSlug
const pins = 'field-test-pins' as CollectionSlug

const own: Access = ({ req: { user } }) => (user ? { owner: { equals: user.id } } : false)
const signedIn: Access = ({ req: { user } }) => Boolean(user)
const ownerAccess = { create: signedIn, read: own, update: own, delete: own }
// As the app's `users` for a non-admin: a user reads only themself.
const self: Access = ({ req: { user } }) => (user ? { id: { equals: user.id } } : false)

const config = buildConfig({
  collections: [
    // A minimal auth collection instead of the app's `users`, so later fields
    // there (relations to collections absent here) do not reach this config.
    { slug: 'users', auth: true, access: { read: self }, fields: [] },
    {
      slug: notes,
      access: ownerAccess,
      fields: [{ name: 'title', type: 'text' }, ownerField()],
    },
    {
      slug: pins,
      access: ownerAccess,
      fields: [
        ownerField(),
        ownedRelation(notes, { name: 'note' }),
        ownedRelation(notes, { name: 'notes', hasMany: true }),
        readableRelation('users', { name: 'user' }),
      ],
    },
  ],
  graphQL: { disable: true },
  secret: 'field-helpers-test-secret',
  // push: true regardless of DATABASE_PUSH: CI builds only the app's schema
  // from migrations, and this one exists only for this spec.
  db: postgresAdapter({
    pool: { connectionString: process.env.DATABASE_URL || '' },
    schemaName,
    push: true,
  }),
})

type Row = { id: number; owner: number | { id: number } }

const ownerId = (row: Row): number => (typeof row.owner === 'number' ? row.owner : row.owner.id)

let payload: Payload
let a: TypedUser
let b: TypedUser

type Data = Record<string, unknown>
type AsUser = ReturnType<typeof asRequestUser>

const reqFor = async (user: TypedUser): Promise<AsUser> =>
  asRequestUser(await createLocalReq({ user }, payload))

// `data` is passed as a variable: an object literal is checked against the
// generated collection types, which do not know these collections.
const createAs = async (collection: CollectionSlug, data: Data, as: AsUser | object) =>
  (await payload.create({ collection, data, ...as })) as unknown as Row

const create = async (collection: CollectionSlug, user: TypedUser, data: Data) =>
  createAs(collection, data, await reqFor(user))

// The generated `User` type is the app's; these users carry only the auth fields.
async function createUser(): Promise<TypedUser> {
  const user = await createAs(
    'users',
    { email: `field-${randomUUID()}@test.invalid`, password: 'test-password' },
    {},
  )
  return { ...user, collection: 'users' } as unknown as TypedUser
}

const noteOf = (user: TypedUser, data: Data = {}) => create(notes, user, { title: 'note', ...data })

async function countPins(where: Where): Promise<number> {
  return (await payload.count({ collection: pins, where, overrideAccess: true })).totalDocs
}

beforeAll(async () => {
  // A fresh schema each run: push prompts for confirmation, and the run hangs,
  // when a change to these collections would drop columns left by an earlier run.
  // The app instance's pool, on the same database: `pg` is not a direct dependency.
  const app = await getPayload({ config: appConfig })
  await app.db.pool.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`)
  payload = await getPayload({ config, key: 'field-helpers' })
  a = await createUser()
  b = await createUser()
}, 60_000)

describe('ownerField', () => {
  it('takes the owner from the request', async () => {
    expect(ownerId(await noteOf(a))).toBe(a.id)
  })

  it('ignores an owner in the input on create', async () => {
    expect(ownerId(await noteOf(a, { owner: b.id }))).toBe(a.id)
  })

  it('keeps the stored owner on update', async () => {
    const note = await noteOf(a)
    const data: Data = { owner: b.id }
    const updated = (await payload.update({
      collection: notes,
      id: note.id,
      data,
      ...(await reqFor(a)),
    })) as unknown as Row
    expect(ownerId(updated)).toBe(a.id)
  })

  it('throws on a create without a user', async () => {
    const title = `orphan-${randomUUID()}`
    await expect(createAs(notes, { title }, {})).rejects.toThrow(
      'ownerField: no req.user on create',
    )
    const { totalDocs } = await payload.count({
      collection: notes,
      where: { title: { equals: title } },
    })
    expect(totalDocs).toBe(0)
  })
})

describe('ownedRelation / readableRelation', () => {
  it('accepts own targets, single and hasMany', async () => {
    const note = await noteOf(a)
    const pin = await create(pins, a, { note: note.id, notes: [note.id] })
    expect(ownerId(pin)).toBe(a.id)
  })

  it("rejects another user's target", async () => {
    const foreign = await noteOf(b)
    expect(await rejectedPaths(create(pins, a, { note: foreign.id }))).toEqual(['note'])
    expect(await countPins({ note: { equals: foreign.id } })).toBe(0)
  })

  it("rejects a hasMany list holding another user's target", async () => {
    const mine = await noteOf(a)
    const foreign = await noteOf(b)
    expect(await rejectedPaths(create(pins, a, { notes: [mine.id, foreign.id] }))).toEqual([
      'notes',
    ])
    expect(await countPins({ notes: { in: [mine.id, foreign.id] } })).toBe(0)
  })

  it('accepts a readable target and rejects an unreadable one', async () => {
    await expect(create(pins, a, { user: a.id })).resolves.toBeDefined()
    expect(await rejectedPaths(create(pins, a, { user: b.id }))).toEqual(['user'])
    expect(await countPins({ user: { equals: b.id } })).toBe(0)
  })

  it("sees a target created earlier in the request's transaction", async () => {
    const req = await createLocalReq({ user: a }, payload)
    const pin = await withTransaction({ req, user: a }, async (tx) => {
      const as = asRequestUser(tx.req)
      const note = await createAs(notes, { title: 'in transaction' }, as)
      return createAs(pins, { note: note.id }, as)
    })
    expect(await countPins({ id: { equals: pin.id } })).toBe(1)
  })
})
