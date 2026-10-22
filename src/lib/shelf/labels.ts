import { type SQL, sql } from '@payloadcms/db-postgres/drizzle'

import { genreName } from '@/lib/books/genreName'
import type { Context } from '@/lib/payload/context'
import { drizzleFor } from '@/lib/payload/drizzle'

import { effective, effectiveAuthorIds } from './effective'
import type { ShelfQuery } from './query'
import { readableBy, visibleCopies } from './visibleCopies'

type Viewer = Context['user']
type LabelField = 'location' | 'genre' | 'author' | 'series'

const idList = (ids: readonly number[]): SQL =>
  sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  )

/**
 * True when some Book behind the viewer's copies has `join`'s record as an
 * effective value: the AD-7 no-browsing rule. `join` names that record and
 * ties it to the requested one by `name_key`.
 */
const throughCopy = (viewer: Viewer, join: SQL): SQL => sql`exists (
  select 1 from copies
  join books b on b.id = copies.book_id and ${readableBy(viewer, 'b')}
  left join user_books ub on ub.book_id = b.id and ub.owner_id = ${viewer.id}
  ${join}
  where ${visibleCopies(viewer)})`

const statement = (viewer: Viewer, field: LabelField, ids: readonly number[]): SQL => {
  const list = idList(ids)
  switch (field) {
    case 'location':
      return sql`select id, name from locations where id in (${list}) and owner_id = ${viewer.id}`
    case 'genre':
      return sql`select id, name, name_fi from genres where id in (${list})`
    case 'author':
      return sql`select a.id, a.name from authors a
        where a.id in (${list}) and ${readableBy(viewer, 'a')}
          and ${throughCopy(
            viewer,
            sql`join authors ea on ea.name_key = a.name_key and ${readableBy(viewer, 'ea')}
              and ea.id in (${effectiveAuthorIds})`,
          )}`
    case 'series':
      return sql`select s.id, s.name from series s
        where s.id in (${list}) and ${readableBy(viewer, 's')}
          and ${throughCopy(
            viewer,
            sql`join series es on es.id = ${effective('series')} and ${readableBy(viewer, 'es')}
              and es.name_key = s.name_key`,
          )}`
  }
}

const FIELDS: readonly LabelField[] = ['location', 'genre', 'author', 'series']

/**
 * Spine, AD-7: the display names of the id-valued filter values in
 * `filters`, keyed `field:id`. A location is named for its owner only, a
 * system genre in the viewer's language, an author or series only when it is
 * readable and shares its `name_key` with a readable effective value of a
 * Book behind the viewer's copies; any other id has no entry. Read-only, one
 * query per field present.
 */
export async function shelfLabels(
  ctx: Context,
  filters: ShelfQuery['filters'],
): Promise<Record<string, string>> {
  const reads = FIELDS.flatMap((field) => {
    const ids = filters[field]
    if (!ids?.length) return []
    return [
      drizzleFor(ctx)
        .execute(statement(ctx.user, field, ids))
        .then(({ rows }) =>
          rows.map((row): [string, string] => {
            const name =
              field === 'genre'
                ? genreName(
                    {
                      name: String(row.name),
                      nameFi: row.name_fi == null ? null : String(row.name_fi),
                    },
                    ctx.user.language,
                  )
                : String(row.name)
            return [`${field}:${Number(row.id)}`, name]
          }),
        ),
    ]
  })
  return Object.fromEntries((await Promise.all(reads)).flat())
}
