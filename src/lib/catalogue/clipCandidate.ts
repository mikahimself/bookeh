import { clip, limits } from '@/fields/limits'
import { normaliseName } from '@/fields/sortName'
import type { SourceResult } from '@/lib/metadata/source'

/**
 * R6: a source candidate with its title, subtitle, description, author names
 * and series clipped to the field limits, so a source value never fails the
 * write of a shared Book. Names are normalised first (`normaliseName()`, as
 * `findOrCreateByName()` stores them), so the clip measures the stored name.
 * Applied before authors and series are matched, which keys on the stored
 * name, and by the Answer (`lookupBook()`) so it shows and matches what a
 * save stores. Typed text is never clipped (`normaliseManual()`).
 */
const clipName = (name: string): string => clip(normaliseName(name), limits.name)

export function clipCandidate(c: SourceResult): SourceResult {
  return {
    ...c,
    title: clip(c.title, limits.title),
    ...(c.subtitle !== undefined && { subtitle: clip(c.subtitle, limits.subtitle) }),
    ...(c.description !== undefined && { description: clip(c.description, limits.description) }),
    authors: c.authors.map((author) => ({ ...author, name: clipName(author.name) })),
    ...(c.series !== undefined && { series: clipName(c.series) }),
  }
}
