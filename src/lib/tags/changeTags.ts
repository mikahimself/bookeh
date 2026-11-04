import { toNameKey } from '@/fields/nameKey'
import { booksOfCopies } from '@/lib/books/booksOfCopies'
import { requireOwnBook } from '@/lib/books/requireOwnBook'
import { upsertUserBook } from '@/lib/books/upsertUserBook'
import { DomainError } from '@/lib/errors'
import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import { normalisedName } from '@/lib/payload/ownedName'
import { idOf, isRowId, type Ref } from '@/lib/payload/ref'
import { withTransaction } from '@/lib/payload/transaction'
import type { Undone } from '@/lib/undo/undo'
import type { Tag } from '@/payload-types'

import { systemNameValidator } from './systemName'

export type TagTarget = { copyIds: readonly number[] } | { bookId: number }
type Changes = { add: readonly Ref[]; remove: readonly number[]; kind: Tag['kind'] }
type Changed = { bookId: number; previous: number[] }

const invalid = (field: string): never => {
  throw new DomainError('VALIDATION', { fields: { [field]: 'VALIDATION' } })
}

/** Private Book assignments; joins the caller's transaction and records no Undo token. */
export async function changeTags(
  ctx: Context,
  target: TagTarget,
  changes: Changes,
): Promise<Undone<{ count: number }>> {
  return withTransaction(ctx, async (tx) => {
    const bookIds =
      'copyIds' in target
        ? await booksOfCopies(tx, target.copyIds)
        : (await requireOwnBook(tx, target.bookId), [target.bookId])
    const { kind, add, remove } = changes
    if (!['tag', 'genre', 'theme'].includes(kind)) invalid('kind')
    const field = 'tags'
    const checkIds = async (ids: readonly number[]) => {
      const unique = [...new Set(ids)]
      if (!unique.every(isRowId)) invalid(field)
      if (unique.length === 0) return
      const { totalDocs } = await gateway.count(tx, {
        collection: 'tags',
        where: {
          and: [
            { id: { in: unique } },
            { owner: { equals: tx.user.id } },
            { kind: { equals: kind } },
          ],
        },
      })
      if (totalDocs !== unique.length) invalid(field)
    }
    await checkIds(remove)
    const additions: number[] = []
    const checkSystemName = systemNameValidator(tx, kind, field)
    for (const ref of add) {
      if (typeof ref === 'number') {
        await checkIds([ref])
        additions.push(ref)
        continue
      }
      if (!ref || typeof ref.create !== 'string') invalid(field)
      const name = normalisedName(ref.create, field)
      const key = toNameKey(name)
      const { docs } = await gateway.find(tx, {
        collection: 'tags',
        where: {
          and: [
            { owner: { equals: tx.user.id } },
            { kind: { equals: kind } },
            { nameKey: { equals: key } },
          ],
        },
        depth: 0,
        limit: 1,
      })
      if (docs[0]) {
        additions.push(docs[0].id)
        continue
      }
      await checkSystemName(name)
      const created = await gateway.create(tx, {
        collection: 'tags',
        data: { owner: tx.user.id, kind, name, nameKey: '' },
        depth: 0,
      })
      additions.push(created.id)
    }
    const { docs } = await gateway.find(tx, {
      collection: 'user-books',
      where: { book: { in: bookIds } },
      select: { book: true, tags: true },
      depth: 0,
      pagination: false,
    })
    const removing = new Set(remove)
    const changed: Changed[] = []
    for (const bookId of bookIds) {
      const previous =
        docs.find((row) => idOf(row.book) === bookId)?.tags?.map((tag) => idOf(tag)) ?? []
      const next = [...new Set([...previous.filter((id) => !removing.has(id)), ...additions])]
      if (next.length === previous.length && next.every((id) => previous.includes(id))) continue
      await upsertUserBook(tx, bookId, { tags: next })
      changed.push({ bookId, previous })
    }
    return { data: { count: bookIds.length }, restore: (rtx) => restoreTags(rtx, changed) }
  })
}

async function restoreTags(ctx: Context, changed: Changed[]): Promise<void> {
  for (const { bookId, previous } of changed) {
    const { totalDocs } = await gateway.count(ctx, {
      collection: 'user-books',
      where: { book: { equals: bookId } },
    })
    if (totalDocs === 0) continue
    const { docs } = await gateway.find(ctx, {
      collection: 'tags',
      where: { id: { in: previous } },
      depth: 0,
      pagination: false,
    })
    const surviving = new Set(docs.map((tag) => tag.id))
    await upsertUserBook(ctx, bookId, { tags: previous.filter((id) => surviving.has(id)) })
  }
}
