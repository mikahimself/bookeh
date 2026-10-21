import type { CollectionSlug } from 'payload'

import type { Context } from '@/lib/payload/context'
import { assertLive } from '@/lib/payload/transaction'

import { system } from './system'

/** The catalogue rows a restore or a share's clean-up may delete when nothing references them (AD-3, AD-11). */
export type CatalogueCollection = 'books' | 'authors' | 'series' | 'genres' | 'media'

/**
 * Spine, AD-3 and AD-11: true when no row of any user references the
 * catalogue record `id` in `collection`. Discovers the references from the
 * Payload config: every top-level `relationship` or `upload` field of any
 * collection whose `relationTo` is `collection`, so a collection added later
 * is covered without a change here. Polymorphic fields (`relationTo` an
 * array, such as Payload's own `payload-locked-documents`) are skipped.
 *
 * Counts with system privileges on `ctx.req`, in the caller's transaction
 * when it carries one, and stops at the first reference. Writes nothing.
 */
export async function isUnreferenced(
  ctx: Context,
  collection: CatalogueCollection,
  id: number,
): Promise<boolean> {
  const { payload } = ctx.req
  for (const config of payload.config.collections) {
    for (const field of config.flattenedFields) {
      if (field.type !== 'relationship' && field.type !== 'upload') continue
      if (field.relationTo !== collection) continue
      assertLive(ctx)
      const { totalDocs } = await payload.count({
        collection: config.slug as CollectionSlug,
        where: { [field.name]: { equals: id } },
        ...system(ctx),
      })
      if (totalDocs > 0) return false
    }
  }
  return true
}
