import type { CollectionConfig } from 'payload'

export const Tags: CollectionConfig = {
  slug: 'tags',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'kind', 'updatedAt'],
    group: 'Catalogue',
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'kind',
      type: 'select',
      required: true,
      defaultValue: 'genre',
      index: true,
      options: [
        { label: 'Genre', value: 'genre' },
        { label: 'Theme', value: 'theme' },
        { label: 'Other', value: 'other' },
      ],
    },
  ],
}
