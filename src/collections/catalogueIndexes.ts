import type { PostgresAdapterArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres/drizzle'
import { uniqueIndex } from '@payloadcms/db-postgres/drizzle/pg-core'

type PostgresSchemaHook = NonNullable<PostgresAdapterArgs['afterSchemaInit']>[number]

/**
 * Spine, AD-19: `field` is unique among shared rows and per creator among
 * private rows. Collection `indexes` cannot carry a `where`, so the partial
 * indexes are added to the Drizzle table in `afterSchemaInit` and land in the
 * migration like any other index. For a table with `visibilityFields()`;
 * `column` is the field's database name, which the index names carry.
 */
const scopedUniqueIndexes =
  (table: string, field: string, column: string): PostgresSchemaHook =>
  ({ schema, extendTable }) => {
    const target = schema.tables[table]
    if (!target) throw new Error(`scopedUniqueIndexes: no table "${table}"`)
    extendTable({
      table: target,
      extraConfig: (t) => {
        if (!t[field]) throw new Error(`scopedUniqueIndexes: no column "${field}" on "${table}"`)
        return {
          [`${field}Shared`]: uniqueIndex(`${table}_${column}_shared_idx`)
            .on(t[field])
            .where(sql`${t.visibility} = 'shared'`),
          [`${field}Private`]: uniqueIndex(`${table}_created_by_${column}_private_idx`)
            .on(t.createdBy, t[field])
            .where(sql`${t.visibility} = 'private'`),
        }
      },
    })
    return schema
  }

/** `nameKey` per scope, for a table with `nameKeyField()` (`authors`, `series`). */
export const nameKeyIndexes = (table: string): PostgresSchemaHook =>
  scopedUniqueIndexes(table, 'nameKey', 'name_key')

/** One shared Book per ISBN-13, one private Book per creator and ISBN-13. */
export const isbnIndexes: PostgresSchemaHook = scopedUniqueIndexes('books', 'isbn13', 'isbn13')
