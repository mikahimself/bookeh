import { sql } from '@payloadcms/db-postgres/drizzle'
import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { upsertUserBook } from '@/lib/books/upsertUserBook'
import * as gateway from '@/lib/payload/gateway'
import { filterValues } from '@/lib/shelf/filterValues'
import { shelfIds } from '@/lib/shelf/shelfIds'
import { suggest } from '@/lib/shelf/suggest'
import config from '@/payload.config'
import type { Book, User } from '@/payload-types'

import { sharedBook, unique } from '../helpers/builders'
import { contextFor, createUser } from '../helpers/harness'

// `filterValues()` and `suggest()`, AD-7: values in use on the viewer's
// copies only (two-user access test), counted in copies and in name order,
// effective values (AD-6) applied, read from the viewer's own `user-books`
// row (a missing row is unread); suggestions distinct on name key, the
// shared id first, with `%` matched literally.
// Each test has its own users. Shared name keys are unique and rows stay, so
// names carry a per-run suffix.

describe('shelf filter values and suggestions', () => {
  let payload: Payload

  const reqFor = async (user: User) => (await contextFor(user)).req

  const record = async (
    by: User,
    collection: 'authors' | 'series',
    name: string,
    visibility: 'shared' | 'private',
  ) =>
    payload.create({
      collection,
      data: { name, visibility, nameKey: '' },
      overrideAccess: true,
      depth: 0,
      req: await reqFor(by),
    })

  const genre = async (name: string) =>
    payload.create({
      collection: 'genres',
      data: { name, nameKey: '' },
      overrideAccess: true,
      depth: 0,
    })

  const copyOf = async (
    user: User,
    book: Book,
    data: { status?: 'owned' | 'ordered'; location?: number } = {},
  ) =>
    gateway.create(await contextFor(user), {
      collection: 'copies',
      data: {
        owner: user.id,
        acquiredAt: '2026-01-01T12:00:00.000Z',
        book: book.id,
        status: 'owned',
        ...data,
      },
      depth: 0,
    })

  const locationOf = async (user: User, name: string) =>
    gateway.create(await contextFor(user), {
      collection: 'locations',
      data: { owner: user.id, name, nameKey: 'ignored' },
      depth: 0,
    })

  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  it.each(['user' as const, 'admin' as const])(
    'keeps foreign private theme names hidden from %s even on malformed assignments',
    async (role) => {
      const a = await createUser({ roles: [role] })
      const b = await createUser()
      const ctx = await contextFor(a)
      const book = await sharedBook({ by: a })
      await copyOf(a, book)
      const foreign = await gateway.create(await contextFor(b), {
        collection: 'tags',
        data: { owner: b.id, name: 'Foreign private theme', nameKey: '', kind: 'theme' },
        depth: 0,
      })
      const wrong = await gateway.create(ctx, {
        collection: 'tags',
        data: { owner: a.id, name: 'Wrong kind theme', nameKey: '', kind: 'tag' },
        depth: 0,
      })
      await upsertUserBook(ctx, book.id, { tags: [wrong.id] })
      await payload.db.drizzle.execute(sql`insert into user_books_rels(parent_id,path,tags_id)
      select id, 'tags', ${foreign.id} from user_books where owner_id = ${a.id} and book_id = ${book.id}`)
      for (const name of [foreign.name, wrong.name]) {
        expect(await suggest(ctx, 'theme', name)).toEqual([])
        expect(
          (
            await shelfIds(
              ctx,
              { filters: { theme: [name] }, sort: 'added', dir: 'asc' },
              { offset: 0, limit: 50 },
            )
          ).total,
        ).toBe(0)
      }
    },
  )

  it('excludes themes on Books that became unreadable after acquiring copies', async () => {
    const a = await createUser()
    const b = await createUser()
    const ctx = await contextFor(a)
    const book = await sharedBook({ by: b, themes: ['Hidden system theme'] })
    await copyOf(a, book)
    const own = await gateway.create(ctx, {
      collection: 'tags',
      data: { owner: a.id, name: 'Hidden private theme', nameKey: '', kind: 'theme' },
      depth: 0,
    })
    await upsertUserBook(ctx, book.id, { tags: [own.id] })
    await payload.update({
      collection: 'books',
      id: book.id,
      data: { visibility: 'private' },
      overrideAccess: true,
      req: await reqFor(b),
    })
    expect(await suggest(ctx, 'theme', 'hidden')).toEqual([])
    expect(
      (
        await shelfIds(
          ctx,
          { filters: { theme: ['Hidden system theme', own.name] }, sort: 'added', dir: 'asc' },
          { offset: 0, limit: 50 },
        )
      ).total,
    ).toBe(0)
  })

  it('suggests used system and private themes once, including ordered copies, with literal wildcards and a ten-name cap', async () => {
    const a = await createUser()
    const b = await createUser()
    const ctx = await contextFor(a)
    const book = await sharedBook({
      by: a,
      themes: [
        'Walk Theme',
        'walk theme',
        '100%_\\ Theme',
        ...Array.from({ length: 12 }, (_, i) => `Theme ${String(i).padStart(2, '0')}`),
      ],
    })
    await copyOf(a, book, { status: 'ordered' })
    await copyOf(a, book)
    const label = async (user: User, kind: 'theme' | 'tag', name: string) =>
      gateway.create(await contextFor(user), {
        collection: 'tags',
        data: { owner: user.id, name, kind, nameKey: '' },
        depth: 0,
      })
    const orderedOnly = await sharedBook({ by: a, themes: ['Ordered system theme'] })
    await copyOf(a, orderedOnly, { status: 'ordered' })
    const orderedLabel = await label(a, 'theme', 'Ordered private theme')
    await upsertUserBook(ctx, orderedOnly.id, { tags: [orderedLabel.id] })
    expect(await suggest(ctx, 'theme', 'Ordered system')).toEqual([
      { id: null, name: 'Ordered system theme' },
    ])
    expect(await suggest(ctx, 'theme', 'Ordered private')).toEqual([
      { id: null, name: 'Ordered private theme' },
    ])
    const collision = await label(a, 'theme', 'walk theme')
    const own = await label(a, 'theme', 'Private Theme')
    const wrong = await label(a, 'tag', 'Wrong Theme')
    await label(a, 'theme', 'Unused Theme')
    const foreign = await label(b, 'theme', 'Foreign Theme')
    await upsertUserBook(ctx, book.id, { tags: [own.id, wrong.id, collision.id] })
    await upsertUserBook(await contextFor(b), book.id, { tags: [foreign.id] })
    const wished = await sharedBook({ by: a, themes: ['Wishlist Theme'] })
    const wishTag = await label(a, 'theme', 'Wishlist Private Theme')
    await upsertUserBook(ctx, wished.id, { tags: [wishTag.id] })
    expect(
      (await suggest(ctx, 'theme', 'walk')).map(({ id, name }) => ({
        id,
        name: name.toLowerCase(),
      })),
    ).toEqual([{ id: null, name: 'walk theme' }])
    expect(await suggest(ctx, 'theme', 'Private Theme')).toEqual([
      { id: null, name: 'Ordered private theme' },
      { id: null, name: 'Private Theme' },
    ])
    for (const text of ['wrong', 'unused', 'foreign', 'wishlist', '  '])
      expect(await suggest(ctx, 'theme', text)).toEqual([])
    for (const text of ['%', '_', '\\'])
      expect(await suggest(ctx, 'theme', text)).toEqual([{ id: null, name: '100%_\\ Theme' }])
    const suggestions = await suggest(ctx, 'theme', 'theme')
    expect(suggestions).toHaveLength(10)
    await copyOf(
      a,
      await sharedBook({
        by: a,
        themes: [
          'Järjestys Öljy',
          'Järjestys Äiti',
          'Järjestys Zulu',
          'Järjestys Åland',
          'Järjestys Aamu',
        ],
      }),
    )
    expect(await suggest(ctx, 'theme', 'Järjestys')).toEqual([
      { id: null, name: 'Järjestys Aamu' },
      { id: null, name: 'Järjestys Zulu' },
      { id: null, name: 'Järjestys Åland' },
      { id: null, name: 'Järjestys Äiti' },
      { id: null, name: 'Järjestys Öljy' },
    ])
  })

  it("counts the values in use on the viewer's copies, overrides applied, no one else's", async () => {
    const a = await createUser({ displayName: 'Values A' })
    const b = await createUser({ displayName: 'Values B' })
    const asA = await contextFor(a)
    const fiction = await genre(unique('Fiction'))
    const biography = await genre(unique('Biography'))
    const other = await genre(unique('Poetry'))
    const hylly = await locationOf(a, unique('Hylly'))
    const arkku = await locationOf(a, unique('Arkku'))
    const vintti = await locationOf(b, unique('Vintti'))

    const x = await sharedBook({ by: a, genres: [fiction.id, biography.id], language: 'fi' })
    const y = await sharedBook({ by: a, language: 'en' })
    const w = await sharedBook({ by: a, genres: [biography.id] })
    await copyOf(a, x, { location: hylly.id })
    await copyOf(a, x, { location: hylly.id })
    await copyOf(a, y, { status: 'ordered' })
    await copyOf(a, w, { location: arkku.id })

    const z = await sharedBook({ by: b, genres: [other.id], language: 'de' })
    await copyOf(b, z, { location: vintti.id })
    await copyOf(b, x, { status: 'ordered' })
    await upsertUserBook(await contextFor(b), y.id, { overrides: { language: 'it' } })
    // Read: x by A (two copies); y unread with a row; w without a row; B's read of w not A's.
    await upsertUserBook(asA, x.id, { read: true })
    await upsertUserBook(asA, y.id, { read: false })
    await upsertUserBook(await contextFor(b), w.id, { read: true })

    expect(await filterValues(asA, 'en')).toEqual({
      location: [
        { id: arkku.id, name: arkku.name, count: 1 },
        { id: hylly.id, name: hylly.name, count: 2 },
      ],
      status: [
        { value: 'owned', count: 3 },
        { value: 'ordered', count: 1 },
      ],
      read: [
        { value: true, count: 2 },
        { value: false, count: 2 },
      ],
      genre: [
        { id: biography.id, name: biography.name, count: 3 },
        { id: fiction.id, name: fiction.name, count: 2 },
      ],
      tag: [],
      language: [
        { value: 'en', count: 1 },
        { value: 'fi', count: 2 },
      ],
    })

    await upsertUserBook(asA, x.id, { overrides: { language: 'sv' } })
    expect((await filterValues(asA, 'en')).language).toEqual([
      { value: 'en', count: 1 },
      { value: 'sv', count: 2 },
    ])
  })

  it('suggests one author per name key, the shared id, from effective authors only', async () => {
    const a = await createUser({ displayName: 'Suggest A' })
    const b = await createUser({ displayName: 'Suggest B' })
    const asA = await contextFor(a)
    const kiviName = unique('Aleksis Kivi')
    // The private one first, so the shared id is the higher: the shared record wins, not the lowest id.
    const ownKivi = await record(a, 'authors', kiviName.toLowerCase(), 'private')
    const kivi = await record(b, 'authors', kiviName, 'shared')
    const replaced = await record(b, 'authors', unique('Mika Waltari'), 'shared')
    const linna = await record(a, 'authors', unique('Väinö Linna'), 'private')
    const othersOnly = await record(b, 'authors', unique('Kivi Muu'), 'shared')

    await copyOf(a, await sharedBook({ by: a, authors: [kivi.id] }))
    await copyOf(a, await sharedBook({ by: a, authors: [ownKivi.id] }))
    const x = await sharedBook({ by: a, authors: [replaced.id] })
    await copyOf(a, x)
    await copyOf(b, await sharedBook({ by: b, authors: [othersOnly.id] }))

    expect(await suggest(asA, 'author', 'kivi')).toEqual([{ id: kivi.id, name: kiviName }])
    expect(await suggest(asA, 'author', 'waltari')).toEqual([
      { id: replaced.id, name: replaced.name },
    ])

    await upsertUserBook(asA, x.id, { overrides: { authors: [linna.id] } })
    expect(await suggest(asA, 'author', 'linna')).toEqual([{ id: linna.id, name: linna.name }])
    expect(await suggest(asA, 'author', 'waltari')).toEqual([])
    expect(await suggest(asA, 'author', '  ')).toEqual([])
  })

  it("suggests effective series and publishers from the viewer's copies, % matched literally", async () => {
    const a = await createUser({ displayName: 'Suggest Publishers A' })
    const b = await createUser({ displayName: 'Suggest Publishers B' })
    const asA = await contextFor(a)
    const muumit = await record(a, 'series', unique('Muumit'), 'private')
    const peppi = await record(a, 'series', unique('Peppi'), 'private')
    const othersSeries = await record(b, 'series', unique('Muumit'), 'private')

    const x = await sharedBook({ by: a, publisher: '100% Kustannus', series: muumit.id })
    await copyOf(a, x)
    await copyOf(a, await sharedBook({ by: a, publisher: 'WSOY' }))
    await copyOf(b, await sharedBook({ by: b, publisher: '50% Oy', series: othersSeries.id }))

    expect(await suggest(asA, 'publisher', '%')).toEqual([{ id: null, name: '100% Kustannus' }])
    expect(await suggest(asA, 'publisher', 's')).toEqual([
      { id: null, name: '100% Kustannus' },
      { id: null, name: 'WSOY' },
    ])
    expect(await suggest(asA, 'series', 'muumi')).toEqual([{ id: muumit.id, name: muumit.name }])

    await upsertUserBook(asA, x.id, { overrides: { publisher: 'Otava', series: peppi.id } })
    expect(await suggest(asA, 'publisher', '%')).toEqual([])
    expect(await suggest(asA, 'publisher', 'otava')).toEqual([{ id: null, name: 'Otava' }])
    expect(await suggest(asA, 'series', 'muumi')).toEqual([])
    expect(await suggest(asA, 'series', 'peppi')).toEqual([{ id: peppi.id, name: peppi.name }])
  })
})
