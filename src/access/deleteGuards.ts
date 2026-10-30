import { APIError, type CollectionBeforeDeleteHook, type CollectionSlug, type Where } from 'payload'

import { asRequestUser } from '@/access/asRequestUser'

/** A collection whose rows may point at the row being deleted, and how they do. */
export type Reference = { collection: CollectionSlug; where: (id: number | string) => Where }

/**
 * Spine, AD-19: a back-office delete of a row that rows still reference fails
 * with `message`, a 409 the admin reads, instead of the foreign key's raw
 * error or, for a `_rels` key, a silent strip. Counts through
 * `asRequestUser(req)` (AD-3), so rows the deleting user cannot read stay
 * unread (FR-48) and are left to the foreign key. A request without a user
 * (a script, a system delete) is not counted: the key still guards it.
 * Services delete in order, so their deletes count none.
 */
export const refuseWhileReferenced =
  (message: string, references: readonly Reference[]): CollectionBeforeDeleteHook =>
  async ({ id, req }) => {
    if (!req.user) return
    for (const { collection, where } of references) {
      const { totalDocs } = await req.payload.count({
        collection,
        where: where(id),
        ...asRequestUser(req),
      })
      if (totalDocs > 0) throw new APIError(message, 409, null, true)
    }
  }
