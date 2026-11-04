import { DomainError } from '@/lib/errors'
import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import { idOf, isRowId } from '@/lib/payload/ref'

export async function booksOfCopies(tx: Context, copyIds: readonly number[]): Promise<number[]> {
  const ids = [...new Set(copyIds)]
  if (ids.length === 0 || !ids.every(isRowId)) {
    throw new DomainError('NOT_FOUND')
  }
  const { docs } = await gateway.find(tx, {
    collection: 'copies',
    where: { and: [{ id: { in: ids } }, { owner: { equals: tx.user.id } }] },
    select: { book: true },
    depth: 0,
    pagination: false,
  })
  if (docs.length < ids.length) throw new DomainError('NOT_FOUND')
  return [...new Set(docs.map((doc) => idOf(doc.book)))]
}
