import { randomUUID } from 'node:crypto'

import { sql } from '@payloadcms/db-postgres'
import { createLocalReq, getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { down, up } from '@/migrations/20261021_121736_media_visibility'
import config from '@/payload.config'

// Story 4.11: media rows that predate D28 become shared. The lane migrates an
// empty table, so this replays the migration over a row inside a transaction
// that is rolled back, leaving the schema as it was.

class Rollback extends Error {}

describe('media_visibility migration', () => {
  let payload: Payload

  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  it('marks existing media rows shared with no creator', async () => {
    const req = await createLocalReq({}, payload)
    let row: Record<string, unknown> | undefined

    await expect(
      payload.db.drizzle.transaction(async (tx) => {
        await down({ db: tx, payload, req })
        const filename = `${randomUUID()}.jpg`
        await tx.execute(
          sql`INSERT INTO "media" ("filename", "updated_at", "created_at") VALUES (${filename}, now(), now())`,
        )
        await up({ db: tx, payload, req })
        const { rows } = await tx.execute(
          sql`SELECT "visibility", "created_by_id" FROM "media" WHERE "filename" = ${filename}`,
        )
        row = rows[0]
        throw new Rollback()
      }),
    ).rejects.toThrow(Rollback)

    expect(row).toEqual({ visibility: 'shared', created_by_id: null })
  })
})
