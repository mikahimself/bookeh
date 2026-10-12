import { randomUUID } from 'node:crypto'

import { postgresAdapter } from '@payloadcms/db-postgres'
import {
  buildConfig,
  createLocalReq,
  getPayload,
  type CollectionSlug,
  type Payload,
  type TypedUser,
} from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { asRequestUser } from '@/access/asRequestUser'
import { bookFields, overrideFields } from '@/fields/bookFields'
import { runAction } from '@/lib/errors'
import appConfig from '@/payload.config'

// Throwaway collections on a second, keyed Payload instance in its own
// Postgres schema, as in fieldHelpers.int.spec.ts. The relation targets carry
// the slugs `bookFields.ts` names; `series` and `genres` are not in the app yet.
const schemaName = 'book_fields_test'
const books = 'field-test-books' as CollectionSlug
const overrides = 'field-test-overrides' as CollectionSlug
const authors = 'authors'
const series = 'series' as CollectionSlug
const genres = 'genres' as CollectionSlug

const named = (slug: CollectionSlug) => ({ slug, fields: [{ name: 'name', type: 'text' as const }] })

const config = buildConfig({
  collections: [
    { slug: 'users', auth: true, fields: [] },
    { slug: 'media', upload: true, fields: [] },
    // One author hidden from users: an override may not reference it, a Book may.
    { ...named(authors), access: { read: () => ({ name: { not_equals: 'Hidden' } }) } },
    named(series),
    named(genres),
    { slug: books, fields: bookFields() },
    { slug: overrides, fields: overrideFields() },
  ],
  graphQL: { disable: true },
  secret: 'book-fields-test-secret',
  // push: true regardless of DATABASE_PUSH: CI builds only the app's schema
  // from migrations, and this one exists only for this spec.
  db: postgresAdapter({
    pool: { connectionString: process.env.DATABASE_URL || '' },
    schemaName,
    push: true,
  }),
})

type Data = Record<string, unknown>
type Row = { id: number }

let payload: Payload
let user: TypedUser
let authorId: number
let hiddenId: number
let seriesId: number
let genreId: number

// `data` is passed as a variable: an object literal is checked against the
// generated collection types, which do not know these collections.
const createAs = async (collection: CollectionSlug, data: Data, as: object): Promise<Row> =>
  (await payload.create({ collection, data, ...as })) as unknown as Row

const save = async (collection: CollectionSlug, data: Data) =>
  runAction(async () =>
    createAs(collection, data, asRequestUser(await createLocalReq({ user }, payload))),
  )

const system = (collection: CollectionSlug, data: Data) =>
  createAs(collection, data, { overrideAccess: true })

const atLimits = () => ({
  title: 't'.repeat(500),
  subtitle: 's'.repeat(500),
  description: 'd'.repeat(10_000),
  authors: [authorId],
  series: seriesId,
})

const overLimits = {
  title: 't'.repeat(501),
  subtitle: 's'.repeat(501),
  description: 'd'.repeat(10_001),
}

const tooLong = {
  ok: false,
  code: 'VALIDATION',
  fields: { title: 'VALIDATION', subtitle: 'VALIDATION', description: 'VALIDATION' },
}

beforeAll(async () => {
  // A fresh schema each run: push prompts for confirmation, and the run hangs,
  // when a change to these collections would drop columns left by an earlier run.
  const app = await getPayload({ config: appConfig })
  await app.db.pool.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`)
  payload = await getPayload({ config, key: 'book-fields' })
  const created = await system('users', {
    email: `book-fields-${randomUUID()}@test.invalid`,
    password: 'test-password',
  })
  // The generated `User` type is the app's; this user carries only the auth fields.
  user = { ...created, collection: 'users' } as unknown as TypedUser
  authorId = (await system(authors, { name: 'Tove Jansson' })).id
  hiddenId = (await system(authors, { name: 'Hidden' })).id
  seriesId = (await system(series, { name: 'Muumit' })).id
  genreId = (await system(genres, { name: 'Lastenkirjallisuus' })).id
}, 60_000)

describe('bookFields', () => {
  it('saves a Book at the limits', async () => {
    const result = await save(books, {
      ...atLimits(),
      genres: [genreId],
      themes: ['muumit', 'perhe'],
    })
    expect(result.ok).toBe(true)
  })

  it('rejects a Book over the limits', async () => {
    expect(await save(books, overLimits)).toEqual(tooLong)
  })

  it('takes a plain relation: an author hidden from users is fine on a system write', async () => {
    const result = await runAction(() => system(books, { title: 'x', authors: [hiddenId] }))
    expect(result.ok).toBe(true)
  })

  it('rejects a Book without a title', async () => {
    expect(await save(books, { subtitle: 'no title' })).toEqual({
      ok: false,
      code: 'VALIDATION',
      fields: { title: 'VALIDATION' },
    })
  })
})

describe('overrideFields', () => {
  it('saves overrides at the limits', async () => {
    expect((await save(overrides, atLimits())).ok).toBe(true)
  })

  it('rejects overrides over the limits', async () => {
    expect(await save(overrides, overLimits)).toEqual(tooLong)
  })

  it('rejects an author the user cannot read', async () => {
    expect(await save(overrides, { authors: [hiddenId] })).toEqual({
      ok: false,
      code: 'VALIDATION',
      fields: { authors: 'VALIDATION' },
    })
  })

  it('saves an empty row: every override cleared', async () => {
    expect((await save(overrides, {})).ok).toBe(true)
  })
})
