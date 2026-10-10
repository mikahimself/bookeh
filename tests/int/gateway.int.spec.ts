import { Forbidden, getPayload, NotFound } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import config from '@/payload.config'
import type { User } from '@/payload-types'

import { contextFor, createUser } from '../helpers/harness'

// `users` access: read and update admin or self, create and delete admin only.
// Two `user`-role users show the gateway runs that access as the context user.
describe('gateway', () => {
  let a: User
  let b: User
  let ctx: Context

  beforeAll(async () => {
    a = await createUser({ displayName: 'Gateway A' })
    b = await createUser({ displayName: 'Gateway B' })
    ctx = await contextFor(a)
  })

  it('does not read another user by ID', async () => {
    await expect(gateway.findByID(ctx, { collection: 'users', id: b.id })).rejects.toThrow(NotFound)
    const own = await gateway.findByID(ctx, { collection: 'users', id: a.id })
    expect(own.displayName).toBe('Gateway A')
  })

  it('lists only the context user', async () => {
    const other = await gateway.find(ctx, { collection: 'users', where: { id: { equals: b.id } } })
    expect(other.docs).toEqual([])
    const all = await gateway.find(ctx, { collection: 'users' })
    expect(all.docs.map((d) => d.id)).toEqual([a.id])
  })

  it('counts only the context user', async () => {
    expect(await gateway.count(ctx, { collection: 'users' })).toEqual({ totalDocs: 1 })
  })

  it('does not update another user', async () => {
    await expect(
      gateway.updateByID(ctx, { collection: 'users', id: b.id, data: { displayName: 'Hijacked' } }),
    ).rejects.toThrow(Forbidden)
    const payload = await getPayload({ config })
    const unchanged = await payload.findByID({ collection: 'users', id: b.id })
    expect(unchanged.displayName).toBe('Gateway B')
  })

  it('updates the context user', async () => {
    const updated = await gateway.updateByID(ctx, {
      collection: 'users',
      id: a.id,
      data: { displayName: 'Gateway A' },
    })
    expect(updated.id).toBe(a.id)
  })

  it('does not create a user', async () => {
    await expect(
      gateway.create(ctx, {
        collection: 'users',
        data: {
          email: `gateway-${a.id}@test.invalid`,
          password: 'test-password',
          displayName: 'Created',
          roles: ['user'],
          language: 'en',
          profileVisibility: 'hidden',
          collectionVisibility: 'closed',
        },
      }),
    ).rejects.toThrow(Forbidden)
  })

  it('does not delete the context user', async () => {
    await expect(gateway.deleteByID(ctx, { collection: 'users', id: a.id })).rejects.toThrow(
      Forbidden,
    )
  })

  // The option types leave these keys out; `escalate` stands in for a caller
  // that gets them past the compiler. Each case expects the unescalated outcome.
  const escalate = <T extends object>(options: T): T => ({
    ...options,
    overrideAccess: true,
    user: b,
    showHiddenFields: true,
  })

  it.each<[string, () => Promise<void>]>([
    [
      'find',
      async () => {
        const found = await gateway.find(ctx, escalate({ collection: 'users' as const }))
        expect(found.docs.map((d) => d.id)).toEqual([a.id])
      },
    ],
    [
      'findByID',
      async () => {
        await expect(
          gateway.findByID(ctx, escalate({ collection: 'users' as const, id: b.id })),
        ).rejects.toThrow(NotFound)
        const own = await gateway.findByID(
          ctx,
          escalate({ collection: 'users' as const, id: a.id }),
        )
        expect(own).not.toHaveProperty('hash')
        expect(own).not.toHaveProperty('salt')
      },
    ],
    [
      'count',
      async () => {
        expect(await gateway.count(ctx, escalate({ collection: 'users' as const }))).toEqual({
          totalDocs: 1,
        })
      },
    ],
    [
      'create',
      async () => {
        await expect(
          gateway.create(
            ctx,
            escalate({
              collection: 'users' as const,
              data: {
                email: `gateway-escalated-${a.id}@test.invalid`,
                password: 'test-password',
                displayName: 'Created',
                roles: ['user' as const],
                language: 'en' as const,
                profileVisibility: 'hidden' as const,
                collectionVisibility: 'closed' as const,
              },
            }),
          ),
        ).rejects.toThrow(Forbidden)
      },
    ],
    [
      'updateByID',
      async () => {
        await expect(
          gateway.updateByID(
            ctx,
            escalate({ collection: 'users' as const, id: b.id, data: { displayName: 'Hijacked' } }),
          ),
        ).rejects.toThrow(Forbidden)
        const payload = await getPayload({ config })
        const unchanged = await payload.findByID({ collection: 'users', id: b.id })
        expect(unchanged.displayName).toBe('Gateway B')
      },
    ],
    [
      'deleteByID',
      async () => {
        await expect(
          gateway.deleteByID(ctx, escalate({ collection: 'users' as const, id: a.id })),
        ).rejects.toThrow(Forbidden)
      },
    ],
  ])('%s ignores overrideAccess, user and showHiddenFields in the options', async (_, run) => {
    await run()
  })

  it('would expose hidden fields and other users without the gateway', async () => {
    // Control for the cases above: the same options straight to the Local API.
    const payload = await getPayload({ config })
    const all = await payload.find({ collection: 'users', overrideAccess: true })
    expect(all.totalDocs).toBeGreaterThan(1)
    const own = await payload.findByID({ collection: 'users', id: a.id, showHiddenFields: true })
    expect(own).toHaveProperty('hash')
  })

  it('rejects the scope keys at compile time', () => {
    // Never called: typecheck fails if an @ts-expect-error stops erroring.
    const _typeOnly = () => [
      // @ts-expect-error: overrideAccess is not a gateway option.
      gateway.find(ctx, { collection: 'users', overrideAccess: true }),
      // @ts-expect-error: user is not a gateway option.
      gateway.findByID(ctx, { collection: 'users', id: b.id, user: b }),
      // @ts-expect-error: req is not a gateway option.
      gateway.count(ctx, { collection: 'users', req: ctx.req }),
      // @ts-expect-error: no where-based delete.
      gateway.deleteByID(ctx, { collection: 'users', id: b.id, where: { id: { equals: b.id } } }),
      // @ts-expect-error: no where-based update.
      gateway.updateByID(ctx, { collection: 'users', id: b.id, where: {}, data: {} }),
    ]
    expect(typeof _typeOnly).toBe('function')
  })
})
