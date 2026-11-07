import { type SQL, sql } from '@payloadcms/db-postgres/drizzle'

import { isAdmin } from '@/access/roles'
import type { Context } from '@/lib/payload/context'

type Viewer = Context['user']

/**
 * Spine, AD-7: the one condition deciding which copies a viewer sees, on the
 * unaliased `copies` table. Every shelf query, its count included, builds on
 * it. Today a viewer sees only their own copies.
 */
export const visibleCopies = (viewer: Viewer): SQL => sql`copies.owner_id = ${viewer.id}`

/**
 * Spine, AD-4: the read rule of `catalogueAccess` on a `books`, `authors` or
 * `series` alias. The admin reads every row; a user reads shared rows and the
 * private rows they created. `alias` is a constant of the calling query.
 */
export const readableBy = (viewer: Viewer, alias: string): SQL => {
  if (isAdmin(viewer)) return sql`true`
  const t = sql.identifier(alias)
  return sql`(${t}.visibility = 'shared' or ${t}.created_by_id = ${viewer.id})`
}

/**
 * Spine, AD-7: the counterpart of `visibleCopies` for wishlist entries, on
 * the unaliased `wishlist_entries` table — the one condition deciding whose
 * entries a viewer sees. Openness is a separate rule (`closed_at is null`,
 * `openEntry` for the gateway reads): a closed entry is still the viewer's,
 * it is simply not a holding.
 */
export const visibleEntries = (viewer: Viewer): SQL => sql`wishlist_entries.owner_id = ${viewer.id}`

/**
 * Spine, AD-7: the holding rule on a `books` alias. The viewer holds a Book
 * with a visible copy (owned or ordered) or a visible open wishlist entry of
 * it. Readers of per-Book rows that outlive their copies (`user-books`, AD-6)
 * list only held Books. `alias` is a constant of the calling query.
 */
export const holds = (viewer: Viewer, alias: string): SQL => {
  const t = sql.identifier(alias)
  return sql`(exists (select 1 from copies
                       where copies.book_id = ${t}.id and ${visibleCopies(viewer)})
              or exists (select 1 from wishlist_entries
                          where wishlist_entries.book_id = ${t}.id and ${visibleEntries(viewer)}
                            and wishlist_entries.closed_at is null))`
}
