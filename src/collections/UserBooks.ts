import { ValidationError, type CollectionBeforeValidateHook, type CollectionConfig } from 'payload'

import { ownerAccess } from '@/access/owner'
import { overriddenField, overrideFields } from '@/fields/bookFields'
import { ownerField } from '@/fields/owner'
import { ownedRelation, readableRelation } from '@/fields/relation'
import { helsinkiToday, noonUtc, readingDate } from '@/fields/readingDates'
import { wholeNumber } from '@/fields/wholeNumber'
import type { UserBook } from '@/payload-types'

/** Covers partial back-office updates as well as writes through the services. */
const validateReadingDates: CollectionBeforeValidateHook<UserBook> = ({
  collection,
  data,
  originalDoc,
  req,
}) => {
  if (!data) return data
  const today = helsinkiToday()
  const errors: { path: string; message: string }[] = []
  const dates = { readingSince: null as string | null, finishedAt: null as string | null }
  for (const field of ['readingSince', 'finishedAt'] as const) {
    const value = data[field] === undefined ? originalDoc?.[field] : data[field]
    if (value === undefined || value === null || value === '') continue
    const day = readingDate(value)
    if (!day || day > today) {
      errors.push({ path: field, message: req.t('validation:invalidInput') })
    } else {
      dates[field] = day
      data[field] = noonUtc(day)
    }
  }
  const read = data.read === undefined ? originalDoc?.read : data.read
  if (dates.finishedAt && !read) {
    errors.push({ path: 'finishedAt', message: req.t('validation:invalidInput') })
  }
  if (dates.readingSince && dates.finishedAt && dates.readingSince > dates.finishedAt) {
    errors.push({ path: 'finishedAt', message: req.t('validation:invalidInput') })
  }
  if (errors.length) throw new ValidationError({ collection: collection.slug, errors, req })
  return data
}

/**
 * Spine, AD-1/AD-6/AD-17: one row per owner and Book carrying the owner's
 * overrides of the Book's fields (`overridden` names the fields whose stored
 * value applies, an empty one meaning cleared), reading values and the rating.
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
    group: 'My data',
    defaultColumns: ['book', 'read', 'rating'],
  },
  indexes: [{ fields: ['owner', 'book'], unique: true }],
  hooks: { beforeValidate: [validateReadingDates] },
  fields: [
    ownerField(),
    readableRelation('books', { name: 'book', required: true }),
    ...overrideFields(),
    overriddenField(),
    ownedRelation('tags', { name: 'tags', hasMany: true }),
    { name: 'read', type: 'checkbox', defaultValue: false },
    { name: 'readingSince', type: 'date', admin: { date: { pickerAppearance: 'dayOnly' } } },
    { name: 'finishedAt', type: 'date', admin: { date: { pickerAppearance: 'dayOnly' } } },
    { name: 'rating', type: 'number', min: 1, max: 5, admin: { step: 1 }, validate: wholeNumber },
    { name: 'ratedAt', type: 'date' },
  ],
}
