import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'

/** Admin catalogue access also reads other creators' private Books; their lookup stays creator-only. */
export async function isPrivateBookCreator(ctx: Context, bookId: number): Promise<boolean> {
  const { totalDocs } = await gateway.count(ctx, {
    collection: 'books',
    where: {
      and: [
        { id: { equals: bookId } },
        { visibility: { equals: 'private' } },
        { createdBy: { equals: ctx.user.id } },
      ],
    },
  })
  return totalDocs > 0
}
