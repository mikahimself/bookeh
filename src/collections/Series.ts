import type { CollectionConfig } from 'payload'

import { catalogueAccess } from '@/access/catalogue'
import { limits } from '@/fields/limits'
import { nameKeyField } from '@/fields/nameKey'
import { visibilityFields } from '@/fields/visibility'

/**
 * Spine, AD-4/AD-5: shared series, plus private ones a user typed for a
 * private Book or an override, readable only by their creator and the admin.
 * Users never write here; `lib/catalogue` does with system privileges.
 * `nameKey` is unique per scope (AD-19, `nameKeyIndexes` in `payload.config.ts`).
 */
export const Series: CollectionConfig = {
  slug: 'series',
  access: catalogueAccess,
  admin: {
    group: 'Catalogue',
    useAsTitle: 'name',
    defaultColumns: ['name', 'visibility', 'createdBy'],
  },
  fields: [
    { name: 'name', type: 'text', required: true, maxLength: limits.name },
    nameKeyField(),
    ...visibilityFields(),
  ],
}
