import { type SQL, sql } from '@payloadcms/db-postgres/drizzle'

import type { Locale } from '@/i18n/locale'
import { genreName } from '@/lib/books/genreName'
import type { Context } from '@/lib/payload/context'
import { drizzleFor } from '@/lib/payload/drizzle'

import { effective } from './effective'
import type { FilterValues } from './query'
import { readableBy, visibleCopies } from './visibleCopies'

const STATUSES = ['owned', 'ordered'] as const

/**
 * Spine, AD-7: the values the Filter panel offers, each with how many of the
 * viewer's copies carry it: own locations and system genres by name (a copy
 * counts once under each of its Book's genres), effective languages (AD-6) by
 * value, statuses `owned` then `ordered`. Only values in use; a copy with no
 * location or language adds none. Counts run over all the viewer's copies,
 * never narrowed by a shelf query. Read-only, one grouped query per field.
 */
export async function filterValues(ctx: Context, locale: Locale): Promise<FilterValues> {
  const viewer = ctx.user
  const db = drizzleFor(ctx)
  const grouped = (select: SQL, join: SQL, rest: SQL) =>
    db
      .execute(
        sql`select ${select}, count(distinct copies.id) as count
          from copies
          join books b on b.id = copies.book_id and ${readableBy(viewer, 'b')}
          left join user_books ub on ub.book_id = b.id and ub.owner_id = ${viewer.id}
          ${join}
          where ${visibleCopies(viewer)} ${rest}`,
      )
      .then(({ rows }) => rows)

  const language = effective('language')
  const [locations, statuses, genres, languages] = await Promise.all([
    grouped(
      sql`l.id, l.name`,
      sql`join locations l on l.id = copies.location_id and l.owner_id = ${viewer.id}`,
      sql`group by l.id, l.name order by l.name, l.id`,
    ),
    grouped(sql`copies.status as value`, sql``, sql`group by copies.status`),
    grouped(
      sql`g.id, g.name, g.name_fi`,
      sql`join books_rels r on r.parent_id = b.id and r.path = 'genres'
        join genres g on g.id = r.genres_id`,
      sql`group by g.id, g.name, g.name_fi`,
    ),
    grouped(
      sql`${language} as value`,
      sql``,
      sql`and coalesce(${language}, '') <> '' group by 1 order by 1`,
    ),
  ])

  const collator = new Intl.Collator(locale)
  return {
    location: locations.map((row) => ({
      id: Number(row.id),
      name: String(row.name),
      count: Number(row.count),
    })),
    status: STATUSES.flatMap((value) => {
      const row = statuses.find((r) => r.value === value)
      return row ? [{ value, count: Number(row.count) }] : []
    }),
    genre: genres
      .map((row) => ({
        id: Number(row.id),
        name: genreName(
          { name: String(row.name), nameFi: row.name_fi == null ? null : String(row.name_fi) },
          locale,
        ),
        count: Number(row.count),
      }))
      .sort((a, b) => collator.compare(a.name, b.name) || a.id - b.id),
    language: languages.map((row) => ({ value: String(row.value), count: Number(row.count) })),
  }
}
