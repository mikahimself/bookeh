import type { NodePgQueryResultHKT } from '@payloadcms/db-postgres/drizzle/node-postgres'
import type { PgDatabase } from '@payloadcms/db-postgres/drizzle/pg-core'

import type { Context } from './context'
import { assertLive } from './transaction'

export type Drizzle = PgDatabase<NodePgQueryResultHKT, Record<string, unknown>>

/**
 * Spine, AD-7 and AD-16: the Drizzle instance for `ctx`, for the read-only
 * shelf queries in `lib/shelf`. Inside a transaction it is that transaction,
 * so it sees rows written earlier in it; otherwise the adapter's own. Never
 * used to write. Fetch it per query and never keep it across other calls on
 * the context: a kept handle skips the check that the transaction is live.
 */
export function drizzleFor(ctx: Context): Drizzle {
  const { db } = ctx.req.payload
  if (ctx.transactionID === undefined) return db.drizzle
  assertLive(ctx)
  const session = db.sessions?.[ctx.transactionID]
  if (!session) throw new Error(`Transaction ${ctx.transactionID} has no session`)
  // `DrizzleTransaction` is a Postgres-or-SQLite union; this adapter is Postgres.
  return session.db as Drizzle
}
