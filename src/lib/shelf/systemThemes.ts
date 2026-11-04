import { sql } from '@payloadcms/db-postgres/drizzle'

import type { Context } from '@/lib/payload/context'
import { drizzleFor } from '@/lib/payload/drizzle'

import { readableBy, visibleCopies } from './visibleCopies'

/** Shared themes from readable Books behind the viewer's own held copies. */
export async function systemThemes(ctx: Context): Promise<string[]> {
  const { rows } = await drizzleFor(ctx).execute(sql`
    select distinct t.text from copies
    join books b on b.id = copies.book_id and ${readableBy(ctx.user, 'b')}
    join books_texts t on t.parent_id = b.id and t.path = 'themes'
    where ${visibleCopies(ctx.user)} and t.text is not null
  `)
  return rows.map((row) => String(row.text))
}
