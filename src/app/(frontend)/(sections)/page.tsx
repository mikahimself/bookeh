import { requireUser } from '@/lib/payload/context'

/** The collection. Its content arrives in Epic 5. */
export default async function CollectionPage() {
  await requireUser()
  return null
}
