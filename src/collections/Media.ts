import { randomUUID } from 'node:crypto'
import path from 'node:path'

import { MissingFile, type CollectionBeforeOperationHook, type CollectionConfig } from 'payload'

import { catalogueAccess } from '@/access/catalogue'
import { visibilityFields } from '@/fields/visibility'

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
 * `filesRequiredOnCreate: false` lets `lib/catalogue` record a cover it wrote
 * itself: a system create with `data.filename` and no file stores the row and
 * writes nothing (AD-14). Everyone else still needs a file: Payload strips
 * `filename` from a create without `overrideAccess` before this hook runs.
 */
const requireFile: CollectionBeforeOperationHook = ({ args, operation, req }) => {
  const { data } = args as { data?: { filename?: unknown } }
  if (operation === 'create' && !req.file && !data?.filename) throw new MissingFile(req.t)
  return args
}

/**
 * Spine, AD-4/AD-14: a user reads shared media rows and the private ones they
 * created, the admin reads every row; the file route applies the same rule
 * (it ANDs `access.read` with the filename). Only the admin creates, updates
 * or deletes. Other writes come only from `lib/catalogue` with system
 * privileges.
 */
export const Media: CollectionConfig = {
  slug: 'media',
  access: catalogueAccess,
  admin: {
    group: 'Catalogue',
  },
  hooks: {
    beforeOperation: [requireFile, randomFilename],
  },
  fields: [
    {
      // Optional: covers are fetched automatically during the scan flow, and
      // requiring alt text there would cost more than it buys in a private app.
      name: 'alt',
      type: 'text',
    },
    ...visibilityFields(),
  ],
  upload: {
    staticDir: process.env.MEDIA_DIR || 'media',
    filesRequiredOnCreate: false,
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  },
}
