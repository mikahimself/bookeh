import { ValidationError, type CollectionBeforeValidateHook, type CollectionConfig } from 'payload'

import { ownerAccess } from '@/access/owner'
import { ownerField } from '@/fields/owner'
import { ownedRelation, readableRelation } from '@/fields/relation'
import type { Copy } from '@/payload-types'

/**
 * AD-8: an ordered copy has no location. A collection hook rather than a
 * `validate` on `location`, so the error lands on `location` whichever field
 * the write submitted. By the time it runs, Payload's field `beforeValidate`
 * has refilled every unsubmitted field from the stored row, so on update
 * `data.status` and `data.location` are both present. It never clears
 * anything: that belongs to `lib/copies` (AD-18).
 */
const noLocationWhenOrdered: CollectionBeforeValidateHook<Copy> = ({ collection, data, req }) => {
  if (data?.status === 'ordered' && data.location != null) {
    throw new ValidationError({
      collection: collection.slug,
      errors: [{ path: 'location', message: req.t('validation:invalidInput') }],
      req,
    })
  }
  return data
}

/**
 * Spine, AD-1/AD-8/AD-17: one physical item of a Book, owned by one user. The
 * Book is a catalogue row read through `catalogueAccess`, so `readableRelation`
 * rejects another user's private Book. `status` is `ordered | owned` and
 * nothing else; wishlist and loan state live in their own collections (AD-8).
 * Notes are per copy. `location` is one of the owner's `locations` or none;
 * `ownedRelation` rejects another user's, and `noLocationWhenOrdered` keeps an
 * ordered copy without one.
 */
export const Copies: CollectionConfig = {
  slug: 'copies',
  access: ownerAccess,
  admin: {
    group: 'Library',
    defaultColumns: ['book', 'status', 'location', 'owner', 'updatedAt'],
  },
  hooks: { beforeValidate: [noLocationWhenOrdered] },
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
    ownedRelation('locations', { name: 'location' }),
    { name: 'notes', type: 'textarea', maxLength: 2000 },
  ],
}
