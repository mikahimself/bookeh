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
