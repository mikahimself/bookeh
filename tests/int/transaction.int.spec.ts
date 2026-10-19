import { randomUUID } from 'node:crypto'

import { sql } from '@payloadcms/db-postgres/drizzle'
import { getPayload, NotFound } from 'payload'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import type { Context } from '@/lib/payload/context'
import { drizzleFor } from '@/lib/payload/drizzle'
import * as gateway from '@/lib/payload/gateway'
import { onRollback, withTransaction } from '@/lib/payload/transaction'
import config from '@/payload.config'

import { contextFor, createUser } from '../helpers/harness'

// Rows are users: an admin context may create them through the gateway.
describe('withTransaction', () => {
  let admin: Context

  beforeAll(async () => {
    admin = await contextFor(await createUser({ roles: ['admin'] }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const email = () => `tx-${randomUUID()}@test.invalid`

  const createRow = (ctx: Context, address: string) =>
    gateway.create(ctx, {
      collection: 'users',
      data: {
        email: address,
        password: 'test-password',
        displayName: 'Transaction Row',
        roles: ['user'],
        language: 'en',
        profileVisibility: 'hidden',
        collectionVisibility: 'closed',
      },
    })

  const persisted = async (...emails: string[]) => {
    const payload = await getPayload({ config })
    const found = await payload.find({
      collection: 'users',
      where: { email: { in: emails } },
      overrideAccess: true,
    })
    return found.docs.map((d) => d.email).sort()
  }

  const selectByEmail = async (ctx: Context, address: string) => {
    const result = await drizzleFor(ctx).execute(sql`select id from users where email = ${address}`)
    return result.rows
  }

  it('commits the writes of fn and resolves its value', async () => {
    const [a, b] = [email(), email()]
    const value = await withTransaction(admin, async (tx) => {
      await createRow(tx, a)
      await createRow(tx, b)
      return 'v'
    })
    expect(value).toBe('v')
    expect(await persisted(a, b)).toEqual([a, b].sort())
  })

  it('rolls back the writes of fn and rethrows its error', async () => {
    const [a, b] = [email(), email()]
    const e = new Error('boom')
    await expect(
      withTransaction(admin, async (tx) => {
        await createRow(tx, a)
        await createRow(tx, b)
        throw e
      }),
    ).rejects.toBe(e)
    expect(await persisted(a, b)).toEqual([])
  })

  it('reads its own uncommitted rows through drizzleFor', async () => {
    const a = email()
    await withTransaction(admin, async (tx) => {
      await createRow(tx, a)
      expect(await selectByEmail(tx, a)).toHaveLength(1)
      expect(await selectByEmail(admin, a)).toHaveLength(0)
    })
    expect(await selectByEmail(admin, a)).toHaveLength(1)
  })

  it('joins the transaction of a context that carries one', async () => {
    const [a, b] = [email(), email()]
    const e = new Error('inner')
    await expect(
      withTransaction(admin, async (tx) => {
        await createRow(tx, a)
        await withTransaction(tx, async (inner) => {
          expect(inner).toBe(tx)
          await createRow(inner, b)
          throw e
        })
      }),
    ).rejects.toBe(e)
    expect(await persisted(a, b)).toEqual([])
  })

  it('refuses to write after Payload rolled the transaction back', async () => {
    const [a, b] = [email(), email()]
    await expect(
      withTransaction(admin, async (tx) => {
        await createRow(tx, a)
        try {
          await gateway.findByID(tx, { collection: 'users', id: 2_147_483_647 })
        } catch (err) {
          expect(err).toBeInstanceOf(NotFound)
        }
        await createRow(tx, b)
      }),
    ).rejects.toThrow(/Transaction .+ has ended/)
    expect(await persisted(a, b)).toEqual([])
  })

  it('refuses to commit after Payload rolled the transaction back', async () => {
    const a = email()
    await expect(
      withTransaction(admin, async (tx) => {
        await createRow(tx, a)
        try {
          await gateway.findByID(tx, { collection: 'users', id: 2_147_483_647 })
        } catch (err) {
          expect(err).toBeInstanceOf(NotFound)
        }
        return 'v'
      }),
    ).rejects.toThrow(/Transaction .+ has ended/)
    expect(await persisted(a)).toEqual([])
  })

  it('refuses gateway calls on the outer context while fn runs', async () => {
    const a = email()
    await withTransaction(admin, async () => {
      await expect(createRow(admin, a)).rejects.toThrow(/use the transaction context/)
    })
    expect(await persisted(a)).toEqual([])
  })

  it('throws before fn runs when the adapter opens no transaction', async () => {
    const payload = await getPayload({ config })
    vi.spyOn(payload.db, 'beginTransaction').mockResolvedValueOnce(null)
    const fn = vi.fn(async () => 'never')
    await expect(withTransaction(admin, fn)).rejects.toThrow(/did not open a transaction/)
    expect(fn).not.toHaveBeenCalled()
  })

  it('runs every rollback callback when one fails and rethrows the error of fn', async () => {
    const e = new Error('boom')
    let ran = false
    await expect(
      withTransaction(admin, async (tx) => {
        onRollback(tx, async () => {
          throw new Error('cleanup failed')
        })
        onRollback(tx, async () => {
          ran = true
        })
        throw e
      }),
    ).rejects.toBe(e)
    expect(ran).toBe(true)
  })

  it('never runs a rollback callback on commit', async () => {
    const callback = vi.fn(async () => {})
    await withTransaction(admin, async (tx) => {
      onRollback(tx, callback)
    })
    expect(callback).not.toHaveBeenCalled()
  })
})
