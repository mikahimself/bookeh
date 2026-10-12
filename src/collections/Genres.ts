import type { CollectionConfig } from 'payload'

import { genreAccess } from '@/access/catalogue'
import { nameKeyField } from '@/fields/nameKey'

/**
 * Spine, AD-4/AD-5: system genres, shared only (D-2), with an English name
 * and an optional Finnish one; display goes through `genreName()` in
 * `lib/books`. Users read, the admin writes; `lib/catalogue` writes with
 * system privileges. With no `visibility`, `nameKey` is plainly unique
 * (AD-19).
 */
export const Genres: CollectionConfig = {
  slug: 'genres',
  access: genreAccess,
  defaultSort: 'name',
  admin: {
    group: 'Catalogue',
    useAsTitle: 'name',
    defaultColumns: ['name', 'nameFi'],
  },
  fields: [
    { name: 'name', type: 'text', required: true, maxLength: 200 },
    { name: 'nameFi', type: 'text', label: 'Finnish name', maxLength: 200 },
    { ...nameKeyField(), unique: true },
  ],
}
