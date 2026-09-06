import type { CollectionConfig } from 'payload'

/**
 * A loan is open while dateReturned is empty. Opening a loan from a book's
 * location is wired up in M4; this collection is just the record.
 */
export const Loans: CollectionConfig = {
  slug: 'loans',
  admin: {
    useAsTitle: 'borrower',
    defaultColumns: ['book', 'borrower', 'dateOut', 'dateReturned'],
    group: 'Activity',
  },
  fields: [
    {
      name: 'book',
      type: 'relationship',
      relationTo: 'books',
      required: true,
      index: true,
    },
    {
      name: 'borrower',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'dateOut',
      type: 'date',
      required: true,
      defaultValue: () => new Date().toISOString(),
      index: true,
    },
    {
      name: 'dateReturned',
      type: 'date',
      index: true,
      admin: {
        description: 'Empty means the book is still out.',
      },
      validate: (value: unknown, { siblingData }: { siblingData: unknown }) => {
        if (!value || typeof value !== 'string') return true
        const out = (siblingData as { dateOut?: string } | undefined)?.dateOut
        if (out && new Date(value) < new Date(out)) {
          return 'Return date cannot be before the date the book went out.'
        }
        return true
      },
    },
  ],
}
