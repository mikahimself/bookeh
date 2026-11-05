import { toNameKey } from '@/fields/nameKey'
import type { RawMetadata } from '@/lib/metadata/source'
import type { Context } from '@/lib/payload/context'
import { assertLive, withTransaction } from '@/lib/payload/transaction'

import { system } from './system'

/** Finna's genre terms in the stored (cut) response: `sources.finna.records[].genres`. */
function finnaTerms(raw: RawMetadata): string[] {
  const finna: unknown = raw.sources['finna']
  const records = (finna as { records?: unknown } | null | undefined)?.records
  if (!Array.isArray(records)) return []
  return records.flatMap((record: { genres?: unknown } | null) =>
    Array.isArray(record?.genres)
      ? record.genres.filter((term): term is string => typeof term === 'string')
      : [],
  )
}

/**
 * Spine, AD-5: the system genres of a Book from its stored source metadata,
 * the one place they are derived. Google's categories
 * (`raw.subjects.google`) match a genre's English name by `nameKey` and create
 * the missing ones, with no Finnish name. Finna's genre terms match a genre's
 * English or Finnish name and never create one. Ids are distinct, Google's
 * first. One read of all genres; runs in the caller's transaction or one of
 * its own (AD-16). Nothing to map is `[]`, with no read and no write.
 */
export async function mapSubjectsToGenres(ctx: Context, raw: RawMetadata): Promise<number[]> {
  const google = raw.subjects['google'] ?? []
  const finna = finnaTerms(raw)
  if (google.length === 0 && finna.length === 0) return []

  return withTransaction(ctx, async (tx) => {
    const { payload } = tx.req
    assertLive(tx)
    const { docs } = await payload.find({
      collection: 'genres',
      select: { name: true, nameFi: true },
      limit: 0,
      pagination: false,
      ...system(tx),
    })
    const byEnglish = new Map<string, number>()
    const byAny = new Map<string, number>()
    for (const { id, name, nameFi } of docs) {
      byEnglish.set(toNameKey(name), id)
      byAny.set(toNameKey(name), id)
      if (nameFi) byAny.set(toNameKey(nameFi), id)
    }

    const ids: number[] = []
    const add = (id: number) => {
      if (!ids.includes(id)) ids.push(id)
    }

    // One after the other: calls on one context never run concurrently (AD-16).
    for (const category of google) {
      const key = toNameKey(category)
      if (key === '') continue
      let id = byEnglish.get(key)
      if (id === undefined) {
        assertLive(tx)
        const created = await payload.create({
          collection: 'genres',
          data: { name: category.trim(), nameKey: '' },
          ...system(tx),
        })
        id = created.id
        byEnglish.set(key, id)
        byAny.set(key, id)
      }
      add(id)
    }
    for (const term of finna) {
      const id = byAny.get(toNameKey(term))
      if (id !== undefined) add(id)
    }
    return ids
  })
}
