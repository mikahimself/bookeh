import { toNameKey } from '@/fields/nameKey'
import { upsertUserBook } from '@/lib/books/upsertUserBook'
import { DomainError } from '@/lib/errors'
import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import { normalisedName } from '@/lib/payload/ownedName'
import { idOf, isRowId, type Named } from '@/lib/payload/ref'
import { withTransaction } from '@/lib/payload/transaction'
import { tagValues } from '@/lib/shelf/tagValues'
import type { Tag } from '@/payload-types'

import { systemNameValidator } from './systemName'

export type TagUse = Named & { copies: number }

async function ownTag(ctx: Context, id: number): Promise<Tag> {
  if (!isRowId(id)) throw new DomainError('NOT_FOUND')
  const { docs } = await gateway.find(ctx, {
    collection: 'tags',
    where: { and: [{ id: { equals: id } }, { owner: { equals: ctx.user.id } }] },
    depth: 0,
    limit: 1,
  })
  if (!docs[0]) throw new DomainError('NOT_FOUND')
  return docs[0]
}

/** Renames an own label, with conflicts scoped to its owner and kind. */
export async function renameTag(ctx: Context, id: number, name: string): Promise<void> {
  await withTransaction(ctx, async (tx) => {
    const tag = await ownTag(tx, id)
    const normalised = normalisedName(name, 'name')
    const { docs } = await gateway.find(tx, {
      collection: 'tags',
      where: {
        and: [
          { owner: { equals: tx.user.id } },
          { kind: { equals: tag.kind } },
          { nameKey: { equals: toNameKey(normalised) } },
          { id: { not_equals: id } },
        ],
      },
      depth: 0,
      limit: 1,
    })
    if (docs[0]) throw new DomainError('NAME_TAKEN', { conflictId: docs[0].id })
    if (toNameKey(normalised) !== tag.nameKey) {
      await systemNameValidator(tx, tag.kind, 'name')(normalised)
    }
    await gateway.updateByID(tx, { collection: 'tags', id, data: { name: normalised }, depth: 0 })
  })
}

/** Includes wishlist-only and no-longer-held Books; state changes use its sole writer. */
async function repoint(ctx: Context, source: number, target?: number): Promise<void> {
  const { docs } = await gateway.find(ctx, {
    collection: 'user-books',
    where: { and: [{ owner: { equals: ctx.user.id } }, { tags: { contains: source } }] },
    select: { book: true, tags: true },
    depth: 0,
    pagination: false,
  })
  for (const row of docs) {
    const tags = (row.tags ?? []).map((tag) => idOf(tag)).filter((id) => id !== source)
    if (target !== undefined) tags.push(target)
    await upsertUserBook(ctx, idOf(row.book), { tags: [...new Set(tags)] })
  }
}

export async function mergeTag(ctx: Context, sourceId: number, targetId: number): Promise<void> {
  await withTransaction(ctx, async (tx) => {
    const source = await ownTag(tx, sourceId)
    const target = await ownTag(tx, targetId)
    if (sourceId === targetId || source.kind !== target.kind) throw new DomainError('VALIDATION')
    await repoint(tx, sourceId, targetId)
    await gateway.deleteByID(tx, { collection: 'tags', id: sourceId, depth: 0 })
  })
}

export async function deleteTag(ctx: Context, id: number): Promise<void> {
  await withTransaction(ctx, async (tx) => {
    await ownTag(tx, id)
    await repoint(tx, id)
    await gateway.deleteByID(tx, { collection: 'tags', id, depth: 0 })
  })
}

/** Every own label of one kind, sorted by name, including unused labels. */
export async function tagUse(ctx: Context, kind: Tag['kind']): Promise<TagUse[]> {
  const { docs } = await gateway.find(ctx, {
    collection: 'tags',
    where: { and: [{ owner: { equals: ctx.user.id } }, { kind: { equals: kind } }] },
    sort: 'name',
    pagination: false,
    depth: 0,
    select: { name: true },
  })
  const counts = new Map((await tagValues(ctx, kind)).map(({ id, count }) => [id, count]))
  return docs.map(({ id, name }) => ({ id, name, copies: counts.get(id) ?? 0 }))
}
