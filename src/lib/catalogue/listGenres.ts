import type { Named } from '@/lib/books/effectiveBook'
import { genreName } from '@/lib/books/genreName'
import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'

/**
 * The system genres, the options of Edit book's genre field: read through
 * the gateway with the viewer's access, named with `genreName()` in the
 * viewer's language and sorted in that language's order.
 */
export async function listGenres(ctx: Context): Promise<Named[]> {
  const { docs } = await gateway.find(ctx, {
    collection: 'genres',
    select: { name: true, nameFi: true },
    pagination: false,
    depth: 0,
  })
  const { language } = ctx.user
  const collator = new Intl.Collator(language)
  return docs
    .map((genre) => ({ id: genre.id, name: genreName(genre, language) }))
    .sort((a, b) => collator.compare(a.name, b.name))
}
