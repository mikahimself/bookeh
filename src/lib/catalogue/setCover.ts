import { canEditShared } from '@/access/roles'
import { requireOwnBook } from '@/lib/books/requireOwnBook'
import { DomainError } from '@/lib/errors'
import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import { assertLive, onRollback, withTransaction } from '@/lib/payload/transaction'

import { attachCover, deleteMediaRow, discardCover, writeMediaFile } from './covers'
import { isUnreferenced } from './isUnreferenced'
import { system } from './system'
import { type Corners, warpCover } from './warpCover'

/** The largest upload accepted, before any decoding. */
export const MAX_COVER_UPLOAD_BYTES = 5 * 1024 * 1024

const idOf = (value: number | { id: number } | null | undefined): number | null =>
  value == null ? null : typeof value === 'number' ? value : value.id

/**
 * The cover gate, in the caller's transaction: `requireOwnBook()`, then the
 * admin (`canEditShared`) for a shared Book and the creator for a private
 * one; anyone else fails with `NOT_FOUND`. Returns the Book's visibility and
 * current cover.
 */
async function coverGate(
  tx: Context,
  bookId: number,
): Promise<{ visibility: 'shared' | 'private'; cover: number | null }> {
  await requireOwnBook(tx, bookId)
  const book = await gateway.findByID(tx, {
    collection: 'books',
    id: bookId,
    select: { visibility: true, createdBy: true, cover: true },
    depth: 0,
  })
  const allowed =
    book.visibility === 'shared' ? canEditShared(tx.user) : idOf(book.createdBy) === tx.user.id
  if (!allowed) throw new DomainError('NOT_FOUND')
  return { visibility: book.visibility, cover: idOf(book.cover) }
}

async function setBookCover(tx: Context, bookId: number, cover: number | null): Promise<void> {
  assertLive(tx)
  await tx.req.payload.update({ collection: 'books', id: bookId, data: { cover }, ...system(tx) })
}

/** Deletes a replaced or removed cover's row when nothing references it; the file is the sweep's. */
async function dropCover(tx: Context, id: number): Promise<void> {
  if (await isUnreferenced(tx, 'media', id)) await deleteMediaRow(tx, id)
}

/**
 * Spine, AD-14: the only cover upload path. Before any Book read, `file`
 * must be at most `MAX_COVER_UPLOAD_BYTES` (`IMAGE_TOO_LARGE`), a JPEG, PNG
 * or WebP by its bytes (`NOT_AN_IMAGE`), and `corners` a convex clockwise
 * quad inside it (`INVALID_CORNERS`); `warpCover()` makes the 2:3 JPEG. Then,
 * in one transaction: `coverGate()`, the file written (`COVER_FAILED`,
 * logged, when that fails) and discarded if the transaction rolls back, a
 * `media` row with the Book's visibility, `books.cover` set, and the
 * replaced row deleted when `isUnreferenced()`. Not undoable.
 */
export async function setCover(
  ctx: Context,
  bookId: number,
  file: Blob,
  corners: Corners,
): Promise<void> {
  if (file.size > MAX_COVER_UPLOAD_BYTES) throw new DomainError('IMAGE_TOO_LARGE')
  const warped = await warpCover(Buffer.from(await file.arrayBuffer()), corners)

  await withTransaction(ctx, async (tx) => {
    const { visibility, cover: replaced } = await coverGate(tx, bookId)
    const { payload } = tx.req

    let filename: string
    try {
      filename = await writeMediaFile(payload, warped.bytes, 'jpg')
    } catch (err) {
      payload.logger.error({ err, bookId }, 'Cover upload failed: write failed')
      throw new DomainError('COVER_FAILED')
    }
    onRollback(tx, () => discardCover(payload, { filename }))

    const { bytes, width, height } = warped
    const id = await attachCover(
      tx,
      { filename, mimeType: 'image/jpeg', filesize: bytes.length, width, height },
      visibility,
    )
    await setBookCover(tx, bookId, id)
    if (replaced !== null) await dropCover(tx, replaced)
  })
}

/**
 * Spine, AD-14: clears a Book's cover, behind the same gate as `setCover()`,
 * and deletes the row when `isUnreferenced()`. A Book without a cover is a
 * no-op. Not undoable.
 */
export async function removeCover(ctx: Context, bookId: number): Promise<void> {
  await withTransaction(ctx, async (tx) => {
    const { cover } = await coverGate(tx, bookId)
    if (cover === null) return
    await setBookCover(tx, bookId, null)
    await dropCover(tx, cover)
  })
}
