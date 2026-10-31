import { logger } from '@/lib/errors'
import type { Context } from '@/lib/payload/context'
import { listWishlists, type WishlistLine } from '@/lib/wishlists/wishlists'

/**
 * The viewer's wishlists for Add to wishlist's picker (`listWishlists()`). A
 * failed read is logged and reads as none: the picker then offers the "New
 * list" field alone, and a typed name still lands on the list of that name.
 */
export async function viewerWishlists(ctx: Context): Promise<WishlistLine[]> {
  return listWishlists(ctx).catch((err: unknown) => {
    logger().error({ err }, 'The wishlists failed to load')
    return []
  })
}
