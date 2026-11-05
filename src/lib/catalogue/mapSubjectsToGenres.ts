import { toNameKey } from '@/fields/nameKey'
import type { RawMetadata } from '@/lib/metadata/source'
import type { Context } from '@/lib/payload/context'
import { assertLive, withTransaction } from '@/lib/payload/transaction'

import type { Match } from './lookupBook'
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

type Tx = Parameters<Parameters<typeof withTransaction>[1]>[0]

/**
 * The read-only step both the save and the Answer's preview share: the genres
 * `raw` maps to, in order, `id: null` for a Google category no genre matches
 * yet (the save creates it). One read of all genres. Google's categories match
 * a genre's English name by `nameKey`, Finna's terms its English or Finnish
 * name and never create. Entries are distinct, Google's first.
 */
async function resolveGenres(tx: Tx, raw: RawMetadata): Promise<Match[]> {
  const google = raw.subjects['google'] ?? []
  const finna = finnaTerms(raw)
  if (google.length === 0 && finna.length === 0) return []

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
  const nameOf = new Map<number, string>()
  for (const { id, name, nameFi } of docs) {
    byEnglish.set(toNameKey(name), id)
    byAny.set(toNameKey(name), id)
    nameOf.set(id, name)
    if (nameFi) byAny.set(toNameKey(nameFi), id)
  }

  const matches: Match[] = []
  const pending = new Set<string>() // nameKeys of entries the save would create
  for (const category of google) {
    const key = toNameKey(category)
    if (key === '') continue
    const id = byEnglish.get(key)
    if (id === undefined) {
      if (pending.has(key)) continue
      pending.add(key)
      matches.push({ name: category.trim(), id: null })
    } else if (!matches.some((m) => m.id === id)) {
      matches.push({ name: category.trim(), id })
    }
  }
  for (const term of finna) {
    const id = byAny.get(toNameKey(term))
    if (id !== undefined && !matches.some((m) => m.id === id)) {
      matches.push({ name: nameOf.get(id)!, id })
    }
  }
  return matches
}

/**
 * The genres a save of `raw` would set, written nowhere: the Answer's "New
 * genre" notes (FR-13). The same resolution `mapSubjectsToGenres()` writes.
 */
export async function previewGenres(ctx: Context, raw: RawMetadata): Promise<Match[]> {
  return withTransaction(ctx, (tx) => resolveGenres(tx, raw))
}

/**
 * Spine, AD-5: the system genres of a Book from its stored source metadata,
 * the one place they are derived (`resolveGenres()`), creating the missing
 * Google ones with no Finnish name. Runs in the caller's transaction or one of
 * its own (AD-16). Nothing to map is `[]`, with no read and no write.
 */
export async function mapSubjectsToGenres(ctx: Context, raw: RawMetadata): Promise<number[]> {
  return withTransaction(ctx, async (tx) => {
    const matches = await resolveGenres(tx, raw)
    const { payload } = tx.req
    const ids: number[] = []
    // One after the other: calls on one context never run concurrently (AD-16).
    for (const { name, id } of matches) {
      if (id !== null) {
        ids.push(id)
        continue
      }
      assertLive(tx)
      const created = await payload.create({
        collection: 'genres',
        data: { name, nameKey: '' },
        ...system(tx),
      })
      ids.push(created.id)
    }
    return ids
  })
}
