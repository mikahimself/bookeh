import type { CollectionBeforeValidateHook, CollectionConfig } from 'payload'

type BookStatus = 'owned' | 'wishlist'

/**
 * Top-level fields get the whole document as siblingData. Narrow it here rather
 * than reaching for `any`, which is reserved for rawMetadata.
 */
const statusOf = (siblingData: unknown): BookStatus | undefined =>
  (siblingData as { status?: BookStatus } | undefined)?.status

const currentYear = new Date().getFullYear()

/**
 * Keeps status and its dependent fields consistent.
 *
 * This cannot be done with field-level `validate`: Payload skips validation for
 * any field whose `admin.condition` is false, so a rule like "wishlist books
 * have no location" would never run on exactly the documents it targets.
 * Clearing beats erroring here because the offending field is hidden in the
 * admin UI, and flipping status is a normal action, not a mistake.
 */
const clearFieldsForStatus: CollectionBeforeValidateHook = ({ data, originalDoc }) => {
  if (!data) return data

  // On a partial update the incoming data may not carry status at all.
  const status = (data.status ?? (originalDoc as { status?: BookStatus } | undefined)?.status) as
    | BookStatus
    | undefined

  if (status === 'wishlist') data.location = null
  if (status === 'owned') data.wishlistFor = null

  return data
}

export const Books: CollectionConfig = {
  slug: 'books',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'authors', 'status', 'location', 'year'],
    group: 'Catalogue',
  },
  hooks: {
    beforeValidate: [clearFieldsForStatus],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'subtitle',
      type: 'text',
    },
    {
      name: 'isbn13',
      type: 'text',
      index: true,
      // Deliberately NOT unique: one document is one physical copy, and
      // duplicate copies of the same edition are real.
      admin: {
        description: 'Normalised ISBN-13, digits only. Blank is fine for older books.',
      },
      validate: (value: string | null | undefined) => {
        if (!value) return true
        return /^\d{13}$/.test(value) || 'ISBN-13 must be exactly 13 digits.'
      },
    },
    {
      name: 'authors',
      type: 'relationship',
      relationTo: 'authors',
      hasMany: true,
      index: true,
    },
    {
      name: 'series',
      type: 'relationship',
      relationTo: 'series',
      index: true,
    },
    {
      name: 'seriesIndex',
      type: 'number',
      admin: {
        description: 'Position within the series.',
        condition: (data) => Boolean(data?.series),
      },
    },
    {
      name: 'publisher',
      type: 'text',
      index: true,
    },
    {
      name: 'year',
      type: 'number',
      min: 1400,
      max: currentYear + 1,
      admin: {
        description: 'Year of this printing.',
      },
    },
    {
      name: 'language',
      type: 'text',
      index: true,
      admin: {
        description: 'ISO 639 code as supplied by the metadata source, e.g. "fin", "eng".',
      },
    },
    {
      name: 'pages',
      type: 'number',
      min: 1,
    },
    {
      name: 'cover',
      type: 'upload',
      relationTo: 'media',
    },
    {
      name: 'description',
      type: 'textarea',
    },
    {
      name: 'notes',
      type: 'textarea',
      admin: {
        description: 'Your own notes. Never overwritten by a metadata re-fetch.',
      },
    },
    {
      name: 'tags',
      type: 'relationship',
      relationTo: 'tags',
      hasMany: true,
      index: true,
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'owned',
      index: true,
      options: [
        { label: 'Owned', value: 'owned' },
        { label: 'Wishlist', value: 'wishlist' },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'location',
      type: 'select',
      index: true,
      options: [
        { label: 'Tampere', value: 'tampere' },
        { label: 'Helsinki', value: 'helsinki' },
        { label: 'Loaned out', value: 'loaned' },
      ],
      admin: {
        position: 'sidebar',
        condition: (data) => statusOf(data) === 'owned',
      },
      // Only runs when the condition above holds, i.e. on owned books.
      // The wishlist side of the invariant is handled by clearFieldsForStatus.
      validate: (value: string | null | undefined, { siblingData }: { siblingData: unknown }) => {
        if (statusOf(siblingData) === 'owned' && !value) return 'Owned books need a location.'
        return true
      },
    },
    {
      name: 'wishlistFor',
      type: 'text',
      index: true,
      admin: {
        position: 'sidebar',
        description: '"me", or the name of the person the book is intended for.',
        condition: (data) => statusOf(data) === 'wishlist',
      },
      validate: (value: string | null | undefined, { siblingData }: { siblingData: unknown }) => {
        if (statusOf(siblingData) === 'wishlist' && !value) return 'Wishlist books need a recipient.'
        return true
      },
    },
    {
      name: 'metadataSource',
      type: 'select',
      options: [
        { label: 'Finna', value: 'finna' },
        { label: 'Google Books', value: 'google' },
        { label: 'Manual', value: 'manual' },
      ],
      admin: { position: 'sidebar', readOnly: true },
    },
    {
      name: 'rawMetadata',
      type: 'json',
      admin: {
        description: 'Unmodified source response, kept so the parser can be improved and re-run.',
        readOnly: true,
      },
    },
  ],
}
