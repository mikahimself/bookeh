import type { CollectionConfig } from 'payload'

import { catalogueAccess } from '@/access/catalogue'
import { limits } from '@/fields/limits'
import { nameKeyField } from '@/fields/nameKey'
import { sortNameField } from '@/fields/sortName'
import { visibilityFields } from '@/fields/visibility'

import { refuseWhileReferenced } from '@/access/deleteGuards'

/** Spine, AD-19: a back-office delete names what still refers to the row. */
const inUse = refuseWhileReferenced(
  'Books still list this author, so it can’t be deleted. Remove it from them first.',
  [{ collection: 'books', where: (id) => ({ authors: { in: [id] } }) }],
)

/**
 * Spine, AD-4/AD-5: shared authors, plus private ones a user typed for a
 * private Book or an override, readable only by their creator and the admin.
 * Users never write here; `lib/catalogue` does with system privileges.
 * `nameKey` is unique per scope (AD-19, `nameKeyIndexes` in `payload.config.ts`).
 */
export const Authors: CollectionConfig = {
  slug: 'authors',
  access: catalogueAccess,
  admin: {
    group: 'Catalogue',
    useAsTitle: 'name',
    defaultColumns: ['name', 'visibility', 'createdBy'],
  },
  hooks: { beforeDelete: [inUse] },
  fields: [
    { name: 'name', type: 'text', required: true, maxLength: limits.name },
    nameKeyField(),
    sortNameField(),
    ...visibilityFields(),
  ],
}
