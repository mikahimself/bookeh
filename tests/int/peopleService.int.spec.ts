import { randomUUID } from 'node:crypto'

import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import * as gateway from '@/lib/payload/gateway'
import { withTransaction } from '@/lib/payload/transaction'
import {
  createPerson,
  deletePerson,
  lendingPeople,
  mergePerson,
  personUse,
  renamePerson,
  resolvePerson,
} from '@/lib/people/people'
import config from '@/payload.config'
import type { Book, Loan, Person, User, WishlistEntry } from '@/payload-types'

import { contextFor, createUser } from '../helpers/harness'
import { randomIsbn } from '../helpers/isbn'

// `lib/people`, AD-18/FR-34: a Person `Ref` resolves only to my own People or
// matches a name of mine; "Add person" and rename fail `NAME_TAKEN` with the
// other's id; a merge moves every loan and wishlist entry in one transaction; a
// Person with any loan or entry (open or closed) cannot be deleted;
// `personUse` counts my loans and entries per Person. Foreign and bad ids
// write nothing, for the admin too.

describe('people service', () => {
  let payload: Payload
  let shared: Book

  const personAs = async (user: User, name: string): Promise<Person> =>
    gateway.create(await contextFor(user), {
      collection: 'people',
      data: { owner: user.id, name, nameKey: '' },
      depth: 0,
    })

  /** A loan of a fresh copy of `user`'s; `owner` only satisfies the create type. */
  const loanAs = async (
    user: User,
    person: number,
    returnedOn?: string,
    lentOn = '2026-10-20',
  ): Promise<Loan> => {
    const ctx = await contextFor(user)
    const copy = await gateway.create(ctx, {
      collection: 'copies',
      data: { owner: user.id, book: shared.id, status: 'owned' },
      depth: 0,
    })
    return gateway.create(ctx, {
      collection: 'loans',
      data: {
        owner: user.id,
        copy: copy.id,
        person,
        lentOn,
        ...(returnedOn && { returnedOn }),
      },
      depth: 0,
    })
  }

  /** A uniquely named list; `owner` and `nameKey` only satisfy the create type. */
  const wishlistAs = async (user: User) =>
    gateway.create(await contextFor(user), {
      collection: 'wishlists',
      data: { owner: user.id, name: `Wishes ${randomUUID()}`, nameKey: 'ignored' },
      depth: 0,
    })

  /** An entry of `user`'s for `forPerson` (null: their own wish), closed when `closedAt` is given. */
  const entryAs = async (
    user: User,
    forPerson: number | null,
    closedAt?: string,
  ): Promise<WishlistEntry> =>
    gateway.create(await contextFor(user), {
      collection: 'wishlist-entries',
      data: {
        owner: user.id,
        wishlist: (await wishlistAs(user)).id,
        book: shared.id,
        forPerson,
        ...(closedAt && { closedAt }),
      },
      depth: 0,
    })

  const entryRead = async (entry: WishlistEntry) => {
    const doc = await payload.findByID({ collection: 'wishlist-entries', id: entry.id, depth: 0 })
    return { forPerson: doc.forPerson, closedAt: doc.closedAt ?? null }
  }

  const stored = async (id: number) => {
    const { docs } = await payload.find({
      collection: 'people',
      where: { id: { equals: id } },
      depth: 0,
    })
    const doc = docs[0]
    return doc ? { name: doc.name, nameKey: doc.nameKey } : null
  }

  const personOf = async (loan: Loan) =>
    (await payload.findByID({ collection: 'loans', id: loan.id, depth: 0 })).person

  const peopleOf = async (user: User) =>
    (
      await payload.find({
        collection: 'people',
        where: { owner: { equals: user.id } },
        sort: 'name',
        depth: 0,
        pagination: false,
      })
    ).docs.map(({ name }) => name)

  const failure = (promise: Promise<unknown>) => promise.catch((e: unknown) => e)

  beforeAll(async () => {
    payload = await getPayload({ config })
    const creator = await createUser({ displayName: 'People Service Book' })
    shared = await payload.create({
      collection: 'books',
      data: { title: 'Seitsemän veljestä', isbn13: randomIsbn(), visibility: 'shared' },
      overrideAccess: true,
      depth: 0,
      req: (await contextFor(creator)).req,
    })
  })

  it('resolves my own id, matches my name by nameKey and creates a new one', async () => {
    const a = await createUser({ displayName: 'Resolve Person' })
    const asA = await contextFor(a)
    const antti = await personAs(a, 'Antti')

    expect(await resolvePerson(asA, antti.id)).toBe(antti.id)
    expect(await resolvePerson(asA, { create: '  ANTTI ' })).toBe(antti.id)
    const liisa = await resolvePerson(asA, { create: 'Liisa  K' })

    expect(await stored(liisa)).toEqual({ name: 'Liisa K', nameKey: 'liisa k' })
    expect(await peopleOf(a)).toEqual(['Antti', 'Liisa K'])
  })

  it('refuses a foreign or bad id and a blank or long name on person, writing nothing', async () => {
    const a = await createUser({ displayName: 'Resolve Person Viewer' })
    const admin = await createUser({ displayName: 'Resolve Person Admin', roles: ['admin'] })
    const b = await createUser({ displayName: 'Resolve Person Other' })
    const theirs = await personAs(b, 'Antti')
    const gone = await personAs(a, 'Gone')
    await payload.delete({ collection: 'people', id: gone.id })

    const invalid = { code: 'VALIDATION', fields: { person: 'VALIDATION' } }
    for (const viewer of [a, admin]) {
      const ctx = await contextFor(viewer)
      for (const bad of [theirs.id, gone.id, 0]) {
        expect(await failure(resolvePerson(ctx, bad))).toMatchObject(invalid)
      }
    }
    const asA = await contextFor(a)
    expect(await failure(resolvePerson(asA, { create: '   ' }))).toMatchObject(invalid)
    expect(await failure(resolvePerson(asA, { create: 'x'.repeat(201) }))).toMatchObject({
      code: 'VALIDATION',
      fields: { person: 'TOO_LONG' },
    })

    expect(await peopleOf(a)).toEqual([])
    expect(await peopleOf(admin)).toEqual([])
  })

  it("matches and takes names among my own People only, never another user's", async () => {
    const a = await createUser({ displayName: 'Own Names Viewer' })
    const admin = await createUser({ displayName: 'Own Names Admin', roles: ['admin'] })
    const b = await createUser({ displayName: 'Own Names Other' })
    const antti = await personAs(b, 'Antti')
    const liisa = await personAs(b, 'Liisa')

    for (const viewer of [a, admin]) {
      const ctx = await contextFor(viewer)
      const resolved = await resolvePerson(ctx, { create: 'Antti' })
      const created = await createPerson(ctx, 'Liisa')
      expect([resolved, created]).not.toContain(antti.id)
      expect([resolved, created]).not.toContain(liisa.id)
      expect(await peopleOf(viewer)).toEqual(['Antti', 'Liisa'])
    }
    expect(await peopleOf(b)).toEqual(['Antti', 'Liisa'])
  })

  it("adds a person, and fails NAME_TAKEN with the existing one's id", async () => {
    const a = await createUser({ displayName: 'Add Person' })
    const asA = await contextFor(a)

    const liisa = await createPerson(asA, 'Liisa')
    expect(await stored(liisa)).toEqual({ name: 'Liisa', nameKey: 'liisa' })
    expect(await failure(createPerson(asA, 'liisa'))).toMatchObject({
      code: 'NAME_TAKEN',
      conflictId: liisa,
    })
    expect(await failure(createPerson(asA, '   '))).toMatchObject({
      code: 'VALIDATION',
      fields: { name: 'VALIDATION' },
    })
    expect(await failure(createPerson(asA, 'x'.repeat(201)))).toMatchObject({
      code: 'VALIDATION',
      fields: { name: 'TOO_LONG' },
    })
    expect(await peopleOf(a)).toEqual(['Liisa'])
  })

  it('renames a person, normalised, and allows a case-only rename of itself', async () => {
    const a = await createUser({ displayName: 'Rename Person' })
    const asA = await contextFor(a)
    const antti = await personAs(a, 'Antti')
    const liisa = await personAs(a, 'liisa')

    await renamePerson(asA, antti.id, '  Antti   K ')
    await renamePerson(asA, liisa.id, 'Liisa')

    expect(await stored(antti.id)).toEqual({ name: 'Antti K', nameKey: 'antti k' })
    expect(await stored(liisa.id)).toEqual({ name: 'Liisa', nameKey: 'liisa' })

    expect(await failure(renamePerson(asA, antti.id, '   '))).toMatchObject({
      code: 'VALIDATION',
      fields: { name: 'VALIDATION' },
    })
    expect(await failure(renamePerson(asA, antti.id, 'x'.repeat(201)))).toMatchObject({
      code: 'VALIDATION',
      fields: { name: 'TOO_LONG' },
    })
    expect(await stored(antti.id)).toEqual({ name: 'Antti K', nameKey: 'antti k' })
  })

  it("fails a rename onto a taken name with NAME_TAKEN and the other's id", async () => {
    const a = await createUser({ displayName: 'Rename Person Taken' })
    const antti = await personAs(a, 'Antti')
    const liisa = await personAs(a, 'Liisa')

    expect(await failure(renamePerson(await contextFor(a), antti.id, 'LIISA'))).toMatchObject({
      code: 'NAME_TAKEN',
      conflictId: liisa.id,
    })
    expect(await stored(antti.id)).toEqual({ name: 'Antti', nameKey: 'antti' })
  })

  it("refuses another user's Person and bad ids with NOT_FOUND, writing nothing", async () => {
    const a = await createUser({ displayName: 'People Viewer' })
    const admin = await createUser({ displayName: 'People Admin', roles: ['admin'] })
    const b = await createUser({ displayName: 'People Other' })
    const theirs = await personAs(b, 'Antti')
    const theirLoan = await loanAs(b, theirs.id)
    const gone = await personAs(a, 'Gone')
    await payload.delete({ collection: 'people', id: gone.id })
    const mine = await personAs(a, 'Liisa')
    const mineAsAdmin = await personAs(admin, 'Liisa')

    const notFound = { code: 'NOT_FOUND' }
    for (const [viewer, own] of [
      [a, mine.id],
      [admin, mineAsAdmin.id],
    ] as const) {
      const ctx = await contextFor(viewer)
      for (const bad of [theirs.id, gone.id, 0]) {
        expect(await failure(renamePerson(ctx, bad, 'Kalle'))).toMatchObject(notFound)
        expect(await failure(mergePerson(ctx, bad, own))).toMatchObject(notFound)
        expect(await failure(mergePerson(ctx, own, bad))).toMatchObject(notFound)
        expect(await failure(deletePerson(ctx, bad))).toMatchObject(notFound)
      }
    }

    expect(await stored(theirs.id)).toEqual({ name: 'Antti', nameKey: 'antti' })
    expect(await personOf(theirLoan)).toBe(theirs.id)
    expect(await stored(mine.id)).toEqual({ name: 'Liisa', nameKey: 'liisa' })
    expect(await stored(mineAsAdmin.id)).toEqual({ name: 'Liisa', nameKey: 'liisa' })
  })

  it('moves every loan and entry of the source to the target, then deletes the source', async () => {
    const a = await createUser({ displayName: 'Merge Person' })
    const source = await personAs(a, 'Antti')
    const target = await personAs(a, 'Antti K')
    const other = await personAs(a, 'Liisa')
    const open = await loanAs(a, source.id)
    const returned = await loanAs(a, source.id, '2026-10-22')
    const targets = await loanAs(a, target.id)
    const others = await loanAs(a, other.id)
    const closedAt = '2026-10-23T10:00:00.000Z'
    const openEntry = await entryAs(a, source.id)
    const closedEntry = await entryAs(a, source.id, closedAt)
    const targetsEntry = await entryAs(a, target.id)
    const othersEntry = await entryAs(a, other.id)

    await mergePerson(await contextFor(a), source.id, target.id)

    expect(await stored(source.id)).toBeNull()
    expect(await personOf(open)).toBe(target.id)
    expect(await personOf(returned)).toBe(target.id)
    expect(await personOf(targets)).toBe(target.id)
    expect(await personOf(others)).toBe(other.id)
    expect(await entryRead(openEntry)).toEqual({ forPerson: target.id, closedAt: null })
    expect(await entryRead(closedEntry)).toEqual({ forPerson: target.id, closedAt })
    expect(await entryRead(targetsEntry)).toEqual({ forPerson: target.id, closedAt: null })
    expect(await entryRead(othersEntry)).toEqual({ forPerson: other.id, closedAt: null })
  })

  it('refuses to merge a Person into itself with VALIDATION', async () => {
    const a = await createUser({ displayName: 'Merge Person Itself' })
    const p = await personAs(a, 'Antti')
    const loan = await loanAs(a, p.id)

    expect(await failure(mergePerson(await contextFor(a), p.id, p.id))).toMatchObject({
      code: 'VALIDATION',
    })
    expect(await stored(p.id)).toEqual({ name: 'Antti', nameKey: 'antti' })
    expect(await personOf(loan)).toBe(p.id)
  })

  it("rolls a merge back with the caller's transaction", async () => {
    const a = await createUser({ displayName: 'Merge Person Rollback' })
    const source = await personAs(a, 'Antti')
    const target = await personAs(a, 'Liisa')
    const loan = await loanAs(a, source.id)
    const entry = await entryAs(a, source.id)

    const e = new Error('after')
    await expect(
      withTransaction(await contextFor(a), async (tx) => {
        await mergePerson(tx, source.id, target.id)
        throw e
      }),
    ).rejects.toBe(e)

    expect(await stored(source.id)).not.toBeNull()
    expect(await personOf(loan)).toBe(source.id)
    expect((await entryRead(entry)).forPerson).toBe(source.id)
  })

  it('deletes an unused Person and refuses one with any loan or entry with PERSON_IN_USE', async () => {
    const a = await createUser({ displayName: 'Delete Person' })
    const asA = await contextFor(a)
    const unused = await personAs(a, 'Antti')
    const returned = await personAs(a, 'Liisa')
    const open = await personAs(a, 'Kalle')
    const wished = await personAs(a, 'Aino')
    const wishedOnce = await personAs(a, 'Bea')
    await loanAs(a, returned.id, '2026-10-22')
    await loanAs(a, open.id)
    const openEntry = await entryAs(a, wished.id)
    const closedEntry = await entryAs(a, wishedOnce.id, '2026-10-23T10:00:00.000Z')
    // An own wish (no recipient) names no one.
    await entryAs(a, null)

    await deletePerson(asA, unused.id)
    expect(await stored(unused.id)).toBeNull()

    for (const p of [returned, open, wished, wishedOnce]) {
      expect(await failure(deletePerson(asA, p.id))).toMatchObject({ code: 'PERSON_IN_USE' })
      expect(await stored(p.id)).not.toBeNull()
    }
    expect((await entryRead(openEntry)).forPerson).toBe(wished.id)
    expect((await entryRead(closedEntry)).forPerson).toBe(wishedOnce.id)
  })

  it('counts loans and entries per Person by name, zero included, and never lists another user', async () => {
    const a = await createUser({ displayName: 'Person Use' })
    const b = await createUser({ displayName: 'Person Use Other' })
    const admin = await createUser({ displayName: 'Person Use Admin', roles: ['admin'] })
    const kalle = await personAs(admin, 'Kalle')
    const liisa = await personAs(a, 'Liisa')
    const antti = await personAs(a, 'Antti')
    await loanAs(a, antti.id)
    await loanAs(a, antti.id, '2026-10-22')
    await entryAs(a, antti.id)
    await entryAs(a, antti.id, '2026-10-23T10:00:00.000Z')
    await entryAs(a, null)
    const theirs = await personAs(b, 'Aino')
    await loanAs(b, theirs.id)
    await entryAs(b, theirs.id)

    expect(await personUse(await contextFor(a))).toEqual([
      { id: antti.id, name: 'Antti', loans: 2, entries: 2 },
      { id: liisa.id, name: 'Liisa', loans: 0, entries: 0 },
    ])
    expect(await personUse(await contextFor(admin))).toEqual([
      { id: kalle.id, name: 'Kalle', loans: 0, entries: 0 },
    ])
  })

  it('lists my People by latest loan, then by name, and never another user', async () => {
    const a = await createUser({ displayName: 'Lending People' })
    const b = await createUser({ displayName: 'Lending People Other' })
    const admin = await createUser({ displayName: 'Lending People Admin', roles: ['admin'] })
    const bea = await personAs(a, 'Bea')
    const leena = await personAs(a, 'Leena')
    const antti = await personAs(a, 'Antti')
    await loanAs(a, leena.id, '2026-10-05', '2026-10-01')
    await loanAs(a, antti.id, undefined, '2026-10-20')
    // Older, and read after the newer one: the newest `lentOn` decides, not the last read.
    await loanAs(a, antti.id, '2026-09-05', '2026-09-01')
    const aino = await personAs(b, 'Aino')
    await loanAs(b, aino.id)

    expect(await lendingPeople(await contextFor(a))).toEqual([
      { id: antti.id, name: 'Antti' },
      { id: leena.id, name: 'Leena' },
      { id: bea.id, name: 'Bea' },
    ])
    expect(await lendingPeople(await contextFor(b))).toEqual([{ id: aino.id, name: 'Aino' }])
    expect(await lendingPeople(await contextFor(admin))).toEqual([])
  })
})
