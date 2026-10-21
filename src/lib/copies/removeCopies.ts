import { DomainError } from '@/lib/errors'
import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import { withTransaction } from '@/lib/payload/transaction'

/**
 * Spine, AD-18: removes the viewer's copies by id, all or none, in the
 * caller's transaction or one of its own (AD-16). Repeated ids count once; an
 * empty list returns before any read. Unless every id is one of the viewer's
 * copies, it fails with `NOT_FOUND` before any delete; the count filters on
 * `owner` explicitly as well as through `ownerAccess` (FR-48). The Book stays,
 * even with no copy left. No Undo (AD-20). Epic 6 deletes the copies' loans
 * here as well.
 */
export async function removeCopies(ctx: Context, copyIds: readonly number[]): Promise<void> {
  const ids = [...new Set(copyIds)]
  if (ids.length === 0) return
  await withTransaction(ctx, async (tx) => {
    const { totalDocs } = await gateway.count(tx, {
      collection: 'copies',
      where: { and: [{ id: { in: ids } }, { owner: { equals: tx.user.id } }] },
    })
    if (totalDocs !== ids.length) throw new DomainError('NOT_FOUND')
    // One after the other: calls on one context never run concurrently (AD-16).
    for (const id of ids) {
      await gateway.deleteByID(tx, { collection: 'copies', id, depth: 0 })
    }
  })
}
