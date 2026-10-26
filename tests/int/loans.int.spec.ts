import { randomUUID } from 'node:crypto'

import { Forbidden, getPayload, NotFound, type Payload, ValidationError } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import * as gateway from '@/lib/payload/gateway'
import config from '@/payload.config'
import type { Book, Loan, User } from '@/payload-types'

import { contextFor, createUser } from '../helpers/harness'
import { randomIsbn } from '../helpers/isbn'
import { rejectedPaths } from '../helpers/validation'

// `loans`, AD-1/AD-8/AD-17/AD-19, FR-35/FR-36: owner from the request,
// owner-scoped access that binds the admin too, `copy` and `person` that must
// be the user's own rows (foreign ids), calendar dates at 12:00 UTC and one
// open loan per copy in the database.

const ownerId = (doc: { owner: number | User }): number =>
  typeof doc.owner === 'number' ? doc.owner : doc.owner.id

describe('loans', () => {
  let payload: Payload
  let a: User
  let b: User
  let admin: User
  let shared: Book

  const copyAs = async (user: User) =>
    gateway.create(await contextFor(user), {
      collection: 'copies',
      data: { owner: user.id, book: shared.id, status: 'owned' },
      depth: 0,
    })

  /** A uniquely named Person; `owner` and `nameKey` only satisfy the create type. */
  const personAs = async (user: User) =>
    gateway.create(await contextFor(user), {
      collection: 'people',
      data: { owner: user.id, name: `Liisa ${randomUUID()}`, nameKey: 'ignored' },
      depth: 0,
    })

  /** A loan created by `user` through the gateway; `owner` only satisfies the create type. */
  const loanAs = async (
    user: User,
    data: Pick<Loan, 'copy' | 'person'> & Partial<Loan>,
  ): Promise<Loan> =>
    gateway.create(await contextFor(user), {
      collection: 'loans',
      data: { owner: user.id, lentOn: '2026-10-20', ...data },
      depth: 0,
    })

  /** A fresh copy and Person of A's, lent on 2026-10-20. */
  const openLoan = async (data: Partial<Loan> = {}) => {
    const [copy, person] = await Promise.all([copyAs(a), personAs(a)])
    return loanAs(a, { copy: copy.id, person: person.id, ...data })
  }

  const update = async (user: User, id: number, data: Partial<Loan>) =>
    gateway.updateByID(await contextFor(user), { collection: 'loans', id, data, depth: 0 })

  const systemRead = (id: number) => payload.findByID({ collection: 'loans', id, depth: 0 })

  beforeAll(async () => {
    payload = await getPayload({ config })
    a = await createUser({ displayName: 'Loans User A' })
    b = await createUser({ displayName: 'Loans User B' })
    admin = await createUser({ displayName: 'Loans Admin', roles: ['admin'] })
    shared = await payload.create({
      collection: 'books',
      data: { title: 'Seitsemän veljestä', isbn13: randomIsbn(), visibility: 'shared' },
      overrideAccess: true,
      depth: 0,
      req: (await contextFor(a)).req,
    })
  })

  it('saves a loan for the request user with its dates at 12:00 UTC', async () => {
    const loan = await openLoan({ owner: b.id })
    expect(ownerId(loan)).toBe(a.id)
    expect(loan.lentOn).toBe('2026-10-20T12:00:00.000Z')
    expect(loan.returnedOn ?? null).toBeNull()

    const asA = await contextFor(a)
    expect((await gateway.findByID(asA, { collection: 'loans', id: loan.id })).id).toBe(loan.id)
    const found = await gateway.find(asA, {
      collection: 'loans',
      where: { id: { equals: loan.id } },
    })
    expect(found.docs.map((doc) => doc.id)).toEqual([loan.id])

    const late = await openLoan({ lentOn: '2026-10-20T23:30:00.000Z' })
    expect(late.lentOn).toBe('2026-10-20T12:00:00.000Z')
    const returned = await update(a, late.id, { returnedOn: '2026-10-22T05:00:00.000Z' })
    expect(returned.returnedOn).toBe('2026-10-22T12:00:00.000Z')
    expect(returned.lentOn).toBe('2026-10-20T12:00:00.000Z')
  })

  it("rejects another user's copy or Person", async () => {
    const [ownCopy, ownPerson, foreignCopy, foreignPerson] = await Promise.all([
      copyAs(a),
      personAs(a),
      copyAs(b),
      personAs(b),
    ])
    expect(await rejectedPaths(loanAs(a, { copy: foreignCopy.id, person: ownPerson.id }))).toEqual([
      'copy',
    ])
    expect(await rejectedPaths(loanAs(a, { copy: ownCopy.id, person: foreignPerson.id }))).toEqual([
      'person',
    ])
    const { totalDocs } = await payload.count({
      collection: 'loans',
      where: { copy: { in: [ownCopy.id, foreignCopy.id] } },
    })
    expect(totalDocs).toBe(0)
  })

  it('hides a loan from another user and the admin, and refuses their writes', async () => {
    const loan = await openLoan()
    for (const user of [b, admin]) {
      const ctx = await contextFor(user)
      const seen = await gateway.find(ctx, {
        collection: 'loans',
        where: { id: { equals: loan.id } },
      })
      expect(seen.docs).toEqual([])
      await expect(gateway.findByID(ctx, { collection: 'loans', id: loan.id })).rejects.toThrow(
        NotFound,
      )
      await expect(update(user, loan.id, { returnedOn: '2026-10-21' })).rejects.toThrow(Forbidden)
      await expect(gateway.deleteByID(ctx, { collection: 'loans', id: loan.id })).rejects.toThrow(
        Forbidden,
      )
    }
    const unchanged = await systemRead(loan.id)
    expect(unchanged.returnedOn ?? null).toBeNull()
    expect(ownerId(unchanged)).toBe(a.id)
  })

  it('allows one open loan per copy and any number of returned ones', async () => {
    const first = await openLoan()
    const copy = first.copy as number
    const person = first.person as number
    await expect(loanAs(a, { copy, person, lentOn: '2026-10-21' })).rejects.toThrow(ValidationError)

    await update(a, first.id, { returnedOn: '2026-10-21' })
    const second = await loanAs(a, { copy, person, lentOn: '2026-10-22' })
    await update(a, second.id, { returnedOn: '2026-10-23' })
    const third = await loanAs(a, { copy, person, lentOn: '2026-10-24' })
    expect(third.returnedOn ?? null).toBeNull()
  })

  it('rejects a return before the lending day and accepts the same day', async () => {
    const loan = await openLoan()
    expect(await rejectedPaths(update(a, loan.id, { returnedOn: '2026-10-19' }))).toEqual([
      'returnedOn',
    ])
    expect((await systemRead(loan.id)).returnedOn ?? null).toBeNull()
    const returned = await update(a, loan.id, { returnedOn: '2026-10-20T00:30:00.000Z' })
    expect(returned.returnedOn).toBe('2026-10-20T12:00:00.000Z')
  })
})
