import type { Access, AccessResult } from 'payload'

import { isAdmin } from '@/access/roles'

/**
 * Spine, AD-4/AD-5: a signed-in user reads shared rows and the private rows
 * they created; the admin reads every row. Signed out reads nothing.
 */
const sharedOrOwnPrivate: Access = ({ req: { user } }): AccessResult => {
  if (isAdmin(user)) return true
  if (!user) return false
  return { or: [{ visibility: { equals: 'shared' } }, { createdBy: { equals: user.id } }] }
}

const adminOnly: Access = ({ req: { user } }) => isAdmin(user)

/**
 * Access for the catalogue collections with `visibilityFields()` (`authors`,
 * `series`, `books`). Users never write them; other writes come only from
 * `lib/catalogue` with system privileges.
 */
export const catalogueAccess = {
  read: sharedOrOwnPrivate,
  create: adminOnly,
  update: adminOnly,
  delete: adminOnly,
} satisfies Record<'read' | 'create' | 'update' | 'delete', Access>
