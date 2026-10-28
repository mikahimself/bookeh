'use server'

import { type CandidateId, isCandidateId } from '@/lib/catalogue/pick'
import {
  type EntrySaveResult,
  saveCopy,
  saveEntry,
  type SaveResult,
  type SaveTarget,
} from '@/lib/catalogue/saveCopy'
import { DomainError, logger, runAction, type ActionResult, type ErrorCode } from '@/lib/errors'
import { requireUserOrThrow } from '@/lib/payload/context'
import { isRowId, type Ref } from '@/lib/payload/ref'
import type { Undoable } from '@/lib/undo/undo'

import { parseRef } from '../ref'

/**
 * Add to library on the Not in library Answer (FR-21) and Add another copy on
 * the In library Answer (FR-20): an owned copy of the ISBN's Book at the
 * default location. The input comes from the client, so anything but
 * `{ requestId, isbn13 }` strings, with an optional `pick` that is a
 * non-negative integer (the edition picked, D-7) and an optional `candidate`
 * of non-empty `source` and `recordId` strings (its identity, AD-11), is
 * `VALIDATION` before `saveCopy()` sees it. `NOT_FOUND` comes back as it is
 * (R5): no source knows the ISBN any more, the candidate shown has gone, or
 * the held Book is gone, and the client refreshes the Answer, which then
 * shows what the server holds now. When no source knows the ISBN, trying
 * again would fail the same way while the `none` stays cached. `RATE_LIMITED`
 * also comes back as it is (AD-9): the save had to ask the sources and the
 * user is at the lookup limit, so the toast names the cause. Every other
 * failure but a signed-out session reads as `SAVE_FAILED`: to the person
 * scanning they all mean "try again". The
 * `runAction()` log line for an unexpected error still happens; any other
 * failure, `NOT_FOUND` and `RATE_LIMITED` included, is logged here as a
 * warning, so the code leaves a trace.
 */
export async function saveCopyAction(input: unknown): Promise<ActionResult<Undoable<SaveResult>>> {
  const result = await runAction(async () => {
    const ctx = await requireUserOrThrow()
    if (!isSaveInput(input)) throw new DomainError('VALIDATION')
    const { requestId } = input
    return saveCopy(ctx, { requestId, target: isbnTarget(input), save: { kind: 'copy' } })
  })
  if (result.ok || result.code === 'UNAUTHENTICATED') return result
  if (result.code !== 'INTERNAL') logger().warn({ code: result.code }, 'saveCopyAction failed')
  return result.code === 'NOT_FOUND' || result.code === 'RATE_LIMITED'
    ? result
    : { ok: false, code: 'SAVE_FAILED' }
}

type IsbnInput = { isbn13: string; pick?: number; candidate?: CandidateId }

function isSaveInput(input: unknown): input is { requestId: string } & IsbnInput {
  if (typeof input !== 'object' || input === null) return false
  return typeof (input as Record<string, unknown>).requestId === 'string' && isIsbnInput(input)
}

/** `{ isbn13 }` with an optional `pick` (a non-negative integer) and `candidate` (`isCandidateId()`). */
function isIsbnInput(input: unknown): input is IsbnInput {
  if (typeof input !== 'object' || input === null) return false
  const { isbn13, pick, candidate } = input as Record<string, unknown>
  return (
    typeof isbn13 === 'string' &&
    (pick === undefined || (typeof pick === 'number' && Number.isInteger(pick) && pick >= 0)) &&
    (candidate === undefined || isCandidateId(candidate))
  )
}

/** The ISBN target as checked, rebuilt so nothing else from the client goes along. */
function isbnTarget({ isbn13, pick, candidate }: IsbnInput): SaveTarget {
  return {
    isbn13,
    ...(pick !== undefined && { pick }),
    ...(candidate !== undefined && {
      candidate: { source: candidate.source, recordId: candidate.recordId },
    }),
  }
}

/**
 * Add to library on the Not found Answer (FR-12, FR-22): an owned copy of a
 * Book typed by hand, with the ISBN when there is one, at the default
 * location. The text goes as typed; `saveCopy()` checks it. Anything but
 * `{ requestId, title, author }` strings with an optional `isbn13` string is
 * `VALIDATION`. A `VALIDATION` naming `title` or `authors` comes back with
 * only those fields, for the messages under them; every other failure but a
 * signed-out session reads as `SAVE_FAILED` and is logged as in
 * `saveCopyAction`: nothing on screen could be marked.
 */
export async function saveManualAction(
  input: unknown,
): Promise<ActionResult<Undoable<SaveResult>>> {
  const result = await runAction(async () => {
    const ctx = await requireUserOrThrow()
    if (!isManualInput(input)) throw new DomainError('VALIDATION')
    const { requestId, isbn13, title, author } = input
    return saveCopy(ctx, {
      requestId,
      target: { manual: { isbn: isbn13, title, authors: [author] } },
      save: { kind: 'copy' },
    })
  })
  if (result.ok || result.code === 'UNAUTHENTICATED') return result
  const marked = manualFields(result)
  if (marked) return marked
  if (result.code !== 'INTERNAL') logger().warn({ code: result.code }, 'saveManualAction failed')
  return { ok: false, code: 'SAVE_FAILED' }
}

type ManualInput = { title: string; author: string; isbn13?: string }

function isManualInput(input: unknown): input is { requestId: string } & ManualInput {
  if (typeof input !== 'object' || input === null) return false
  return typeof (input as Record<string, unknown>).requestId === 'string' && isManualFields(input)
}

/** `{ title, author }` strings with an optional `isbn13` string. */
function isManualFields(input: unknown): input is ManualInput {
  if (typeof input !== 'object' || input === null) return false
  const { title, author, isbn13 } = input as Record<string, unknown>
  return (
    typeof title === 'string' &&
    typeof author === 'string' &&
    (isbn13 === undefined || typeof isbn13 === 'string')
  )
}

/** A `VALIDATION` naming `title` or `authors`, with only those fields; else `undefined`. */
function manualFields(
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

/**
 * Add to wishlist on the Not in library and Not found Answers and in Book
 * detail (FR-21, FR-22, UX-DR46): the Book on the user's wishlist `wishlist`
 * as an open entry for the user (`saveEntry()`). The input comes from the
 * client, so anything but `{ requestId, wishlist, target }` with a string
 * `requestId`, a `Ref` `wishlist` (`parseRef()`) and a `target` that is the
 * ISBN's (`{ isbn13 }` with `pick` and `candidate` checked as in
 * `saveCopyAction`), the Not found form's (`{ manual: { title, author } }`
 * strings with an optional `isbn13` string) or a held Book's (`{ bookId }`, a
 * row id) is `VALIDATION` before `saveEntry()` sees it. The typed text goes
 * as `saveManualAction` sends it. A `{ create }` name is matched to the
 * user's list of that name, or makes one, inside the save's transaction
 * (`resolveWishlist`). `NOT_FOUND` and `RATE_LIMITED` come back as they are,
 * as in `saveCopyAction`; a `VALIDATION` naming `title` or `authors` comes
 * back with only those fields, as in `saveManualAction`. Every other failure
 * but a signed-out session reads as `SAVE_FAILED` (a list gone meanwhile
 * included) and is logged as in `saveCopyAction`.
 */
export async function saveEntryAction(
  input: unknown,
): Promise<ActionResult<Undoable<EntrySaveResult>>> {
  const result = await runAction(async () => {
    const ctx = await requireUserOrThrow()
    const parsed = parseEntryInput(input)
    if (!parsed) throw new DomainError('VALIDATION')
    const { requestId, target, wishlist } = parsed
    return saveEntry(ctx, { requestId, target, save: { kind: 'entry', wishlist } })
  })
  if (result.ok || result.code === 'UNAUTHENTICATED') return result
  const marked = manualFields(result)
  if (marked) return marked
  if (result.code !== 'INTERNAL') logger().warn({ code: result.code }, 'saveEntryAction failed')
  return result.code === 'NOT_FOUND' || result.code === 'RATE_LIMITED'
    ? result
    : { ok: false, code: 'SAVE_FAILED' }
}

function parseEntryInput(
  input: unknown,
): { requestId: string; target: SaveTarget; wishlist: Ref } | undefined {
  if (typeof input !== 'object' || input === null) return undefined
  const { requestId, wishlist: sent, target } = input as Record<string, unknown>
  const wishlist = parseRef(sent)
  if (typeof requestId !== 'string' || wishlist === undefined) return undefined
  const parsed = parseEntryTarget(target)
  return parsed && { requestId, target: parsed, wishlist }
}

/** One of `EntryTarget`'s kinds (`./entryTarget`), by its one key, as the save takes it. */
function parseEntryTarget(target: unknown): SaveTarget | undefined {
  if (typeof target !== 'object' || target === null) return undefined
  const kinds = (['isbn13', 'manual', 'bookId'] as const).filter((key) => key in target)
  if (kinds.length !== 1) return undefined
  const value = target as Partial<Record<'isbn13' | 'manual' | 'bookId', unknown>>
  if (kinds[0] === 'bookId') return isRowId(value.bookId) ? { bookId: value.bookId } : undefined
  if (kinds[0] === 'manual') {
    if (!isManualFields(value.manual)) return undefined
    const { isbn13, title, author } = value.manual
    return { manual: { isbn: isbn13, title, authors: [author] } }
  }
  return isIsbnInput(target) ? isbnTarget(target) : undefined
}
