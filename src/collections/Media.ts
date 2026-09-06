import type { CollectionConfig } from 'payload'

export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    read: () => true,
  },
  admin: {
    group: 'Catalogue',
  },
  fields: [
    {
      // Optional: covers are fetched automatically during the scan flow, and
      // requiring alt text there would cost more than it buys in a private app.
      name: 'alt',
      type: 'text',
    },
  ],
  upload: true,
}
