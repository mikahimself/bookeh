import type { CollectionConfig } from 'payload'

import { ownerAccess } from '@/access/owner'
import { limits } from '@/fields/limits'
import { nameKeyField } from '@/fields/nameKey'
import { ownerField } from '@/fields/owner'

/**
 * Spine, AD-1/AD-19: a name on the user's own list of borrowers and
 * recipients (FR-34), never a user account. Private: the owner alone reads and
 * writes, the admin included. One name per owner, compared by `nameKey` (Names
 * convention), enforced by the compound unique index in the `people`
 * migration. `loans.person` and later `wishlist-entries` point here through
 * `ownedRelation`; from 6.3 on `lib/people` is its only writer.
 */
export const People: CollectionConfig = {
  slug: 'people',
  labels: { singular: 'Person', plural: 'People' },
  access: ownerAccess,
  defaultSort: 'name',
  typescript: { interface: 'Person' },
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
