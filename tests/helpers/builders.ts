import { randomUUID } from 'node:crypto'

import { getPayload } from 'payload'

import * as gateway from '@/lib/payload/gateway'
import config from '@/payload.config'
import type { Book, Copy, Loan, Person, User } from '@/payload-types'

import { contextFor, createUser } from './harness'
import { randomIsbn } from './isbn'

/** `name` with a per-run suffix: shared name keys are unique and rows stay. */
export const unique = (name: string) => `${name} ${randomUUID().slice(0, 8)}`

export const ownerId = (doc: { owner: number | { id: number } }): number =>
  typeof doc.owner === 'number' ? doc.owner : doc.owner.id

/** What `promise` rejected with, for asserting on the error. */
export const failure = (promise: Promise<unknown>) => promise.catch((e: unknown) => e)

/** A new user and its gateway context. */
export const freshUser = async (data: Partial<User> = {}) => {
  const user = await createUser(data)
  return { user, ctx: await contextFor(user) }
}

/**
 * A shared Book, as `lib/catalogue` writes it: a system write, `by` on the
 * request if given. `data` may override `visibility`.
 */
export const sharedBook = async ({ by, ...data }: Partial<Book> & { by?: User } = {}) =>
  (await getPayload({ config })).create({
    collection: 'books',
    data: { title: 'Kirja', isbn13: randomIsbn(), visibility: 'shared', ...data },
    overrideAccess: true,
    depth: 0,
    ...(by && { req: (await contextFor(by)).req }),
  })

/** A copy created by `user` through the gateway; `owner` only satisfies the create type. */
export const copyAs = async (user: User, data: Pick<Copy, 'book'> & Partial<Copy>) =>
  gateway.create(await contextFor(user), {
    collection: 'copies',
    data: { owner: user.id, status: 'owned', ...data },
    depth: 0,
  })

/**
 * A uniquely named Person created by `user` through the gateway; `owner` and
 * `nameKey` only satisfy the create type, the hooks set both.
 */
export const personAs = async (user: User, data: Partial<Person> = {}) =>
  gateway.create(await contextFor(user), {
    collection: 'people',
    data: { owner: user.id, name: `Liisa ${randomUUID()}`, nameKey: '', ...data },
    depth: 0,
  })

/**
 * A loan created by `user` through the gateway; `owner` only satisfies the
 * create type. `lentOn` defaults to 2026-10-20.
 */
export const loanAs = async (user: User, data: Pick<Loan, 'copy' | 'person'> & Partial<Loan>) =>
  gateway.create(await contextFor(user), {
    collection: 'loans',
    data: { owner: user.id, lentOn: '2026-10-20', ...data },
    depth: 0,
  })
