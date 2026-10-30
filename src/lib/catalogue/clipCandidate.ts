import { clip, limits } from '@/fields/limits'
import { normaliseName } from '@/fields/sortName'
import type { SourceResult } from '@/lib/metadata/source'

/**
 * R6: a source candidate with its title, subtitle, publisher, language,
 * description, author names and series clipped to the field limits, and a
 * negative `seriesIndex`, `year` or `pages` left out, so a source value never
 * fails the write of a shared Book. Names are normalised first (`normaliseName()`, as
 * `findOrCreateByName()` stores them), so the clip measures the stored name.
 * Applied before authors and series are matched, which keys on the stored
 * name, and by the Answer (`lookupBook()`) so it shows and matches what a
 * save stores. Typed text is never clipped (`normaliseManual()`).
 */
const clipName = (name: string): string => clip(normaliseName(name), limits.name)

/** `{ [key]: value }`, or nothing for a negative value or none. */
const natural = <K extends string>(key: K, value: number | undefined) =>
  value !== undefined && value >= 0 ? ({ [key]: value } as Record<K, number>) : {}

export function clipCandidate(candidate: SourceResult): SourceResult {
  const { seriesIndex, year, pages, ...c } = candidate
  return {
    ...c,
    ...natural('seriesIndex', seriesIndex),
    ...natural('year', year),
    ...natural('pages', pages),
    title: clip(c.title, limits.title),
    ...(c.subtitle !== undefined && { subtitle: clip(c.subtitle, limits.subtitle) }),
    ...(c.publisher !== undefined && { publisher: clip(c.publisher, limits.publisher) }),
    ...(c.language !== undefined && { language: clip(c.language, limits.language) }),
    ...(c.description !== undefined && { description: clip(c.description, limits.description) }),
    authors: c.authors.map((author) => ({ ...author, name: clipName(author.name) })),
    ...(c.series !== undefined && { series: clipName(c.series) }),
  }
}
