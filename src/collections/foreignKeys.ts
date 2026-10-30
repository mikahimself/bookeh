import type { PostgresAdapterArgs } from '@payloadcms/db-postgres'
import { getTableConfig, type PgTable } from '@payloadcms/db-postgres/drizzle/pg-core'

type PostgresSchemaHook = NonNullable<PostgresAdapterArgs['afterSchemaInit']>[number]

type OnDelete = 'cascade' | 'restrict' | 'set null'

/**
 * Spine, AD-19: what a delete does to each relationship foreign key, by table
 * and column. Owners and creators cascade (a user delete takes their rows;
 * only private catalogue rows carry `created_by_id`, AD-4), references refuse,
 * optional links clear. Payload generates every one as `set null`; `_rels`
 * keys are generated `cascade` and are left alone.
 */
export const ON_DELETE: Record<string, Record<string, OnDelete>> = {
  copies: { owner_id: 'cascade', book_id: 'restrict', location_id: 'set null' },
  locations: { owner_id: 'cascade' },
  loans: { owner_id: 'cascade', copy_id: 'restrict', person_id: 'restrict' },
  people: { owner_id: 'cascade' },
  user_books: { owner_id: 'cascade', book_id: 'restrict', series_id: 'set null' },
  wishlists: { owner_id: 'cascade' },
  wishlist_entries: {
    owner_id: 'cascade',
    // AD-18: deleting a wishlist deletes its entries.
    wishlist_id: 'cascade',
    book_id: 'restrict',
    for_person_id: 'restrict',
  },
  books: { created_by_id: 'cascade', series_id: 'set null', cover_id: 'set null' },
  authors: { created_by_id: 'cascade' },
  series: { created_by_id: 'cascade' },
  media: { created_by_id: 'cascade' },
  users: { default_location_id: 'set null' },
}

/**
 * Sets `ON_DELETE` on the Drizzle tables' inline foreign keys, so dev push,
 * the generated migration and CI's drift check all see it. Runs after every
 * hook that extends a table. Fails schema init for a `set null` key that
 * `ON_DELETE` does not list or that sits on a NOT NULL column (a required
 * relationship must cascade or refuse), and for a listed key that matched
 * none, so a renamed column cannot drop its rule silently.
 */
export const foreignKeyActions: PostgresSchemaHook = ({ schema }) => {
  const unmatched = new Set(
    Object.entries(ON_DELETE).flatMap(([table, columns]) =>
      Object.keys(columns).map((column) => `${table}.${column}`),
    ),
  )
  for (const [tableName, table] of Object.entries(schema.tables)) {
    for (const key of getTableConfig(table as PgTable).foreignKeys) {
      const [column] = key.reference().columns
      if (!column) continue
      const name = `${tableName}.${column.name}`
      const action = ON_DELETE[tableName]?.[column.name]
      if (action !== undefined) {
        // Drizzle types it readonly; the generated SQL and the snapshot read this field.
        ;(key as { onDelete: OnDelete | undefined }).onDelete = action
        unmatched.delete(name)
      }
      if (key.onDelete === 'set null' && (action === undefined || column.notNull)) {
        throw new Error(
          `foreignKeyActions: ${name} is ON DELETE set null${
            column.notNull ? ' on a NOT NULL column' : ''
          }; state its action in ON_DELETE (src/collections/foreignKeys.ts)`,
        )
      }
    }
  }
  if (unmatched.size > 0) {
    throw new Error(`foreignKeyActions: no foreign key for ${[...unmatched].join(', ')}`)
  }
  return schema
}
