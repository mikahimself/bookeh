import { sql } from '@payloadcms/db-postgres'
import { createLocalReq, getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { toNameKey } from '@/fields/nameKey'
import { genreName } from '@/lib/books/genreName'
import { SYSTEM_GENRES, up } from '@/migrations/20261105_090000_seed_system_genres'
import config from '@/payload.config'

class Rollback extends Error {}

describe('seeded system genres migration', () => {
  let payload: Payload

  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  it('is idempotent: keeps existing rows, fills a missing name_fi, keeps an edited one', async () => {
    const req = await createLocalReq({}, payload)

    await expect(
      payload.db.drizzle.transaction(async (tx) => {
        const count = async () =>
          Number(
            (await tx.execute(sql`SELECT count(*)::int AS n FROM genres`)).rows[0]!.n as number,
          )
        const fiOf = async (key: string) =>
          (await tx.execute(sql`SELECT name, name_fi FROM genres WHERE name_key = ${key}`)).rows[0]!

        // Migrated database already holds the seed, keyed as the app keys names.
        for (const [name, nameFi] of SYSTEM_GENRES) {
          const row = await fiOf(toNameKey(name))
          expect(row).toMatchObject({ name, name_fi: nameFi })
        }
        const before = await count()

        await tx.execute(sql`UPDATE genres SET name_fi = NULL WHERE name_key = 'history'`)
        await tx.execute(sql`UPDATE genres SET name_fi = 'Oma' WHERE name_key = 'travel'`)
        await tx.execute(sql`UPDATE genres SET name = 'FICTION' WHERE name_key = 'fiction'`)

        await up({ db: tx, payload, req })

        expect(await count()).toBe(before)
        const history = await fiOf('history')
        expect(history.name_fi).toBe('Historia')
        expect(
          genreName({ name: history.name as string, nameFi: history.name_fi as string }, 'fi'),
        ).toBe('Historia')
        expect(
          genreName({ name: history.name as string, nameFi: history.name_fi as string }, 'en'),
        ).toBe('History')
        expect((await fiOf('travel')).name_fi).toBe('Oma')
        expect((await fiOf('fiction')).name).toBe('FICTION')
        throw new Rollback()
      }),
    ).rejects.toThrow(Rollback)
  })
})
