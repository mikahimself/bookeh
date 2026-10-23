import { logger } from '@/lib/errors'
import { requireUser } from '@/lib/payload/context'
import { getShelfRows } from '@/lib/shelf/getShelfRows'
import { parseShelfQuery, SHELF_PAGE_SIZE, type ShelfRows } from '@/lib/shelf/query'

import { devicePrefs } from '../prefs'

import { CollectionDisplayProvider } from './CollectionDisplay'
import { CollectionList } from './CollectionList'
import { CollectionTools } from './CollectionTools'
import { LoadFailed } from './LoadFailed'
import { ShelfRowsProvider } from './ShelfRows'

/**
 * The collection (EXPERIENCE.md, Collection controls and States): the tools
 * row, then the client list seeded with the first page of the viewer's
 * copies (AD-7). A failed read shows Load failed. Layout and size come from
 * the device preferences cookie, so the first render already shows them; the
 * switches work even when the list failed.
 */
export default async function CollectionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireUser()
  const { query } = parseShelfQuery(await searchParams)
  const { layout, size } = await devicePrefs()

  let shelf: ShelfRows | null = null
  try {
    shelf = await getShelfRows(ctx, query, { offset: 0, limit: SHELF_PAGE_SIZE })
  } catch (err) {
    logger().error({ err }, 'The collection failed to load')
  }

  return (
    <div className="px-page-margin-phone wide:px-page-margin">
      <CollectionDisplayProvider initial={{ layout, size }}>
        <CollectionTools />
        {shelf ? (
          <ShelfRowsProvider query={query} initial={shelf}>
            <CollectionList query={query} />
          </ShelfRowsProvider>
        ) : (
          <LoadFailed />
        )}
      </CollectionDisplayProvider>
    </div>
  )
}
