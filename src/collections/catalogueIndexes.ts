import type { PostgresAdapterArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres/drizzle'
import { uniqueIndex } from '@payloadcms/db-postgres/drizzle/pg-core'

type PostgresSchemaHook = NonNullable<PostgresAdapterArgs['afterSchemaInit']>[number]

/**
 * Spine, AD-19: `nameKey` is unique among shared rows and per creator among
 * private rows. Collection `indexes` cannot carry a `where`, so the partial
 * indexes are added to the Drizzle table in `afterSchemaInit` and land in the
 * migration like any other index. For a table with `nameKeyField()` and
 * `visibilityFields()`.
 */
export const nameKeyIndexes =
  (table: string): PostgresSchemaHook =>
  ({ schema, extendTable }) => {
    const target = schema.tables[table]
    if (!target) throw new Error(`nameKeyIndexes: no table "${table}"`)
    extendTable({
      table: target,
      extraConfig: (t) => ({
        nameKeyShared: uniqueIndex(`${table}_name_key_shared_idx`)
          .on(t.nameKey)
          .where(sql`${t.visibility} = 'shared'`),
        nameKeyPrivate: uniqueIndex(`${table}_created_by_name_key_private_idx`)
          .on(t.createdBy, t.nameKey)
          .where(sql`${t.visibility} = 'private'`),
      }),
    })
    return schema
  }
