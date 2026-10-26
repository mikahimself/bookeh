import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { receiveCopy } from '@/lib/copies/receiveCopy'
import { DomainError } from '@/lib/errors'
import { lendCopy } from '@/lib/loans/loans'
import { undo, withUndo } from '@/lib/undo/undo'
import config from '@/payload.config'
import type { Book, Copy, User } from '@/payload-types'

import { contextFor, createUser } from '../helpers/harness'
import { randomIsbn } from '../helpers/isbn'

// `receiveCopy()`, FR-28/AD-18/AD-20: Received makes one of the viewer's
// ordered copies owned at their default location, undoable through
// `withUndo()`.

describe('receiveCopy', () => {
  let payload: Payload
  let book: Book

  const copyFor = async (
    user: User,
    status: Copy['status'],
    location: number | null = null,
  ): Promise<Copy> =>
    payload.create({
      collection: 'copies',
      data: { owner: user.id, book: book.id, status, location },
      overrideAccess: false,
      depth: 0,
      req: (await contextFor(user)).req,
    })

  const stored = async (id: number) => {
    const { status, location } = await payload.findByID({ collection: 'copies', id, depth: 0 })
    return { status, location: location ?? null }
  }

  /** A fresh user whose profile default is a new location "Olohuone". */
  const userWithDefault = async (displayName: string) => {
    const user = await createUser({ displayName })
    const location = await payload.create({
      collection: 'locations',
      data: { owner: user.id, name: 'Olohuone', nameKey: '' },
      overrideAccess: false,
      depth: 0,
      req: (await contextFor(user)).req,
    })
    const updated = await payload.update({
      collection: 'users',
      id: user.id,
      data: { defaultLocation: location.id },
      overrideAccess: true,
    })
    return { user: updated, location }
  }

  const failure = (promise: Promise<unknown>) => promise.catch((e: unknown) => e)

  beforeAll(async () => {
    payload = await getPayload({ config })
    const creator = await createUser({ displayName: 'Receive Copy Book' })
    book = await payload.create({
      collection: 'books',
      data: { title: 'Täällä Pohjantähden alla', isbn13: randomIsbn(), visibility: 'shared' },
      overrideAccess: true,
      depth: 0,
      req: (await contextFor(creator)).req,
    })
  })

  it('receives at the default location, and Undo orders it again', async () => {
    const { user, location } = await userWithDefault('Receive Copy Default')
    const asUser = await contextFor(user)
    const ordered = await copyFor(user, 'ordered')

    const result = await withUndo(asUser, (tx) => receiveCopy(tx, ordered.id))
    expect(result.savedTo).toEqual({ id: location.id, name: 'Olohuone' })
    expect(await stored(ordered.id)).toEqual({ status: 'owned', location: location.id })

    await undo(asUser, result.undoToken)
    expect(await stored(ordered.id)).toEqual({ status: 'ordered', location: null })
  })

  it('skips a copy that is gone on Undo', async () => {
    const { user } = await userWithDefault('Receive Copy Gone')
    const asUser = await contextFor(user)
    const ordered = await copyFor(user, 'ordered')

    const result = await withUndo(asUser, (tx) => receiveCopy(tx, ordered.id))
    await payload.delete({ collection: 'copies', id: ordered.id })

    await expect(undo(asUser, result.undoToken)).resolves.toBeUndefined()
  })

  it('fails the Undo with UNDO_FAILED once the copy is lent, keeping it owned', async () => {
    const { user, location } = await userWithDefault('Receive Copy Lent')
    const asUser = await contextFor(user)
    const ordered = await copyFor(user, 'ordered')

    const result = await withUndo(asUser, (tx) => receiveCopy(tx, ordered.id))
    const { data } = await lendCopy(asUser, ordered.id, { create: 'Liisa' })

    expect(await failure(undo(asUser, result.undoToken))).toMatchObject({ code: 'UNDO_FAILED' })
    expect(await stored(ordered.id)).toEqual({ status: 'owned', location: location.id })
    const loan = await payload.findByID({ collection: 'loans', id: data.loanId, depth: 0 })
    expect(loan.returnedOn ?? null).toBeNull()
  })

  it('receives with no location when there is no default', async () => {
    const user = await createUser({ displayName: 'Receive Copy No Default' })
    const ordered = await copyFor(user, 'ordered')

    const { data } = await receiveCopy(await contextFor(user), ordered.id)
    expect(data.savedTo).toBeNull()
    expect(await stored(ordered.id)).toEqual({ status: 'owned', location: null })
  })

  it("fails with NOT_FOUND on another user's copy and writes nothing", async () => {
    const owner = await createUser({ displayName: 'Receive Copy Owner' })
    const { user: other } = await userWithDefault('Receive Copy Other')
    const ordered = await copyFor(owner, 'ordered')

    const err = await failure(receiveCopy(await contextFor(other), ordered.id))
    expect(err).toBeInstanceOf(DomainError)
    expect(err).toMatchObject({ code: 'NOT_FOUND' })
    expect(await stored(ordered.id)).toEqual({ status: 'ordered', location: null })
  })

  it('fails with VALIDATION on an owned copy and writes nothing', async () => {
    const { user } = await userWithDefault('Receive Copy Owned')
    const owned = await copyFor(user, 'owned')

    const err = await failure(receiveCopy(await contextFor(user), owned.id))
    expect(err).toBeInstanceOf(DomainError)
    expect(err).toMatchObject({ code: 'VALIDATION', fields: { status: 'VALIDATION' } })
    expect(await stored(owned.id)).toEqual({ status: 'owned', location: null })
  })
})
