import { randomUUID } from 'node:crypto'

import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { helsinkiToday } from '@/lib/loans/dates'
import { lendCopy, openLoans, returnLoan } from '@/lib/loans/loans'
import * as gateway from '@/lib/payload/gateway'
import { undo, withUndo } from '@/lib/undo/undo'
import config from '@/payload.config'
import type { Book, Copy, Person, User } from '@/payload-types'

import { contextFor, createUser } from '../helpers/harness'
import { randomIsbn } from '../helpers/isbn'

// `lib/loans`, AD-18/AD-19/AD-20, FR-35/FR-36: Lend opens a loan of my owned
// copy without an open loan, Returned closes it and keeps the row, both
// dated today in Helsinki by default and both undoable. Foreign and bad ids
// write nothing, for the admin too. FR-37/FR-48: `openLoans` lists only the
// viewer's open loans, longest out first.

const noon = (date: string) => `${date}T12:00:00.000Z`

/** The calendar day after `date` (`YYYY-MM-DD`). */
const dayAfter = (date: string) =>
  new Date(Date.parse(`${date}T00:00:00.000Z`) + 86_400_000).toISOString().slice(0, 10)

describe('loans service', () => {
  let payload: Payload
  let shared: Book

  const copyAs = async (
    user: User,
    status: Copy['status'] = 'owned',
    location: number | null = null,
  ): Promise<Copy> =>
    gateway.create(await contextFor(user), {
      collection: 'copies',
      data: { owner: user.id, book: shared.id, status, location },
      depth: 0,
    })

  const personAs = async (user: User, name = `Liisa ${randomUUID()}`): Promise<Person> =>
    gateway.create(await contextFor(user), {
      collection: 'people',
      data: { owner: user.id, name, nameKey: '' },
      depth: 0,
    })

  const storedCopy = async (id: number) => {
    const { status, location } = await payload.findByID({ collection: 'copies', id, depth: 0 })
    return { status, location: location ?? null }
  }

  const storedLoan = async (id: number) => {
    const { docs } = await payload.find({
      collection: 'loans',
      where: { id: { equals: id } },
      depth: 0,
    })
    const doc = docs[0]
    return doc
      ? {
          copy: doc.copy,
          person: doc.person,
          lentOn: doc.lentOn,
          returnedOn: doc.returnedOn ?? null,
        }
      : null
  }

  const loansOf = async (copyId: number) =>
    (
      await payload.find({
        collection: 'loans',
        where: { copy: { equals: copyId } },
        sort: 'id',
        depth: 0,
        pagination: false,
      })
    ).docs.map((doc) => ({ id: doc.id, returnedOn: doc.returnedOn ?? null }))

  const peopleNamed = async (user: User, name: string) =>
    (
      await payload.count({
        collection: 'people',
        where: { and: [{ owner: { equals: user.id } }, { name: { equals: name } }] },
      })
    ).totalDocs

  /** A user with an owned copy at their location "Olohuone" and a Person. */
  const lender = async (displayName: string) => {
    const user = await createUser({ displayName })
    const ctx = await contextFor(user)
    const location = await gateway.create(ctx, {
      collection: 'locations',
      data: { owner: user.id, name: 'Olohuone', nameKey: '' },
      depth: 0,
    })
    const copy = await copyAs(user, 'owned', location.id)
    const person = await personAs(user)
    return { user, ctx, location, copy, person }
  }

  /** A loan of a fresh copy, lent on 2026-10-01. */
  const lentOnFirst = async (displayName: string) => {
    const l = await lender(displayName)
    const { data } = await lendCopy(l.ctx, l.copy.id, l.person.id, '2026-10-01')
    return { ...l, loanId: data.loanId }
  }

  const failure = (promise: Promise<unknown>) => promise.catch((e: unknown) => e)

  beforeAll(async () => {
    payload = await getPayload({ config })
    const creator = await createUser({ displayName: 'Loans Service Book' })
    shared = await payload.create({
      collection: 'books',
      data: { title: 'Seitsemän veljestä', isbn13: randomIsbn(), visibility: 'shared' },
      overrideAccess: true,
      depth: 0,
      req: (await contextFor(creator)).req,
    })
  })

  it('lends an owned copy to a Person today, keeps the copy, and Undo deletes the loan', async () => {
    const { ctx, location, copy, person } = await lender('Lend Default')

    const result = await withUndo(ctx, (tx) => lendCopy(tx, copy.id, person.id))
    expect(result.person).toEqual({ id: person.id, name: person.name })
    expect(await storedLoan(result.loanId)).toEqual({
      copy: copy.id,
      person: person.id,
      lentOn: noon(helsinkiToday()),
      returnedOn: null,
    })
    expect(await storedCopy(copy.id)).toEqual({ status: 'owned', location: location.id })

    await undo(ctx, result.undoToken)
    expect(await storedLoan(result.loanId)).toBeNull()
    expect(await storedCopy(copy.id)).toEqual({ status: 'owned', location: location.id })
  })

  it('lends to a Person by name and keeps the created Person after Undo', async () => {
    const { user, ctx, copy } = await lender('Lend By Name')

    const result = await withUndo(ctx, (tx) => lendCopy(tx, copy.id, { create: 'Liisa K' }))
    expect(result.person.name).toBe('Liisa K')
    expect((await storedLoan(result.loanId))?.person).toBe(result.person.id)

    await undo(ctx, result.undoToken)
    expect(await storedLoan(result.loanId)).toBeNull()
    expect(await peopleNamed(user, 'Liisa K')).toBe(1)
  })

  it('lends on a given date at 12:00 UTC', async () => {
    const { ctx, copy, person } = await lender('Lend Dated')
    const { data } = await lendCopy(ctx, copy.id, person.id, '2026-10-01')
    expect((await storedLoan(data.loanId))?.lentOn).toBe('2026-10-01T12:00:00.000Z')
  })

  it('refuses a future or malformed lending date on lentOn, writing nothing', async () => {
    const { ctx, copy, person } = await lender('Lend Bad Date')
    for (const lentOn of [
      dayAfter(helsinkiToday()),
      '2999-01-01',
      '2026-02-30',
      '26.10.2026',
      '',
    ]) {
      expect(await failure(lendCopy(ctx, copy.id, person.id, lentOn))).toMatchObject({
        code: 'VALIDATION',
        fields: { lentOn: 'VALIDATION' },
      })
    }
    expect(await loansOf(copy.id)).toEqual([])
  })

  it('refuses an ordered or already lent copy on copy, writing nothing', async () => {
    const { user, ctx, copy, person } = await lender('Lend Refused Copy')
    const ordered = await copyAs(user, 'ordered')
    const invalid = { code: 'VALIDATION', fields: { copy: 'VALIDATION' } }

    expect(await failure(lendCopy(ctx, ordered.id, person.id))).toMatchObject(invalid)
    expect(await loansOf(ordered.id)).toEqual([])

    const { data } = await lendCopy(ctx, copy.id, person.id)
    expect(await failure(lendCopy(ctx, copy.id, { create: 'Kalle' }))).toMatchObject(invalid)
    expect((await loansOf(copy.id)).map((loan) => loan.id)).toEqual([data.loanId])
    expect(await peopleNamed(user, 'Kalle')).toBe(0)
  })

  it('lends a copy again once its loan is returned', async () => {
    const { ctx, copy, person, loanId } = await lentOnFirst('Lend Again')
    await returnLoan(ctx, loanId)

    const { data } = await lendCopy(ctx, copy.id, person.id)
    expect(await loansOf(copy.id)).toEqual([
      { id: loanId, returnedOn: noon(helsinkiToday()) },
      { id: data.loanId, returnedOn: null },
    ])
  })

  it("refuses another user's copy and bad ids with NOT_FOUND, writing nothing", async () => {
    const a = await createUser({ displayName: 'Lend Viewer' })
    const admin = await createUser({ displayName: 'Lend Admin', roles: ['admin'] })
    const b = await createUser({ displayName: 'Lend Other' })
    const theirs = await copyAs(b)
    const gone = await copyAs(a)
    await payload.delete({ collection: 'copies', id: gone.id })

    for (const viewer of [a, admin]) {
      const ctx = await contextFor(viewer)
      for (const bad of [theirs.id, gone.id, 0]) {
        expect(await failure(lendCopy(ctx, bad, { create: 'Kalle' }))).toMatchObject({
          code: 'NOT_FOUND',
        })
      }
      expect(await peopleNamed(viewer, 'Kalle')).toBe(0)
    }
    expect(await loansOf(theirs.id)).toEqual([])
  })

  it("refuses another user's Person on person, writing nothing", async () => {
    const { ctx, copy } = await lender('Lend Foreign Person')
    const theirs = await personAs(await createUser({ displayName: 'Lend Person Other' }))

    expect(await failure(lendCopy(ctx, copy.id, theirs.id))).toMatchObject({
      code: 'VALIDATION',
      fields: { person: 'VALIDATION' },
    })
    expect(await loansOf(copy.id)).toEqual([])
  })

  it('returns today or on a given date, keeps the row, and Undo opens it again', async () => {
    const today = await lentOnFirst('Return Default')
    const result = await withUndo(today.ctx, (tx) => returnLoan(tx, today.loanId))
    expect(result.loanId).toBe(today.loanId)
    expect(await storedLoan(today.loanId)).toMatchObject({
      lentOn: '2026-10-01T12:00:00.000Z',
      returnedOn: noon(helsinkiToday()),
    })

    await undo(today.ctx, result.undoToken)
    expect((await storedLoan(today.loanId))?.returnedOn).toBeNull()

    const sameDay = await lentOnFirst('Return Dated')
    await returnLoan(sameDay.ctx, sameDay.loanId, '2026-10-01')
    expect((await storedLoan(sameDay.loanId))?.returnedOn).toBe('2026-10-01T12:00:00.000Z')
  })

  it('refuses a return before the lending day, a malformed date and a returned loan', async () => {
    const { ctx, loanId } = await lentOnFirst('Return Refused')
    for (const returnedOn of ['2026-09-30', '2026-13-01']) {
      expect(await failure(returnLoan(ctx, loanId, returnedOn))).toMatchObject({
        code: 'VALIDATION',
        fields: { returnedOn: 'VALIDATION' },
      })
    }
    expect((await storedLoan(loanId))?.returnedOn).toBeNull()

    await returnLoan(ctx, loanId, '2026-10-02')
    expect(await failure(returnLoan(ctx, loanId))).toMatchObject({
      code: 'VALIDATION',
      fields: { loan: 'VALIDATION' },
    })
    expect((await storedLoan(loanId))?.returnedOn).toBe('2026-10-02T12:00:00.000Z')
  })

  it("refuses another user's loan and bad ids with NOT_FOUND, writing nothing", async () => {
    const a = await lender('Return Viewer')
    const admin = await createUser({ displayName: 'Return Admin', roles: ['admin'] })
    const theirs = await lentOnFirst('Return Other')
    const gone = await lendCopy(a.ctx, a.copy.id, a.person.id)
    await payload.delete({ collection: 'loans', id: gone.data.loanId })

    for (const viewer of [a.user, admin]) {
      const ctx = await contextFor(viewer)
      for (const bad of [theirs.loanId, gone.data.loanId, 0]) {
        expect(await failure(returnLoan(ctx, bad))).toMatchObject({ code: 'NOT_FOUND' })
      }
    }
    expect((await storedLoan(theirs.loanId))?.returnedOn).toBeNull()
  })

  it('skips a loan that is gone on the Undo of a lend or a return', async () => {
    const { ctx, copy, person } = await lender('Undo Gone Loan')
    const lent = await withUndo(ctx, (tx) => lendCopy(tx, copy.id, person.id))
    await payload.delete({ collection: 'loans', id: lent.loanId })
    await expect(undo(ctx, lent.undoToken)).resolves.toBeUndefined()

    const other = await lentOnFirst('Undo Gone Return')
    const returned = await withUndo(other.ctx, (tx) => returnLoan(tx, other.loanId))
    await payload.delete({ collection: 'loans', id: other.loanId })
    await expect(undo(other.ctx, returned.undoToken)).resolves.toBeUndefined()
  })

  it('fails the Undo of a return with UNDO_FAILED once the copy is lent again', async () => {
    const { ctx, copy, person, loanId } = await lentOnFirst('Return Undo Lent Again')
    const result = await withUndo(ctx, (tx) => returnLoan(tx, loanId))
    const again = await lendCopy(ctx, copy.id, person.id)
    const before = await loansOf(copy.id)

    expect(await failure(undo(ctx, result.undoToken))).toMatchObject({ code: 'UNDO_FAILED' })
    expect(await loansOf(copy.id)).toEqual(before)
    expect(before).toEqual([
      { id: loanId, returnedOn: noon(helsinkiToday()) },
      { id: again.data.loanId, returnedOn: null },
    ])
  })

  it("lists only the viewer's open loans, longest out first, ties by id", async () => {
    const { user, ctx, copy, person } = await lender('Open Loans Viewer')
    const second = await copyAs(user)
    const third = await copyAs(user)
    const returned = await copyAs(user)
    const antti = await personAs(user, `Antti ${randomUUID()}`)
    const first = await lendCopy(ctx, second.id, antti.id, '2026-09-01')
    const next = await lendCopy(ctx, third.id, antti.id, '2026-09-12')
    // Moved onto `next`'s day after it: the lower id is no longer the first row stored.
    await gateway.updateByID(ctx, {
      collection: 'loans',
      id: first.data.loanId,
      data: { lentOn: '2026-09-12' },
      depth: 0,
    })
    const oldest = await lendCopy(ctx, copy.id, person.id, '2026-07-02')
    const closed = await lendCopy(ctx, returned.id, person.id, '2026-06-01')
    await returnLoan(ctx, closed.data.loanId, '2026-06-02')

    const admin = await createUser({ displayName: 'Open Loans Admin', roles: ['admin'] })
    const adminCtx = await contextFor(admin)
    const adminCopy = await copyAs(admin)
    const adminLoan = await lendCopy(adminCtx, adminCopy.id, { create: 'Kalle' }, '2026-01-01')

    const named = (p: Person) => ({ id: p.id, name: p.name })
    expect(await openLoans(ctx)).toEqual([
      {
        loanId: oldest.data.loanId,
        copyId: copy.id,
        bookId: shared.id,
        person: named(person),
        since: '2026-07-02',
      },
      {
        loanId: first.data.loanId,
        copyId: second.id,
        bookId: shared.id,
        person: named(antti),
        since: '2026-09-12',
      },
      {
        loanId: next.data.loanId,
        copyId: third.id,
        bookId: shared.id,
        person: named(antti),
        since: '2026-09-12',
      },
    ])
    expect((await openLoans(adminCtx)).map((loan) => loan.loanId)).toEqual([adminLoan.data.loanId])
  })
})
