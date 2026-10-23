import { randomUUID } from 'node:crypto'

import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { upsertUserBook } from '@/lib/books/upsertUserBook'
import * as gateway from '@/lib/payload/gateway'
import { filterValues } from '@/lib/shelf/filterValues'
import { suggest } from '@/lib/shelf/suggest'
import config from '@/payload.config'
import type { Book, User } from '@/payload-types'

import { contextFor, createUser } from '../helpers/harness'
import { randomIsbn } from '../helpers/isbn'

// `filterValues()` and `suggest()`, AD-7: values in use on the viewer's
// copies only (two-user access test), counted in copies and in name order,
// effective values (AD-6) applied, read from the viewer's own `user-books`
// row (a missing row is unread); suggestions distinct on name key, the
// shared id first, with `%` matched literally.
// Each test has its own users. Shared name keys are unique and rows stay, so
// names carry a per-run suffix.

const unique = (name: string) => `${name} ${randomUUID().slice(0, 8)}`

describe('shelf filter values and suggestions', () => {
  let payload: Payload

  const reqFor = async (user: User) => (await contextFor(user)).req

  const sharedBook = async (by: User, data: Partial<Book> = {}) =>
    payload.create({
      collection: 'books',
      data: { title: 'Kirja', isbn13: randomIsbn(), visibility: 'shared', ...data },
      overrideAccess: true,
      depth: 0,
      req: await reqFor(by),
    })

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
      data: { owner: user.id, book: book.id, status: 'owned', ...data },
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

    const x = await sharedBook(a, { genres: [fiction.id, biography.id], language: 'fi' })
    const y = await sharedBook(a, { language: 'en' })
    const w = await sharedBook(a, { genres: [biography.id] })
    await copyOf(a, x, { location: hylly.id })
    await copyOf(a, x, { location: hylly.id })
    await copyOf(a, y, { status: 'ordered' })
    await copyOf(a, w, { location: arkku.id })

    const z = await sharedBook(b, { genres: [other.id], language: 'de' })
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

    await copyOf(a, await sharedBook(a, { authors: [kivi.id] }))
    await copyOf(a, await sharedBook(a, { authors: [ownKivi.id] }))
    const x = await sharedBook(a, { authors: [replaced.id] })
    await copyOf(a, x)
    await copyOf(b, await sharedBook(b, { authors: [othersOnly.id] }))

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

    const x = await sharedBook(a, { publisher: '100% Kustannus', series: muumit.id })
    await copyOf(a, x)
    await copyOf(a, await sharedBook(a, { publisher: 'WSOY' }))
    await copyOf(b, await sharedBook(b, { publisher: '50% Oy', series: othersSeries.id }))

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
