import type { CollectionSlug, Field, JSONField } from 'payload'

import { readableRelation } from '@/fields/relation'

/** Spine, AD-6: the Book fields a user may override on `user-books`, in display order. */
export const OVERRIDABLE_BOOK_FIELDS = [
  'title',
  'subtitle',
  'authors',
  'series',
  'seriesIndex',
  'publisher',
  'year',
  'language',
  'pages',
  'description',
] as const

export type OverridableBookField = (typeof OVERRIDABLE_BOOK_FIELDS)[number]

type RelationOptions = { name: string; hasMany?: boolean }

/**
 * AD-17 binds private collections: overrides live on `user-books`, so their
 * relations are checked against the request user. `books` is not private and
 * takes plain relationship fields; which targets a Book may reference (a
 * shared Book only shared records, AD-4/AD-5) is enforced by `lib/catalogue`,
 * not by the field. `hasMany` is narrowed to a literal as in `readableRelation`:
 * spread as `boolean` against a `CollectionSlug` union of more than eight
 * slugs, it exceeds tsc's 25-combination limit for discriminated unions.
 */
const relation = (
  override: boolean,
  slug: CollectionSlug,
  { name, hasMany }: RelationOptions,
): Field => {
  if (override) return readableRelation(slug, { name, hasMany })
  return hasMany
    ? { name, type: 'relationship', relationTo: slug, hasMany: true }
    : { name, type: 'relationship', relationTo: slug }
}

/**
 * The single declaration of the overridable fields and their limits. An
 * override may be stored empty (cleared, AD-6), so nothing there is required.
 */
const overridable = (override: boolean): Field[] => [
  { name: 'title', type: 'text', required: !override, maxLength: 500 },
  { name: 'subtitle', type: 'text', maxLength: 500 },
  relation(override, 'authors', { name: 'authors', hasMany: true }),
  relation(override, 'series', { name: 'series' }),
  { name: 'seriesIndex', type: 'number' },
  { name: 'publisher', type: 'text' },
  { name: 'year', type: 'number' },
  { name: 'language', type: 'text' },
  { name: 'pages', type: 'number' },
  { name: 'description', type: 'textarea', maxLength: 10_000 },
]

/**
 * Spine, AD-6: every Book field for `books` except ISBN-13 (`isbnField()`):
 * the overridable set, then the cover (only through `setCover()`, AD-14),
 * system genres and themes, none of them overridable.
 */
export const bookFields = (): Field[] => [
  ...overridable(false),
  { name: 'cover', type: 'upload', relationTo: 'media' },
  { name: 'genres', type: 'relationship', relationTo: 'genres', hasMany: true },
  { name: 'themes', type: 'text', hasMany: true },
]

/** Spine, AD-6: the override fields for `user-books`, spread beside `overridden`. */
export const overrideFields = (): Field[] => overridable(true)

const isOverridable = (value: unknown): value is OverridableBookField =>
  typeof value === 'string' && (OVERRIDABLE_BOOK_FIELDS as readonly string[]).includes(value)

/**
 * Spine, AD-6: the names of the fields a `user-books` row overrides, each a
 * member of `OVERRIDABLE_BOOK_FIELDS` once. What the list means (a listed
 * field's stored value is the override, empty meaning cleared) stays with its
 * reader `getEffectiveBooks()` in `lib/books` and its writer `upsertUserBook()`
 * there; the field only keeps a back-office edit from storing a name that
 * reader would never apply. Not `required`: Payload's json validator counts
 * `[]` as empty.
 */
export const overriddenField = (): JSONField => ({
  name: 'overridden',
  type: 'json',
  defaultValue: [],
  validate: (value: unknown, options) => {
    if (value === undefined || value === null) return true
    const valid =
      Array.isArray(value) && value.every(isOverridable) && new Set(value).size === value.length
    return valid ? true : options.req.t('validation:invalidInput')
  },
  typescriptSchema: [
    () => ({
      type: ['array', 'null'],
      items: { type: 'string', enum: [...OVERRIDABLE_BOOK_FIELDS] },
    }),
  ],
})
