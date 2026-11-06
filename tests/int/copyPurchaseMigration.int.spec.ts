import { sql } from '@payloadcms/db-postgres'
import { createLocalReq, getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { down, up } from '@/migrations/20261106_180131_copy_purchase'
import config from '@/payload.config'

import { createUser } from '../helpers/harness'

class Rollback extends Error {}

// FR-55: existing copies take their `created_at`'s Europe/Helsinki day at
// 12:00 UTC as `acquired_at`, and no price.
describe('copy purchase migration', () => {
  let payload: Payload

  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  it('fills acquired_at with the Helsinki day of created_at, either side of its midnight', async () => {
    const user = await createUser()
    const req = await createLocalReq({}, payload)

    await expect(
      payload.db.drizzle.transaction(async (tx) => {
        await down({ db: tx, payload, req })
        const { rows: books } = await tx.execute(
          sql`INSERT INTO books (title, visibility) VALUES ('Purchase migration', 'shared') RETURNING id`,
        )
        const { rows: copies } = await tx.execute(
          sql`INSERT INTO copies (owner_id, book_id, status, created_at, updated_at) VALUES
            (${user.id}, ${books[0]!.id}, 'owned', '2026-03-01T22:30:00Z', now()),
            (${user.id}, ${books[0]!.id}, 'owned', '2026-03-02T09:00:00Z', now())
            RETURNING id`,
        )

        await up({ db: tx, payload, req })

        const { rows } = await tx.execute(
          sql`SELECT to_char(acquired_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI') AS acquired, price
            FROM copies WHERE id IN (${copies[0]!.id}, ${copies[1]!.id}) ORDER BY id`,
        )
        expect(rows).toEqual([
          { acquired: '2026-03-02T12:00', price: null },
          { acquired: '2026-03-02T12:00', price: null },
        ])
        throw new Rollback()
      }),
    ).rejects.toBeInstanceOf(Rollback)
  })
})
