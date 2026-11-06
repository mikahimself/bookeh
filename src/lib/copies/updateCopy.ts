import { maxPrice } from '@/fields/limits'
import { helsinkiToday, isCalendarDate, noonUtc } from '@/fields/readingDates'
import { DomainError } from '@/lib/errors'
import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import { openLoan } from '@/lib/payload/openRows'
import { isRowId } from '@/lib/payload/ref'
import { withTransaction } from '@/lib/payload/transaction'

import { type CopyStatus, locationFor } from './locations'

/**
 * Spine, AD-8 and AD-18: sets the status of one of the viewer's copies, in the
 * caller's transaction or one of its own (AD-16). Ordered clears the
 * location; owned takes the given location (`Ref` or `null`) or, without one,
 * the default, as `createCopy()` does. Owned with no location always means
 * the default, so the caller sends a status only when it changes. A copy that
 * is not the viewer's fails with `NOT_FOUND` before any write. An ordered
 * copy is never lent: ordered on a copy with an open loan fails with
 * `VALIDATION` on `status` and writes nothing; a returned loan is history
 * and does not refuse. No Undo (AD-20).
 */
export async function setStatus(ctx: Context, copyId: number, change: CopyStatus): Promise<void> {
  await withTransaction(ctx, async (tx) => {
    await requireOwnCopy(tx, copyId)
    if (change.status === 'ordered') {
      const open = await gateway.count(tx, {
        collection: 'loans',
        where: {
          and: [{ copy: { equals: copyId } }, { owner: { equals: tx.user.id } }, openLoan],
        },
      })
      if (open.totalDocs > 0) {
        throw new DomainError('VALIDATION', { fields: { status: 'VALIDATION' } })
      }
    }
    const location = await locationFor(tx, change)
    await gateway.updateByID(tx, {
      collection: 'copies',
      id: copyId,
      data: { status: change.status, location },
      depth: 0,
    })
  })
}

/**
 * Spine, AD-18: sets the note of one of the viewer's copies, in the caller's
 * transaction or one of its own (AD-16). The note is trimmed and
 * NFC-normalised; an empty one is stored as `null`. A note over the
 * collection's limit is its `ValidationError` on `notes`. A copy that is not
 * the viewer's fails with `NOT_FOUND` before any write. No Undo (AD-20).
 */
export async function setNote(ctx: Context, copyId: number, note: string): Promise<void> {
  const text = note.trim().normalize('NFC')
  await withTransaction(ctx, async (tx) => {
    await requireOwnCopy(tx, copyId)
    await gateway.updateByID(tx, {
      collection: 'copies',
      id: copyId,
      data: { notes: text === '' ? null : text },
      depth: 0,
    })
  })
}

/**
 * Spine, AD-8 and AD-18, FR-55: sets the purchase of one of the viewer's
 * copies, its acquired date and its price in whole euro cents, `null`
 * clearing the price; only the given keys are written, in the caller's
 * transaction or one of its own (AD-16). A copy that is not the viewer's
 * (the admin included, FR-48) fails with `NOT_FOUND`; a date that is not a
 * real `YYYY-MM-DD` day or is after today in `Europe/Helsinki`, or a price
 * that is not an integer from 0 to `maxPrice`, fails with `VALIDATION` on
 * that field. Both before any write. No Undo (AD-20).
 */
export async function setCopyPurchase(
  ctx: Context,
  copyId: number,
  purchase: { acquiredAt?: string; price?: number | null },
): Promise<void> {
  const { acquiredAt, price } = purchase
  const fields: Record<string, 'VALIDATION'> = {}
  if (acquiredAt !== undefined && (!isCalendarDate(acquiredAt) || acquiredAt > helsinkiToday())) {
    fields.acquiredAt = 'VALIDATION'
  }
  if (
    price !== undefined &&
    price !== null &&
    (!Number.isInteger(price) || price < 0 || price > maxPrice)
  ) {
    fields.price = 'VALIDATION'
  }
  await withTransaction(ctx, async (tx) => {
    await requireOwnCopy(tx, copyId)
    if (Object.keys(fields).length > 0) throw new DomainError('VALIDATION', { fields })
    await gateway.updateByID(tx, {
      collection: 'copies',
      id: copyId,
      data: {
        ...(acquiredAt !== undefined && { acquiredAt: noonUtc(acquiredAt) }),
        ...(price !== undefined && { price }),
      },
      depth: 0,
    })
  })
}

// `count` first: a failed `updateByID` (`NotFound`) would end the transaction.
// The count filters on `owner` explicitly as well as through `ownerAccess` (FR-48).
// A bad id (`isRowId()`) fails with no read.
async function requireOwnCopy(ctx: Context, copyId: number): Promise<void> {
  if (!isRowId(copyId)) throw new DomainError('NOT_FOUND')
  const { totalDocs } = await gateway.count(ctx, {
    collection: 'copies',
    where: { and: [{ id: { equals: copyId } }, { owner: { equals: ctx.user.id } }] },
  })
  if (totalDocs === 0) throw new DomainError('NOT_FOUND')
}
