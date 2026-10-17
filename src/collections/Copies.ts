import type { CollectionConfig } from 'payload'

import { ownerAccess } from '@/access/owner'
import { ownerField } from '@/fields/owner'
import { readableRelation } from '@/fields/relation'

/**
 * Spine, AD-1/AD-8/AD-17: one physical item of a Book, owned by one user. The
 * Book is a catalogue row read through `catalogueAccess`, so `readableRelation`
 * rejects another user's private Book. `status` is `ordered | owned` and
 * nothing else; wishlist and loan state live in their own collections (AD-8).
 * Notes are per copy. `location` comes with the `locations` collection.
 */
export const Copies: CollectionConfig = {
  slug: 'copies',
  access: ownerAccess,
  admin: {
    group: 'Library',
    defaultColumns: ['book', 'status', 'owner', 'updatedAt'],
  },
  fields: [
    ownerField(),
    readableRelation('books', { name: 'book', required: true }),
    {
      name: 'status',
      type: 'select',
      required: true,
      options: ['ordered', 'owned'],
      defaultValue: 'owned',
    },
    { name: 'notes', type: 'textarea', maxLength: 2000 },
  ],
}
