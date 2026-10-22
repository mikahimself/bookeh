import type { CollectionConfig } from 'payload'

import { ownerAccess } from '@/access/owner'
import { nameKeyField } from '@/fields/nameKey'
import { ownerField } from '@/fields/owner'

/**
 * Spine, AD-1/AD-19: a place where a user keeps copies (FR-31). Private: the
 * owner alone reads and writes, the admin included. One name per owner,
 * compared by `nameKey` (Names convention), enforced by the compound unique
 * index in the `locations` migration. `copies.location` and
 * `users.defaultLocation` point here through `ownedRelation`. The generated
 * interface is `UserLocation`: `Location` would shadow the DOM global.
 */
export const Locations: CollectionConfig = {
  slug: 'locations',
  access: ownerAccess,
  defaultSort: 'name',
  typescript: { interface: 'UserLocation' },
  admin: {
    group: 'My data',
    useAsTitle: 'name',
    defaultColumns: ['name', 'updatedAt'],
  },
  indexes: [{ fields: ['owner', 'nameKey'], unique: true }],
  fields: [
    ownerField(),
    { name: 'name', type: 'text', required: true, maxLength: 200 },
    nameKeyField(),
  ],
}
