import { requireUser } from '@/lib/payload/context'

/** Wishlists. Its content arrives with the wishlists epic. */
export default async function WishlistsPage() {
  await requireUser()
  return null
}
