'use server'

import { removeCopies } from '@/lib/copies/removeCopies'
import { DomainError, runAction, type ActionResult } from '@/lib/errors'
import { requireUserOrThrow } from '@/lib/payload/context'

// The collection's select-mode actions (AD-18). Client input is checked here,
// never repaired: anything but an array of positive safe integers is
// `VALIDATION` with no write. Ownership is the service's. The client reports
// the result through `afterAction`.

const ids = (value: unknown): number[] => {
  if (
    !Array.isArray(value) ||
    !value.every((id) => typeof id === 'number' && Number.isSafeInteger(id) && id > 0)
  ) {
    throw new DomainError('VALIDATION')
  }
  return value as number[]
}

/** Removes the viewer's copies, all or none: one not theirs fails `NOT_FOUND`. No Undo. */
export async function removeCopiesAction(copyIds: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await requireUserOrThrow()
    await removeCopies(ctx, ids(copyIds))
    return null
  })
}
