'use server'

import { saveCopy, type SaveResult } from '@/lib/catalogue/saveCopy'
import { DomainError, logger, runAction, type ActionResult } from '@/lib/errors'
import { requireUserOrThrow } from '@/lib/payload/context'
import type { Undoable } from '@/lib/undo/undo'

/**
 * Add to library on the Not in library Answer (FR-21) and Add another copy on
 * the In library Answer (FR-20): an owned copy of the ISBN's Book at the
 * default location. The input comes from the client, so anything but
 * `{ requestId, isbn13 }` strings is `VALIDATION` before `saveCopy()` sees
 * it. Every failure but a signed-out session reads as `SAVE_FAILED`: to the
 * person scanning they all mean "try again". The `runAction()` log line for
 * an unexpected error still happens; any other code is logged here as a
 * warning, so the folded code leaves a trace.
 */
export async function saveCopyAction(input: unknown): Promise<ActionResult<Undoable<SaveResult>>> {
  const result = await runAction(async () => {
    const ctx = await requireUserOrThrow()
    if (!isSaveInput(input)) throw new DomainError('VALIDATION')
    const { requestId, isbn13 } = input
    return saveCopy(ctx, { requestId, target: { isbn13 }, save: { kind: 'copy' } })
  })
  if (result.ok || result.code === 'UNAUTHENTICATED') return result
  if (result.code !== 'INTERNAL') logger().warn({ code: result.code }, 'saveCopyAction failed')
  return { ok: false, code: 'SAVE_FAILED' }
}

function isSaveInput(input: unknown): input is { requestId: string; isbn13: string } {
  if (typeof input !== 'object' || input === null) return false
  const { requestId, isbn13 } = input as Record<string, unknown>
  return typeof requestId === 'string' && typeof isbn13 === 'string'
}
