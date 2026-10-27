import type { CollectionConfig } from 'payload'

import { ownerAccess } from '@/access/owner'
import { limits } from '@/fields/limits'
import { nameKeyField } from '@/fields/nameKey'
import { ownerField } from '@/fields/owner'

/**
 * Spine, AD-1/AD-19: a named list of Books the user wants (FR-38), such as
 * "Me" or "Christmas". Private: the owner alone reads and writes, the admin
 * included. One name per owner, compared by `nameKey` (Names convention),
 * enforced by the compound unique index in the `wishlists` migration.
 * `wishlist-entries.wishlist` points here through `ownedRelation` (7.2); from
 * 7.5 on `lib/wishlists` is its only writer.
 */
export const Wishlists: CollectionConfig = {
  slug: 'wishlists',
  labels: { singular: 'Wishlist', plural: 'Wishlists' },
  access: ownerAccess,
  defaultSort: 'name',
  typescript: { interface: 'Wishlist' },
  admin: {
    group: 'My data',
    useAsTitle: 'name',
    defaultColumns: ['name', 'updatedAt'],
  },
  indexes: [{ fields: ['owner', 'nameKey'], unique: true }],
  fields: [
    ownerField(),
    { name: 'name', type: 'text', required: true, maxLength: limits.name },
    nameKeyField(),
  ],
}
