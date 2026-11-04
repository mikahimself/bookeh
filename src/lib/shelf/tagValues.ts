import { sql } from '@payloadcms/db-postgres/drizzle'

import type { Context } from '@/lib/payload/context'
import { drizzleFor } from '@/lib/payload/drizzle'
import type { Named } from '@/lib/payload/ref'
import type { Tag } from '@/payload-types'

import type { Counted } from './query'
import { readableBy, visibleCopies } from './visibleCopies'

/** Private labels used on readable Books behind the viewer's own copies. */
export async function tagValues(ctx: Context, kind: Tag['kind']): Promise<Counted<Named>[]> {
  const { rows } = await drizzleFor(ctx).execute(sql`
    select t.id, t.name, count(distinct copies.id)::integer as count
    from copies
    join books b on b.id = copies.book_id and ${readableBy(ctx.user, 'b')}
    join user_books ub on ub.book_id = b.id and ub.owner_id = ${ctx.user.id}
    join user_books_rels rel on rel.parent_id = ub.id and rel.path = 'tags'
    join tags t on t.id = rel.tags_id and t.owner_id = ${ctx.user.id} and t.kind = ${kind}
    where ${visibleCopies(ctx.user)}
    group by t.id, t.name
    order by t.name
  `)
  return rows.map((row) => ({
    id: Number(row.id),
    name: String(row.name),
    count: Number(row.count),
  }))
}
