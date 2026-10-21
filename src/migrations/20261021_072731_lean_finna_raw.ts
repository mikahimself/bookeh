import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

import { leanFinnaBody } from '@/lib/metadata/sources/finna'

// Data only (Story 4.20): Books saved before the adapter kept just the matching records hold
// Finna's whole answer, other editions included. Trims them with the adapter's own rule.

type Row = { id: number; isbn13: string | null; finna: unknown }

function recordCount(body: unknown): number | undefined {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return undefined
  const { records } = body as { records?: unknown }
  return Array.isArray(records) ? records.length : undefined
}

export async function up({ db, payload }: MigrateUpArgs): Promise<void> {
  const { rows } = await db.execute<Row>(sql`
    SELECT "id", "isbn13", "raw_metadata" #> '{sources,finna}' AS "finna"
    FROM "books"
    WHERE "raw_metadata" -> 'sources' ? 'finna'`)
  let trimmed = 0
  for (const { id, isbn13, finna } of rows) {
    const before = recordCount(finna)
    if (!isbn13 || before === undefined) continue
    const lean = leanFinnaBody(finna, isbn13)
    // No match at all: the ISBN was edited after the save, so trimming would wipe every record.
    const after = recordCount(lean) ?? before
    if (after === 0 || after >= before) continue
    await db.execute(sql`
      UPDATE "books"
      SET "raw_metadata" = jsonb_set("raw_metadata", '{sources,finna}', ${JSON.stringify(lean)}::jsonb)
      WHERE "id" = ${id}`)
    trimmed++
  }
  payload.logger.info(`Trimmed Finna raw data on ${trimmed} of ${rows.length} Books`)
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // No-op: the dropped records were other editions, which nothing reads, and they cannot be
  // restored without asking Finna again.
}
