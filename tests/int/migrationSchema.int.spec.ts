import { getPayload, Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'

let payload: Payload

// drizzle-kit re-emits SET DEFAULT for numeric columns (e.g. users.login_attempts)
// even when the database already has that default; such a statement is a no-op.
const setDefault = /^ALTER TABLE "([^"]+)" ALTER COLUMN "([^"]+)" SET DEFAULT (.+);$/

async function isNoOp(statement: string): Promise<boolean> {
  const match = setDefault.exec(statement)
  if (!match) return false
  const [, table, column, value] = match
  const { rows } = await payload.db.pool.query<{ column_default: string | null }>(
    `select column_default from information_schema.columns
     where table_schema = current_schema() and table_name = $1 and column_name = $2`,
    [table, column],
  )
  return rows[0]?.column_default === value
}

// CI runs the int lane with push off on a bookeh_test built by `payload migrate`.
// The other int specs only reach the tables they query; this diffs every table.
describe.runIf(process.env.DATABASE_PUSH === 'false')('migration-built schema', () => {
  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  it('matches the config (drizzle-kit has nothing to push)', async () => {
    const adapter = payload.db
    const { pushSchema } = adapter.requireDrizzleKit()
    // Mirrors pushSchema in @payloadcms/drizzle/dist/utilities/pushDevSchema.js
    // (Payload 3.90.2), without apply(); recheck it on a Payload bump.
    // drizzle-kit resolves create-vs-rename interactively, so a timeout here
    // means it is prompting: migration SQL and config disagree on a name.
    const result: unknown = await pushSchema(
      adapter.schema,
      adapter.drizzle,
      adapter.schemaName ? [adapter.schemaName] : undefined,
      adapter.tablesFilter,
      adapter.extensions.postgis ? ['postgis'] : undefined,
    )
    // The adapter's type omits statementsToExecute; drizzle-kit returns it.
    expect(result).toHaveProperty('statementsToExecute')
    const { statementsToExecute } = result as { statementsToExecute: string[] }
    const noOp = await Promise.all(statementsToExecute.map(isNoOp))
    expect(statementsToExecute.filter((_, i) => !noOp[i])).toEqual([])
  }, 30_000)
})
