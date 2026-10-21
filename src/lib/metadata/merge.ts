import type { RawMetadata, SourceId, SourceResult } from './source'

type MergedField = Exclude<keyof SourceResult, 'source' | 'recordId' | 'raw'>

// Every merged field, listed once. `Record` makes the compiler reject this
// table when a field is added to `SourceResult` and left out here.
const FIELDS = Object.keys({
  isbn13: true,
  title: true,
  subtitle: true,
  authors: true,
  series: true,
  seriesIndex: true,
  publisher: true,
  year: true,
  language: true,
  pages: true,
  description: true,
  subjects: true,
  themes: true,
  binding: true,
  coverUrl: true,
} satisfies Record<MergedField, true>) as MergedField[]

const isEmpty = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  value === '' ||
  (Array.isArray(value) && value.length === 0)

function copyField<K extends MergedField>(target: SourceResult, from: SourceResult, key: K): void {
  target[key] = from[key]
}

/**
 * Merges sources by priority (AD-9). `lists` holds one entry per source in
 * source order, each that source's records best first; only each list's best
 * record is read. Every field takes the first non-empty value in that order,
 * `source` and `recordId` are the first answering source's (never gap-filled,
 * so they name the candidate), and `raw` is the union of the records' `raw`
 * (first wins). `null` when no source has a record.
 */
export function mergeResults(
  lists: SourceResult[][],
  now: Date = new Date(),
): { result: SourceResult; raw: RawMetadata } | null {
  const records = lists.flatMap((list) => list.slice(0, 1))
  const [first] = records
  if (!first) return null

  const sources: Record<SourceId, unknown> = {}
  const subjects: Record<SourceId, string[]> = {}
  for (const record of records) {
    for (const [id, value] of Object.entries(record.raw)) {
      if (!(id in sources)) sources[id] = value
    }
    if (!(record.source in subjects)) subjects[record.source] = record.subjects
  }

  const result: SourceResult = { ...first, raw: { ...sources } }
  for (const key of FIELDS) {
    const donor = records.find((record) => !isEmpty(record[key]))
    if (donor) copyField(result, donor, key)
  }

  return {
    result,
    raw: {
      v: 1,
      fetchedAt: now.toISOString(),
      sources,
      subjects,
      coverUrl: result.coverUrl || null,
    },
  }
}
