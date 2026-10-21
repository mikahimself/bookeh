'use server'

import { saveCopy, type SaveResult } from '@/lib/catalogue/saveCopy'
import { DomainError, logger, runAction, type ActionResult, type ErrorCode } from '@/lib/errors'
import { requireUserOrThrow } from '@/lib/payload/context'
import type { Undoable } from '@/lib/undo/undo'

/**
 * Add to library on the Not in library Answer (FR-21) and Add another copy on
 * the In library Answer (FR-20): an owned copy of the ISBN's Book at the
 * default location. The input comes from the client, so anything but
 * `{ requestId, isbn13 }` strings, with an optional `pick` that is a
 * non-negative integer (the edition picked, D-7), is `VALIDATION` before
 * `saveCopy()` sees it. `NOT_FOUND` comes back as it is (R5): no source knows
 * the ISBN any more, or the held Book is gone, and the client refreshes the
 * Answer, which then says so; trying again would fail the same way while the
 * `none` stays cached. Every other failure but a signed-out session reads as
 * `SAVE_FAILED`: to the person scanning they all mean "try again". The
 * `runAction()` log line for an unexpected error still happens; any other
 * failure, `NOT_FOUND` included, is logged here as a warning, so the code
 * leaves a trace.
 */
export async function saveCopyAction(input: unknown): Promise<ActionResult<Undoable<SaveResult>>> {
  const result = await runAction(async () => {
    const ctx = await requireUserOrThrow()
    if (!isSaveInput(input)) throw new DomainError('VALIDATION')
    const { requestId, isbn13, pick } = input
    return saveCopy(ctx, {
      requestId,
      target: { isbn13, ...(pick !== undefined && { pick }) },
      save: { kind: 'copy' },
    })
  })
  if (result.ok || result.code === 'UNAUTHENTICATED') return result
  if (result.code !== 'INTERNAL') logger().warn({ code: result.code }, 'saveCopyAction failed')
  return result.code === 'NOT_FOUND' ? result : { ok: false, code: 'SAVE_FAILED' }
}

function isSaveInput(
  input: unknown,
): input is { requestId: string; isbn13: string; pick?: number } {
  if (typeof input !== 'object' || input === null) return false
  const { requestId, isbn13, pick } = input as Record<string, unknown>
  return (
    typeof requestId === 'string' &&
    typeof isbn13 === 'string' &&
    (pick === undefined || (typeof pick === 'number' && Number.isInteger(pick) && pick >= 0))
  )
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
  if (result.code === 'VALIDATION' && result.fields) {
    const { title, authors } = result.fields
    const fields: Record<string, ErrorCode> = {
      ...(title === undefined ? {} : { title }),
      ...(authors === undefined ? {} : { authors }),
    }
    if (Object.keys(fields).length > 0) return { ok: false, code: 'VALIDATION', fields }
  }
  if (result.code !== 'INTERNAL') logger().warn({ code: result.code }, 'saveManualAction failed')
  return { ok: false, code: 'SAVE_FAILED' }
}

function isManualInput(
  input: unknown,
): input is { requestId: string; title: string; author: string; isbn13?: string } {
  if (typeof input !== 'object' || input === null) return false
  const { requestId, title, author, isbn13 } = input as Record<string, unknown>
  return (
    typeof requestId === 'string' &&
    typeof title === 'string' &&
    typeof author === 'string' &&
    (isbn13 === undefined || typeof isbn13 === 'string')
  )
}
