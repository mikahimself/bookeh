import type { PostgresAdapterArgs } from '@payloadcms/db-postgres'
import {
  getTableConfig,
  integer,
  pgTable,
  serial,
  type PgTable,
} from '@payloadcms/db-postgres/drizzle/pg-core'
import { describe, expect, it } from 'vitest'

import { foreignKeyActions, ON_DELETE } from '@/collections/foreignKeys'

// Spine, AD-19: every relationship key states what a delete does; a required
// one left on Payload's `set null` fails schema init.

type Hook = NonNullable<PostgresAdapterArgs['afterSchemaInit']>[number]
type HookArgs = Parameters<Hook>[0]

const users = pgTable('users', { id: serial('id').primaryKey() })
const ref = { onDelete: 'set null' as const }

/** The `ON_DELETE` tables, every key as Payload generates it, plus `extra`. */
function schemaWith(extra: Record<string, PgTable> = {}) {
  const tables: Record<string, PgTable> = { users, ...extra }
  for (const [name, columns] of Object.entries(ON_DELETE)) {
    if (name === 'users') {
      tables.users = pgTable('users', {
        id: serial('id').primaryKey(),
        default_location_id: integer('default_location_id').references(() => users.id, ref),
      })
      continue
    }
    tables[name] = pgTable(
      name,
      Object.fromEntries([
        ['id', serial('id').primaryKey()],
        ...Object.keys(columns).map((column) => [
          column,
          integer(column).references(() => users.id, ref),
        ]),
      ]),
    )
  }
  return { schema: { tables, enums: {}, relations: {} } } as unknown as HookArgs
}

describe('foreignKeyActions', () => {
  it("sets each listed key's action", async () => {
    const args = schemaWith()
    await foreignKeyActions(args)
    const actions = getTableConfig(args.schema.tables.loans as PgTable).foreignKeys.map((key) => [
      key.reference().columns[0]!.name,
      key.onDelete,
    ])
    expect(Object.fromEntries(actions)).toEqual(ON_DELETE.loans)
  })

  it('fails schema init for a required relationship left on set null', () => {
    const shelves = pgTable('shelves', {
      id: serial('id').primaryKey(),
      owner_id: integer('owner_id')
        .notNull()
        .references(() => users.id, ref),
    })
    expect(() => foreignKeyActions(schemaWith({ shelves }))).toThrow(/shelves\.owner_id/)
  })
})
