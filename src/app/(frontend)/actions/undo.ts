'use server'

import { DomainError, runAction, type ActionResult } from '@/lib/errors'
import { requireUserOrThrow } from '@/lib/payload/context'
import { undo } from '@/lib/undo/undo'

/**
 * AD-20: the one entry point behind `undo()`. Lives in `actions/` because
 * the toast provider, which serves every page, is its caller. The token
 * comes from the client, so anything but a string is `VALIDATION` before
 * `undo()` sees it; an unknown, spent, expired or foreign token is
 * `UNDO_FAILED` from `undo()` itself.
 */
export async function undoAction(token: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await requireUserOrThrow()
    if (typeof token !== 'string') throw new DomainError('VALIDATION')
    await undo(ctx, token)
    return null
  })
}
