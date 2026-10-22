import { randomUUID } from 'node:crypto'

import { sql } from '@payloadcms/db-postgres/drizzle'
import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Context } from '@/lib/payload/context'
import { getShelfRows } from '@/lib/shelf/getShelfRows'
import { parseShelfQuery, SHELF_PAGE_SIZE, type ShelfQuery } from '@/lib/shelf/query'
import config from '@/payload.config'

import { contextFor, createUser } from '../helpers/harness'

// NFR-3: the first page for no filter, text search, three combined filters and
// author sort comes back in under 1 s at 10,000 copies. Measures plain `ILIKE`
// (spine, Deferred: search indexing only if this fails). Each case times its
// first `getShelfRows` call, no warm-up.
// Seeded with set-based SQL: 10,000 Local API creates take minutes. Hook-derived
// `name_key` and `sort_name` are set by hand; names carry a per-run tag and
// ISBNs a per-run base, and `afterAll` deletes every seeded row.

const LIMIT_MS = 1000

describe('shelf timing at 10,000 copies', () => {
  let payload: Payload
  let ctx: Context
  let viewerId: number
  let otherId: number
  let genreId: number
  const tag = randomUUID().slice(0, 8)
  const tagged = `% ${tag}`

  beforeAll(async () => {
    payload = await getPayload({ config })
    const viewer = await createUser({ displayName: 'Timing' })
    const other = await createUser({ displayName: 'Catalogue' })
    ctx = await contextFor(viewer)
    viewerId = viewer.id
    otherId = other.id
    const v = viewerId
    const o = otherId
    const isbnBase = Math.floor(Math.random() * 1e6)
    const db = payload.db.drizzle

    await db.execute(sql`
      insert into genres (name, name_key)
      select 'Laji ' || i || ' ' || ${tag}, lower('Laji ' || i || ' ' || ${tag})
        from generate_series(1, 10) i`)
    await db.execute(sql`
      insert into authors (name, name_key, sort_name, visibility, created_by_id)
      select g || ' ' || f || ' ' || i || ' ' || ${tag},
             lower(g || ' ' || f || ' ' || i || ' ' || ${tag}),
             f || ', ' || g || ' ' || i,
             (case when i > 400 then 'private' else 'shared' end)::enum_authors_visibility,
             case when i > 400 then ${v}::int else ${o}::int end
        from generate_series(1, 440) i,
        lateral (select (array['Aino','Eino','Kalle','Liisa','Tove','Väinö','Ärni','Olli'])[1 + i % 8] g,
                        (array['Kivi','Jansson','Topelius','Waltari','Linna','Örn','Ahonen','Mäkinen','Virtanen','Zorn','Lehtonen'])[1 + i % 11] f) n`)
    await db.execute(sql`
      insert into series (name, name_key, visibility, created_by_id)
      select 'Sarja ' || i || ' ' || ${tag}, lower('Sarja ' || i || ' ' || ${tag}), 'shared', ${o}::int
        from generate_series(1, 100) i`)
    await db.execute(sql`
      with s as (select array_agg(id order by id) ids from series where name like ${tagged})
      insert into books (isbn13, title, series_id, publisher, year, language, pages, visibility, created_by_id)
      select case when i <= 8500 then '97' || lpad((${isbnBase}::bigint * 10000 + i)::text, 11, '0') end,
             (array['Seitsemän','Tuntematon','Muumi','Kevät','Talvi','Sinuhe','Täällä','Pohjantähden','Alla','Kesä'])[1 + i % 10]
               || ' ' || (array['veljestä','sotilas','peikko','yö','sota','egyptiläinen','kirja','tarina'])[1 + i % 8] || ' ' || i,
             case when i % 5 = 0 then s.ids[1 + i % 100] end,
             (array['WSOY','Otava','Tammi','Gummerus','Like'])[1 + i % 5],
             case when i % 13 = 0 then null else 1900 + i % 124 end,
             (array['fi','fi','fi','sv','en'])[1 + i % 5],
             100 + i % 600,
             (case when i <= 8500 then 'shared' else 'private' end)::enum_books_visibility,
             case when i <= 8500 then ${o}::int else ${v}::int end
        from generate_series(1, 9000) i, s`)
    // The viewer's Books: the other user's shared ones and the viewer's private ones.
    const seededBooks = sql`
      select id, row_number() over (order by id) i from books
       where (created_by_id = ${o}::int and visibility = 'shared') or created_by_id = ${v}::int`
    await db.execute(sql`
      with b as (${seededBooks}),
           a as (select array_agg(id order by id) ids from authors where name like ${tagged})
      insert into books_rels (parent_id, path, authors_id, "order")
      select b.id, 'authors', a.ids[1 + (b.i * 7 + k) % 440], k
        from b, a, generate_series(1, 2) k
       where k = 1 or b.i % 3 = 0`)
    await db.execute(sql`
      with b as (${seededBooks}),
           g as (select array_agg(id order by id) ids from genres where name like ${tagged})
      insert into books_rels (parent_id, path, genres_id, "order")
      select b.id, 'genres', g.ids[1 + b.i % 10], 1 from b, g where b.i % 2 = 0`)
    await db.execute(sql`
      insert into locations (owner_id, name, name_key)
      select ${v}::int, 'Hylly ' || i, 'hylly ' || i from generate_series(1, 6) i`)
    await db.execute(sql`
      with b as (${seededBooks}),
           l as (select array_agg(id order by id) ids from locations where owner_id = ${v}::int)
      insert into copies (owner_id, book_id, status, notes, location_id)
      select ${v}::int, b.id,
             (case when b.i % 20 = 0 then 'ordered' else 'owned' end)::enum_copies_status,
             case when b.i % 5 = 0 then 'Muistiinpano ' || b.i end,
             case when b.i % 20 <> 0 then l.ids[1 + b.i % 6] end
        from b, l, generate_series(1, 2) k
       where k = 1 or b.i % 9 = 0`)
    await db.execute(sql`
      with b as (select id, row_number() over (order by id) i from books
                  where created_by_id = ${o}::int and visibility = 'shared')
      insert into user_books (owner_id, book_id, title, overridden, read, rating)
      select ${v}::int, b.id, case when b.i % 12 = 0 then 'Oma nimi ' || b.i end,
             case when b.i % 12 = 0 then '["title"]'::jsonb
                  when b.i % 18 = 0 then '["authors"]'::jsonb
                  else '[]'::jsonb end,
             b.i % 3 = 0, case when b.i % 4 = 0 then 1 + b.i % 5 end
        from b where b.i % 6 = 0`)
    await db.execute(sql`
      with a as (select array_agg(id order by id) ids from authors where name like ${tagged})
      insert into user_books_rels (parent_id, path, authors_id, "order")
      select ub.id, 'authors', a.ids[1 + ub.id % 400], 1 from user_books ub, a
       where ub.owner_id = ${v}::int and ub.overridden ? 'authors'`)

    // A library grows gradually and autovacuum keeps its statistics current;
    // this one appears at once. Unanalysed (a freshly migrated bookeh_test, as
    // in CI) the planner guesses ~100 `books_rels` rows and the author
    // subqueries take seconds.
    await db.execute(sql`
      analyze genres, authors, series, books, books_rels, locations, copies,
              user_books, user_books_rels`)

    const genre = await db.execute(sql`select min(id) id from genres where name like ${tagged}`)
    genreId = Number(genre.rows[0]?.id)
  }, 60_000)

  afterAll(async () => {
    if (!payload || viewerId === undefined) return
    const db = payload.db.drizzle
    const v = viewerId
    const o = otherId
    // Foreign-key order; `_rels` rows cascade from their parents.
    await db.execute(sql`delete from copies where owner_id = ${v}::int`)
    await db.execute(sql`delete from user_books where owner_id = ${v}::int`)
    await db.execute(sql`delete from locations where owner_id = ${v}::int`)
    await db.execute(sql`delete from books where created_by_id in (${v}::int, ${o}::int)`)
    await db.execute(sql`delete from authors where name like ${tagged}`)
    await db.execute(sql`delete from series where name like ${tagged}`)
    await db.execute(sql`delete from genres where name like ${tagged}`)
  }, 30_000)

  const base = parseShelfQuery({}).query

  const timed = async (query: ShelfQuery) => {
    const start = performance.now()
    const result = await getShelfRows(ctx, query, { offset: 0, limit: SHELF_PAGE_SIZE })
    return { ...result, ms: performance.now() - start }
  }

  it('no filter, title sort', async () => {
    const { total, rows, ms } = await timed({ ...base, sort: 'title' })
    expect(total).toBe(10_000)
    expect(rows).toHaveLength(SHELF_PAGE_SIZE)
    expect(ms).toBeLessThan(LIMIT_MS)
  })

  it('text search', async () => {
    const { total, ms } = await timed({ ...base, q: 'nen' })
    expect(total).toBeGreaterThan(4000)
    expect(ms).toBeLessThan(LIMIT_MS)
  })

  it('three combined filters', async () => {
    const { total, ms } = await timed({
      ...base,
      filters: { language: ['fi'], year: [1950, 2000], genre: [genreId] },
    })
    expect(total).toBeGreaterThan(100)
    expect(ms).toBeLessThan(LIMIT_MS)
  })

  it('author sort', async () => {
    const { total, ms } = await timed(base)
    expect(total).toBe(10_000)
    expect(ms).toBeLessThan(LIMIT_MS)
  })
})
