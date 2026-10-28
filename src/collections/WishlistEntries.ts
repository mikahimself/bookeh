import type { CollectionConfig } from 'payload'

import { ownerAccess } from '@/access/owner'
import { ownerField } from '@/fields/owner'
import { ownedRelation, readableRelation } from '@/fields/relation'

/**
 * Spine, AD-1/AD-8/AD-17, FR-38: one Book wished for on one of the owner's
 * wishlists. Private: the owner alone reads and writes, the admin included.
 * An entry is never a copy or a copy status. `wishlist` and `forPerson` are
 * the owner's own rows (`ownedRelation`); `book` is read through
 * `catalogueAccess`, so `readableRelation` rejects another user's private
 * Book. An empty `forPerson` means the wish is the owner's own. `closedAt` is
 * the instant the entry was closed (bought or ordered) and empty while open; a
 * closed entry keeps its row, Remove deletes it. The same Book may appear on a
 * list more than once, so entries are addressed by id. From 7.5 on
 * `lib/wishlists` is its only writer, except that a People merge repoints
 * `forPerson` (7.4).
 */
export const WishlistEntries: CollectionConfig = {
  slug: 'wishlist-entries',
  labels: { singular: 'Wishlist entry', plural: 'Wishlist entries' },
  access: ownerAccess,
  defaultSort: '-createdAt',
  typescript: { interface: 'WishlistEntry' },
  admin: {
    group: 'My data',
    defaultColumns: ['book', 'wishlist', 'forPerson', 'closedAt'],
  },
  fields: [
    ownerField(),
    ownedRelation('wishlists', { name: 'wishlist', required: true }),
    readableRelation('books', { name: 'book', required: true }),
    ownedRelation('people', { name: 'forPerson' }),
    { name: 'closedAt', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime' } } },
  ],
}
