import type { CollectionConfig } from 'payload'

import { catalogueAccess } from '@/access/catalogue'
import { bookFields } from '@/fields/bookFields'
import { isbnField } from '@/fields/isbn'
import { rawMetadataField } from '@/fields/rawMetadata'
import { visibilityFields } from '@/fields/visibility'

/**
 * Spine, AD-4/AD-5/AD-6: one edition. Shared Books come from a source, private
 * ones from manual entry, readable only by their creator and the admin. Users
 * never write here; `lib/catalogue` does with system privileges. `isbn13` is
 * optional (a manual Book may have none) and unique per scope (AD-19,
 * `isbnIndexes` in `payload.config.ts`). `source` is the id of the first
 * source that answered, empty for a manual Book.
 */
export const Books: CollectionConfig = {
  slug: 'books',
  access: catalogueAccess,
  admin: {
    group: 'Catalogue',
    useAsTitle: 'title',
    defaultColumns: ['title', 'isbn13', 'visibility', 'createdBy'],
    listSearchableFields: ['title', 'isbn13'],
  },
  fields: [
    isbnField(),
    ...bookFields(),
    { name: 'source', type: 'text' },
    rawMetadataField(),
    ...visibilityFields(),
  ],
}
