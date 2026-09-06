import type { CollectionConfig } from 'payload'

export const Authors: CollectionConfig = {
  slug: 'authors',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'sortName', 'updatedAt'],
    group: 'Catalogue',
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      index: true,
      admin: {
        description: 'As printed on the book, e.g. "Mika Waltari".',
      },
    },
    {
      name: 'sortName',
      type: 'text',
      index: true,
      admin: {
        description: 'Surname first, e.g. "Waltari, Mika". Used for shelf ordering.',
      },
    },
    {
      name: 'notes',
      type: 'textarea',
    },
  ],
}
