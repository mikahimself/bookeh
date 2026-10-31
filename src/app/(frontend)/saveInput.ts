import { type CandidateId, isCandidateId } from '@/lib/catalogue/pick'
import type { SaveTarget } from '@/lib/catalogue/saveCopy'
import type { ActionResult, ErrorCode } from '@/lib/errors'

// Input checks the copy saves (`scan/actions.ts`) and the entry save
// (`actions/wishlists.ts`) share. Not in a `'use server'` file: those export
// only async functions.

export type IsbnInput = { isbn13: string; pick?: number; candidate?: CandidateId }

/** `{ isbn13 }` with an optional `pick` (a non-negative integer) and `candidate` (`isCandidateId()`). */
export function isIsbnInput(input: unknown): input is IsbnInput {
  if (typeof input !== 'object' || input === null) return false
  const { isbn13, pick, candidate } = input as Record<string, unknown>
  return (
    typeof isbn13 === 'string' &&
    (pick === undefined || (typeof pick === 'number' && Number.isInteger(pick) && pick >= 0)) &&
    (candidate === undefined || isCandidateId(candidate))
  )
}

/** The ISBN target as checked, rebuilt so nothing else from the client goes along. */
export function isbnTarget({ isbn13, pick, candidate }: IsbnInput): SaveTarget {
  return {
    isbn13,
    ...(pick !== undefined && { pick }),
    ...(candidate !== undefined && {
      candidate: { source: candidate.source, recordId: candidate.recordId },
    }),
  }
}

export type ManualInput = { title: string; author: string; isbn13?: string }

/** `{ title, author }` strings with an optional `isbn13` string. */
export function isManualFields(input: unknown): input is ManualInput {
  if (typeof input !== 'object' || input === null) return false
  const { title, author, isbn13 } = input as Record<string, unknown>
  return (
    typeof title === 'string' &&
    typeof author === 'string' &&
    (isbn13 === undefined || typeof isbn13 === 'string')
  )
}

/** A `VALIDATION` naming `title` or `authors`, with only those fields; else `undefined`. */
export function manualFields(
  failure: Extract<ActionResult<never>, { ok: false }>,
): Extract<ActionResult<never>, { ok: false }> | undefined {
  if (failure.code !== 'VALIDATION' || !failure.fields) return undefined
  const { title, authors } = failure.fields
  const fields: Record<string, ErrorCode> = {
    ...(title === undefined ? {} : { title }),
    ...(authors === undefined ? {} : { authors }),
  }
  return Object.keys(fields).length > 0 ? { ok: false, code: 'VALIDATION', fields } : undefined
}
