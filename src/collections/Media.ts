import { randomUUID } from 'node:crypto'
import path from 'node:path'

import type { Access, CollectionBeforeOperationHook, CollectionConfig } from 'payload'

import { isAdmin } from '@/access/roles'

const signedIn: Access = ({ req: { user } }) => Boolean(user)

const adminOnly: Access = ({ req: { user } }) => isAdmin(user)

/**
 * Stores every upload under a random name, so a filename never carries a book
 * title or a person's name. Runs before Payload derives `filename` from
 * `req.file.name` in `generateFileData`; renaming `data.filename` later would
 * no longer match the file on disk. The stored extension is the incoming
 * name's, lower-cased. The caller's file object is copied, not changed.
 */
const randomFilename: CollectionBeforeOperationHook = ({ args, operation, req }) => {
  if ((operation === 'create' || operation === 'update') && req.file) {
    req.file = { ...req.file, name: `${randomUUID()}${path.extname(req.file.name).toLowerCase()}` }
  }
  return args
}

/**
 * Spine, AD-14: any signed-in user reads media rows and their files (the file
 * route runs `access.read` too); only the admin creates, updates or deletes.
 * Other writes come only from `lib/catalogue` with system privileges. Per-Book
 * visibility on media arrives with D28.
 */
export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    read: signedIn,
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  admin: {
    group: 'Catalogue',
  },
  hooks: {
    beforeOperation: [randomFilename],
  },
  fields: [
    {
      // Optional: covers are fetched automatically during the scan flow, and
      // requiring alt text there would cost more than it buys in a private app.
      name: 'alt',
      type: 'text',
    },
  ],
  upload: {
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  },
}
