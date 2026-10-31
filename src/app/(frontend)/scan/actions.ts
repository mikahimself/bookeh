'use server'

import { retryLookup } from '@/lib/catalogue/lookupBook'
import { saveCopy, type SaveResult } from '@/lib/catalogue/saveCopy'
import { DomainError, logger, runAction, type ActionResult } from '@/lib/errors'
import type { SourceId } from '@/lib/metadata/source'
import { requireUserOrThrow } from '@/lib/payload/context'
import type { Undoable } from '@/lib/undo/undo'

import {
  isIsbnInput,
  isManualFields,
  isbnTarget,
  manualFields,
  type IsbnInput,
  type ManualInput,
} from '../saveInput'

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

/**
 * Try {sources} again on the Not in library Answer: asks the sources past the
 * held outcome (`retryLookup()`), and the client renders the Answer again;
 * `data` names the sources that still failed.
 * Anything but an `{ isbn13 }` string is `VALIDATION`. A failure comes back as
 * it is, `RATE_LIMITED` included, for its toast; the Answer stays. Logged as
 * in `saveCopyAction`.
 */
export async function retryLookupAction(input: unknown): Promise<ActionResult<SourceId[]>> {
  const result = await runAction(async () => {
    const ctx = await requireUserOrThrow()
    if (!isIsbnInput(input)) throw new DomainError('VALIDATION')
    return retryLookup(ctx, input.isbn13)
  })
  if (!result.ok && result.code !== 'UNAUTHENTICATED' && result.code !== 'INTERNAL') {
    logger().warn({ code: result.code }, 'retryLookupAction failed')
  }
  return result
}

function isSaveInput(input: unknown): input is { requestId: string } & IsbnInput {
  if (typeof input !== 'object' || input === null) return false
  return typeof (input as Record<string, unknown>).requestId === 'string' && isIsbnInput(input)
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

function isManualInput(input: unknown): input is { requestId: string } & ManualInput {
  if (typeof input !== 'object' || input === null) return false
  return typeof (input as Record<string, unknown>).requestId === 'string' && isManualFields(input)
}
