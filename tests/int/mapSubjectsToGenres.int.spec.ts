import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { toNameKey } from '@/fields/nameKey'
import { mapSubjectsToGenres } from '@/lib/catalogue/mapSubjectsToGenres'
import { remapGenres } from '@/lib/catalogue/remapGenres'
import { DomainError } from '@/lib/errors'
import type { RawMetadata } from '@/lib/metadata/source'
import config from '@/payload.config'
import type { User } from '@/payload-types'

import { failure, sharedBook, unique } from '../helpers/builders'
import { contextFor, createUser } from '../helpers/harness'

// `mapSubjectsToGenres()` and `remapGenres()`, AD-5: Google categories match
// or create system genres by English `nameKey`, Finna's genre terms only
// match (English or Finnish name), ids distinct, Google's first.

const fixture = (source: 'finna' | 'google', isbn: string): unknown =>
  JSON.parse(readFileSync(join(__dirname, '../fixtures', source, `${isbn}.json`), 'utf8'))

const google = (...categories: string[]): RawMetadata => ({
  v: 1,
  fetchedAt: '2026-11-05T00:00:00.000Z',
  sources: {},
  subjects: { google: categories },
  coverUrl: null,
})

/** Finna fixture 9789520408053 carries `kaunokirjallisuus` and `romaanit`. */
const withFinna = (raw: RawMetadata): RawMetadata => ({
  ...raw,
  sources: { finna: fixture('finna', '9789520408053') },
})

describe('mapSubjectsToGenres', () => {
  let payload: Payload
  let admin: User
  let fiction: number

  const genreByKey = async (name: string) =>
    (
      await payload.find({
        collection: 'genres',
        where: { nameKey: { equals: toNameKey(name) } },
        overrideAccess: true,
        depth: 0,
      })
    ).docs

  beforeAll(async () => {
    payload = await getPayload({ config })
    admin = await createUser({ roles: ['admin'] })
    fiction = (await genreByKey('Fiction'))[0]!.id
  })

  it('matches a Google category to the seeded genre', async () => {
    const { items } = fixture('google', '9780007447831') as {
      items: { volumeInfo: { categories: string[] } }[]
    }
    const categories = items[0]!.volumeInfo.categories
    const ctx = await contextFor(admin)
    expect(await mapSubjectsToGenres(ctx, google(...categories))).toEqual([fiction])
  })

  it('creates a missing Google category with an English name only', async () => {
    const name = unique('Weird Science')
    const [id] = await mapSubjectsToGenres(await contextFor(admin), google(name))
    const [genre] = await genreByKey(name)
    expect(genre).toMatchObject({ id, name })
    expect(genre?.nameFi).toBeFalsy()
  })

  it('matches Finna terms by Finnish name and creates nothing for the rest', async () => {
    const before = (await payload.count({ collection: 'genres', overrideAccess: true })).totalDocs
    const ids = await mapSubjectsToGenres(await contextFor(admin), withFinna(google()))
    expect(ids).toEqual([fiction])
    expect((await payload.count({ collection: 'genres', overrideAccess: true })).totalDocs).toBe(
      before,
    )
  })

  it('returns a genre named by both sources once', async () => {
    const ids = await mapSubjectsToGenres(await contextFor(admin), withFinna(google('Fiction')))
    expect(ids).toEqual([fiction])
  })

  it('returns nothing for no data', async () => {
    expect(await mapSubjectsToGenres(await contextFor(admin), google())).toEqual([])
  })

  it('re-runs over shared Books, filling only empty ones, for an admin only', async () => {
    const raw = google('Fiction')
    const empty = await sharedBook({ rawMetadata: raw })
    const poetry = (await genreByKey('Poetry'))[0]!.id
    const filled = await sharedBook({ rawMetadata: raw, genres: [poetry] })

    expect(await failure(remapGenres(await contextFor(await createUser())))).toBeInstanceOf(
      DomainError,
    )
    const result = await remapGenres(await contextFor(admin))
    expect(result.updated).toBeGreaterThanOrEqual(1)

    const genresOf = async (id: number) =>
      (await payload.findByID({ collection: 'books', id, depth: 0, overrideAccess: true })).genres
    expect(await genresOf(empty.id)).toEqual([fiction])
    expect(await genresOf(filled.id)).toEqual([poetry])
  })
})
