import type { CollectionSlug, Field } from 'payload'

import { readableRelation } from '@/fields/relation'

// The generated `CollectionSlug` gains these with B4–B5 (stories 3.16–3.17).
const SERIES = 'series' as CollectionSlug
const GENRES = 'genres' as CollectionSlug

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
 * not by the field.
 */
const relation = (override: boolean, slug: CollectionSlug, options: RelationOptions): Field =>
  override
    ? readableRelation(slug, options)
    : { type: 'relationship', relationTo: slug, ...options }

/**
 * The single declaration of the overridable fields and their limits. An
 * override may be stored empty (cleared, AD-6), so nothing there is required.
 */
const overridable = (override: boolean): Field[] => [
  { name: 'title', type: 'text', required: !override, maxLength: 500 },
  { name: 'subtitle', type: 'text', maxLength: 500 },
  relation(override, 'authors', { name: 'authors', hasMany: true }),
  relation(override, SERIES, { name: 'series' }),
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
  { name: 'genres', type: 'relationship', relationTo: GENRES, hasMany: true },
  { name: 'themes', type: 'text', hasMany: true },
]

/** Spine, AD-6: the override fields for `user-books`, spread beside `overridden`. */
export const overrideFields = (): Field[] => overridable(true)
