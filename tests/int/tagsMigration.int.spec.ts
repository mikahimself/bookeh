import { sql } from '@payloadcms/db-postgres'
import { createLocalReq, getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { down, up } from '@/migrations/20261104_151042_tags'
import config from '@/payload.config'

import { createUser } from '../helpers/harness'

class Rollback extends Error {}

describe('tags migration', () => {
  let payload: Payload

  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  it('removes populated tag relationships, preserves unrelated rows and reapplies cleanly', async () => {
    const user = await createUser()
    const req = await createLocalReq({}, payload)

    await expect(
      payload.db.drizzle.transaction(async (tx) => {
        const { rows: books } = await tx.execute(
          sql`INSERT INTO books (title, visibility) VALUES ('Migration book', 'shared') RETURNING id`,
        )
        const { rows: states } = await tx.execute(
          sql`INSERT INTO user_books (owner_id, book_id) VALUES (${user.id}, ${books[0]!.id}) RETURNING id`,
        )
        const { rows: authors } = await tx.execute(
          sql`INSERT INTO authors (name, name_key, visibility) VALUES ('Migration author', 'migration author', 'shared') RETURNING id`,
        )
        const { rows: tags } = await tx.execute(
          sql`INSERT INTO tags (owner_id, name, name_key, kind) VALUES (${user.id}, 'Migration tag', 'migration tag', 'tag') RETURNING id`,
        )
        const { rows: locks } = await tx.execute(
          sql`INSERT INTO payload_locked_documents DEFAULT VALUES RETURNING id`,
        )
        const { rows: tagStateRels } = await tx.execute(
          sql`INSERT INTO user_books_rels (parent_id, path, tags_id) VALUES (${states[0]!.id}, 'tags', ${tags[0]!.id}) RETURNING id`,
        )
        const { rows: authorStateRels } = await tx.execute(
          sql`INSERT INTO user_books_rels (parent_id, path, authors_id) VALUES (${states[0]!.id}, 'authors', ${authors[0]!.id}) RETURNING *`,
        )
        const { rows: tagLockRels } = await tx.execute(
          sql`INSERT INTO payload_locked_documents_rels (parent_id, path, tags_id) VALUES (${locks[0]!.id}, 'document', ${tags[0]!.id}) RETURNING id`,
        )
        const { rows: authorLockRels } = await tx.execute(
          sql`INSERT INTO payload_locked_documents_rels (parent_id, path, authors_id) VALUES (${locks[0]!.id}, 'document', ${authors[0]!.id}) RETURNING *`,
        )
        // Down removes these columns; compare the unrelated rows' remaining fields.
        delete authorStateRels[0]!.tags_id
        delete authorLockRels[0]!.tags_id

        await down({ db: tx, payload, req })

        expect(
          (
            await tx.execute(
              sql`SELECT to_regclass('public.tags') AS table_name, to_regtype('public.enum_tags_kind') AS enum_name`,
            )
          ).rows,
        ).toEqual([{ table_name: null, enum_name: null }])
        expect(
          (
            await tx.execute(
              sql`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN ('user_books_rels', 'payload_locked_documents_rels') AND column_name = 'tags_id'`,
            )
          ).rows,
        ).toEqual([])
        expect(
          (await tx.execute(sql`SELECT id FROM user_books_rels WHERE id = ${tagStateRels[0]!.id}`))
            .rows,
        ).toEqual([])
        expect(
          (
            await tx.execute(
              sql`SELECT id FROM payload_locked_documents_rels WHERE id = ${tagLockRels[0]!.id}`,
            )
          ).rows,
        ).toEqual([])
        expect(
          (
            await tx.execute(
              sql`SELECT * FROM user_books_rels WHERE id = ${authorStateRels[0]!.id}`,
            )
          ).rows,
        ).toEqual(authorStateRels)
        expect(
          (
            await tx.execute(
              sql`SELECT * FROM payload_locked_documents_rels WHERE id = ${authorLockRels[0]!.id}`,
            )
          ).rows,
        ).toEqual(authorLockRels)

        await up({ db: tx, payload, req })

        expect(
          (
            await tx.execute(
              sql`SELECT enumlabel FROM pg_enum WHERE enumtypid = 'public.enum_tags_kind'::regtype ORDER BY enumsortorder`,
            )
          ).rows,
        ).toEqual([{ enumlabel: 'tag' }, { enumlabel: 'genre' }, { enumlabel: 'theme' }])
        const { rows: reapplied } = await tx.execute(
          sql`INSERT INTO tags (owner_id, name, name_key, kind) VALUES (${user.id}, 'Reapplied', 'reapplied', 'theme') RETURNING id`,
        )
        await tx.execute(
          sql`INSERT INTO user_books_rels (parent_id, path, tags_id) VALUES (${states[0]!.id}, 'tags', ${reapplied[0]!.id})`,
        )
        await tx.execute(
          sql`INSERT INTO payload_locked_documents_rels (parent_id, path, tags_id) VALUES (${locks[0]!.id}, 'document', ${reapplied[0]!.id})`,
        )
        throw new Rollback()
      }),
    ).rejects.toThrow(Rollback)
  })
})
