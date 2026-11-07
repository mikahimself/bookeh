import { sql } from '@payloadcms/db-postgres/drizzle'

import type { Context } from '@/lib/payload/context'
import { drizzleFor } from '@/lib/payload/drizzle'

import { readStateOf } from './effective'
import { holds, readableBy, visibleCopies } from './visibleCopies'

// Spine, AD-7: the stats readers beside `readingNow()`. Read-only, on the
// shelf's fragments, returning ids, dates and prices only; `lib/stats`
// hydrates the Books it shows. Calendar dates are their UTC `YYYY-MM-DD`.

/** A held Book the viewer has read, with its reading dates. */
export type LoggedRead = { bookId: number; readingSince: string | null; finishedAt: string | null }
/** A visible copy with a price, in euro cents. */
export type PricedCopy = { copyId: number; bookId: number; acquiredAt: string; price: number }
/** An owned copy of a held, readable Book the viewer has not started; `createdAt` ISO. */
export type DustCopy = { copyId: number; bookId: number; acquiredAt: string; createdAt: string }

const day = (column: string) => sql.raw(`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD')`)

const dayOrNull = (value: unknown): string | null => (value == null ? null : String(value))

/**
 * The viewer's `user-books` rows in read (AD-8), on a readable Book they
 * still hold (AD-7). Order: Book id.
 */
export async function readingLog(ctx: Context): Promise<LoggedRead[]> {
  const viewer = ctx.user
  const { rows } = await drizzleFor(ctx).execute(sql`
    select ub.book_id, ${day('ub.reading_since')} as reading_since,
           ${day('ub.finished_at')} as finished_at
      from user_books ub
      join books b on b.id = ub.book_id and ${readableBy(viewer, 'b')}
     where ub.owner_id = ${viewer.id} and ${readStateOf} = 'read' and ${holds(viewer, 'b')}
     order by ub.book_id asc`)
  return rows.map((row) => ({
    bookId: Number(row.book_id),
    readingSince: dayOrNull(row.reading_since),
    finishedAt: dayOrNull(row.finished_at),
  }))
}

/** The viewer's visible copies, owned or ordered, that have a price. Order: copy id. */
export async function spending(ctx: Context): Promise<PricedCopy[]> {
  const { rows } = await drizzleFor(ctx).execute(sql`
    select copies.id, copies.book_id, ${day('copies.acquired_at')} as acquired_at, copies.price
      from copies
     where ${visibleCopies(ctx.user)} and copies.price is not null
     order by copies.id asc`)
  return rows.map((row) => ({
    copyId: Number(row.id),
    bookId: Number(row.book_id),
    acquiredAt: String(row.acquired_at),
    price: Number(row.price),
  }))
}

/**
 * The viewer's owned copies of readable Books in unread (AD-8: a missing
 * `user-books` row is unread). Ordered copies, and Books being read or read,
 * never count. `lib/stats` picks the winner. Order: copy id.
 */
export async function dustCandidates(ctx: Context): Promise<DustCopy[]> {
  const viewer = ctx.user
  const { rows } = await drizzleFor(ctx).execute(sql`
    select copies.id, copies.book_id, ${day('copies.acquired_at')} as acquired_at,
           to_char(copies.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as created_at
      from copies
      join books b on b.id = copies.book_id and ${readableBy(viewer, 'b')}
      left join user_books ub on ub.book_id = copies.book_id and ub.owner_id = ${viewer.id}
     where ${visibleCopies(viewer)} and copies.status = 'owned' and ${readStateOf} = 'unread'
     order by copies.id asc`)
  return rows.map((row) => ({
    copyId: Number(row.id),
    bookId: Number(row.book_id),
    acquiredAt: String(row.acquired_at),
    createdAt: String(row.created_at),
  }))
}
