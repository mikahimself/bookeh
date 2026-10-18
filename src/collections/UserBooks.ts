import type { CollectionConfig, NumberFieldValidation } from 'payload'
import { number } from 'payload/shared'

import { ownerAccess } from '@/access/owner'
import { overriddenField, overrideFields } from '@/fields/bookFields'
import { ownerField } from '@/fields/owner'
import { readableRelation } from '@/fields/relation'

/** Payload's number check (`min`/`max`), then whole stars only: `admin.step` binds the form alone. */
const wholeNumber: NumberFieldValidation = (value, options) => {
  const builtIn = number(value, options)
  if (builtIn !== true) return builtIn
  if (value === undefined || value === null || Number.isInteger(value)) return true
  return options.req.t('validation:invalidInput')
}

/**
 * Spine, AD-1/AD-6/AD-17: one row per owner and Book carrying the owner's
 * overrides of the Book's fields (`overridden` names the fields whose stored
 * value applies, an empty one meaning cleared), the read flag and the rating.
 * `book` is any Book the owner can read, a shared one or their own private
 * one. `getEffectiveBooks()` in `lib/books` reads it, laying the overrides
 * over the Book; `upsertUserBook()` there is its single writer, keeping
 * `overridden` in step with the stored values and `rating` with `ratedAt`
 * (AD-18). The `(owner, book)` unique index is in the first migration (AD-19).
 */
export const UserBooks: CollectionConfig = {
  slug: 'user-books',
  access: ownerAccess,
  admin: {
    group: 'Library',
    defaultColumns: ['book', 'owner', 'read', 'rating'],
  },
  indexes: [{ fields: ['owner', 'book'], unique: true }],
  fields: [
    ownerField(),
    readableRelation('books', { name: 'book', required: true }),
    ...overrideFields(),
    overriddenField(),
    { name: 'read', type: 'checkbox', defaultValue: false },
    { name: 'rating', type: 'number', min: 1, max: 5, admin: { step: 1 }, validate: wholeNumber },
    { name: 'ratedAt', type: 'date' },
  ],
}
