import { DomainError } from '@/lib/errors'
import type { RawMetadata, SourceId, SourceResult, SourcesOutcome } from '@/lib/metadata/source'

import { clipCandidate } from './clipCandidate'

/**
 * AD-9: the one rule for a candidate index, shared by the lookup, the cover
 * preview and Book creation. `pick` when it indexes one of `length`
 * candidates; anything else, or none, is the best one (0).
 */
export const pickIndex = (pick: number | undefined, length: number): number =>
  pick !== undefined && Number.isInteger(pick) && pick >= 0 && pick < length ? pick : 0

/** A candidate's identity (AD-11): its source and that source's own record id. */
export type CandidateId = { source: SourceId; recordId: string }

/** A client's `CandidateId`: non-empty `source` and `recordId` strings. */
export function isCandidateId(value: unknown): value is CandidateId {
  if (typeof value !== 'object' || value === null) return false
  const { source, recordId } = value as Record<string, unknown>
  return (
    typeof source === 'string' && source !== '' && typeof recordId === 'string' && recordId !== ''
  )
}

/**
 * The candidate a save builds a Book from, clipped to the field limits
 * (`clipCandidate()`, R6), and the outcome's raw metadata with that
 * candidate's cover URL: only the cover differs per candidate, so the record
 * names the one saved.
 */
export type Chosen = { candidate: SourceResult; raw: RawMetadata }

/**
 * Spine, AD-11: the one rule for which candidate of a `found` outcome a save
 * uses, for `saveCopy()` and `prepareShare()`. With `id`, the candidate with
 * that `source` and `recordId`, wherever it is in the list, or `NOT_FOUND`
 * when the outcome has none: never another candidate. Without `id`,
 * `pickIndex()` (none or out of range is the best).
 */
export function chooseCandidate(
  outcome: Extract<SourcesOutcome, { kind: 'found' }>,
  pick?: number,
  id?: CandidateId,
): Chosen {
  const { candidates } = outcome
  const found =
    id === undefined
      ? candidates[pickIndex(pick, candidates.length)]
      : candidates.find((c) => c.source === id.source && c.recordId === id.recordId)
  // The pick branch always finds one (`found` holds at least one candidate and
  // `pickIndex` stays in range); the throw is for an id the outcome lacks.
  if (!found) throw new DomainError('NOT_FOUND')
  const candidate = clipCandidate(found)
  return { candidate, raw: { ...outcome.raw, coverUrl: candidate.coverUrl ?? null } }
}
