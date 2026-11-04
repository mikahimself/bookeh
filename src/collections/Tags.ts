import type { CollectionConfig } from 'payload'

import { ownerAccess } from '@/access/owner'
import { limits } from '@/fields/limits'
import { nameKeyField } from '@/fields/nameKey'
import { ownerField } from '@/fields/owner'

/** Private classifications, unique per owner and kind by normalized name. */
export const Tags: CollectionConfig = {
  slug: 'tags',
  access: ownerAccess,
  defaultSort: 'name',
  admin: {
    group: 'My data',
    useAsTitle: 'name',
    defaultColumns: ['name', 'kind', 'updatedAt'],
  },
  indexes: [{ fields: ['owner', 'kind', 'nameKey'], unique: true }],
  fields: [
    ownerField(),
    { name: 'name', type: 'text', required: true, maxLength: limits.name },
    nameKeyField(),
    { name: 'kind', type: 'select', required: true, options: ['tag', 'genre', 'theme'] },
  ],
}
