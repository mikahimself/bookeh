import type { RawMetadata } from '@/lib/metadata/source'
import type { Context } from '@/lib/payload/context'

/**
 * Spine, AD-5: the system genres of a Book from its stored source metadata,
 * the one place they are derived. A stub until Epic 9: G5 matches
 * `raw.subjects.google` to `genres` here. Resolves no genres and makes no
 * read and no write.
 */
export async function mapSubjectsToGenres(_ctx: Context, _raw: RawMetadata): Promise<number[]> {
  return []
}
