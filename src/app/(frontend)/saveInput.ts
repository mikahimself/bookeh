import { type CandidateId, isCandidateId } from '@/lib/catalogue/pick'
import type { SaveTarget } from '@/lib/catalogue/saveCopy'
import type { ActionResult, ErrorCode } from '@/lib/errors'
import { isRowId } from '@/lib/payload/ref'

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

/**
 * What a copy save is for (`saveCopyAction`): the ISBN's Book with the
 * candidate shown, or a Book the user holds -- the Answer for a Book with no
 * ISBN (I12). The entry save adds `{ manual }` (`components/entryTarget`).
 */
export type CopyTarget = IsbnInput | { bookId: number }

const TARGET_KINDS = ['isbn13', 'manual', 'bookId'] as const

/** One kind of save target, named by its one key. */
export type TargetKind = (typeof TARGET_KINDS)[number]

/**
 * The target a client sent, by its one key, as the save takes it: exactly one
 * of `TARGET_KINDS` present, and that kind among `allowed` -- `bookId` and
 * `isbn13` for the copy save, those and `manual` for the entry save. A
 * `bookId` must be a row id, so a guessed or malformed one is `undefined`
 * (the action's `VALIDATION`) before the save sees it.
 */
export function parseTarget(
  target: unknown,
  allowed: readonly TargetKind[],
): SaveTarget | undefined {
  if (typeof target !== 'object' || target === null) return undefined
  const kinds = TARGET_KINDS.filter((key) => key in target)
  if (kinds.length !== 1) return undefined
  const [kind] = kinds as [TargetKind]
  if (!allowed.includes(kind)) return undefined
  const value = target as Partial<Record<TargetKind, unknown>>
  if (kind === 'bookId') return isRowId(value.bookId) ? { bookId: value.bookId } : undefined
  if (kind === 'manual') {
    if (!isManualFields(value.manual)) return undefined
    const { isbn13, title, author } = value.manual
    return { manual: { isbn: isbn13, title, authors: [author] } }
  }
  return isIsbnInput(target) ? isbnTarget(target) : undefined
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
