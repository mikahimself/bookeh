import type { CollectionConfig } from 'payload'

import { ownerAccess } from '@/access/owner'
import { limits } from '@/fields/limits'
import { nameKeyField } from '@/fields/nameKey'
import { ownerField } from '@/fields/owner'

import { refuseWhileReferenced } from '@/access/deleteGuards'

/** Spine, AD-19: a back-office delete names what still refers to the row. */
const inUse = refuseWhileReferenced(
  'This person has loans or wishlist entries, so they can’t be deleted. Merge them into another person in bookeh’s Settings instead.',
  [
    { collection: 'loans', where: (id) => ({ person: { equals: id } }) },
    { collection: 'wishlist-entries', where: (id) => ({ forPerson: { equals: id } }) },
  ],
)

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
  hooks: { beforeDelete: [inUse] },
  fields: [
    ownerField(),
    { name: 'name', type: 'text', required: true, maxLength: limits.name },
    nameKeyField(),
  ],
}
