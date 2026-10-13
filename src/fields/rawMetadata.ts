import type { JSONField } from 'payload'

import { isAdmin } from '@/access/roles'

/**
 * Spine, AD-9: every source's complete response keyed by source id, the
 * subjects per source and the cover's source URL, as `RawMetadata` in
 * `lib/metadata/source.ts`. `src/fields` does not import `lib/metadata`, so
 * the shape is repeated here for `payload-types.ts`. Admin-only field read
 * access (FR-18): any read through the gateway drops it; `lib/catalogue`
 * reads it with system privileges. Never part of `EffectiveBook`.
 */
export const rawMetadataField = (): JSONField => ({
  name: 'rawMetadata',
  type: 'json',
  admin: { readOnly: true },
  access: { read: ({ req }) => isAdmin(req.user) },
  typescriptSchema: [
    () => ({
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['v', 'fetchedAt', 'sources', 'subjects', 'coverUrl'],
      properties: {
        v: { type: 'number', enum: [1] },
        fetchedAt: { type: 'string' },
        sources: { type: 'object', additionalProperties: true },
        subjects: {
          type: 'object',
          additionalProperties: { type: 'array', items: { type: 'string' } },
        },
        coverUrl: { type: ['string', 'null'] },
      },
    }),
  ],
})
