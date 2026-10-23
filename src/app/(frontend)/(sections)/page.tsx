import { getLocale } from 'next-intl/server'

import { resolveLocale } from '@/i18n/locale'
import { logger } from '@/lib/errors'
import { requireUser } from '@/lib/payload/context'
import { filterValues } from '@/lib/shelf/filterValues'
import { getShelfRows } from '@/lib/shelf/getShelfRows'
import {
  parseShelfQuery,
  SHELF_PAGE_SIZE,
  type FilterValues,
  type ShelfRows,
} from '@/lib/shelf/query'

import { devicePrefs } from '../prefs'

import { BookDetail } from './BookDetail'
import { CollectionDisplayProvider } from './CollectionDisplay'
import { CollectionList } from './CollectionList'
import { CollectionTools } from './CollectionTools'
import { FilterPanel, FilterPanelProvider } from './FilterPanel'
import { LoadFailed } from './LoadFailed'
import { SelectBar } from './SelectBar'
import { SelectionProvider } from './Selection'
import { ShelfActionsProvider, ShelfRowsProvider } from './ShelfRows'

/**
 * The collection (EXPERIENCE.md, Collection controls and States): the tools
 * row, then the Filter panel beside the client list seeded with the first
 * page of the viewer's copies (AD-7). A failed shelf read shows Load failed;
 * a failed `filterValues()` read leaves the panel without lists. Layout and
 * size come from the device preferences cookie, so the first render already
 * shows them; the switches work even when the list failed. With `?book=`,
 * Book detail as well, whatever the shelf read gave: from 900px the row's
 * last column, filling the section's height so its edge runs to the bottom
 * of a short list; on the phone a sheet, portalled out. Select mode's state
 * sits above the list, so it outlives a query change; its action bar comes
 * last and, in a column filling the section, sits at the bottom of a short
 * list. `afterAction` sits above the list as well, so the bar reaches it.
 */
export default async function CollectionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireUser()
  const { query, book } = parseShelfQuery(await searchParams)
  const { layout, size } = await devicePrefs()

  const locale = resolveLocale(await getLocale(), null)

  const [shelf, values] = await Promise.all([
    getShelfRows(ctx, query, { offset: 0, limit: SHELF_PAGE_SIZE }).catch(
      (err: unknown): ShelfRows | null => {
        logger().error({ err }, 'The collection failed to load')
        return null
      },
    ),
    filterValues(ctx, locale).catch((err: unknown): FilterValues | null => {
      logger().error({ err }, 'The filter values failed to load')
      return null
    }),
  ])

  return (
    <div className="flex flex-1 flex-col px-page-margin-phone wide:px-page-margin">
      <CollectionDisplayProvider initial={{ layout, size }}>
        <FilterPanelProvider>
          <SelectionProvider>
            <ShelfActionsProvider>
              <CollectionTools />
              <div className="wide:flex wide:flex-1 wide:gap-6">
                <FilterPanel values={values} labels={shelf?.labels ?? {}} />
                <div className="min-w-0 flex-1">
                  {shelf ? (
                    <ShelfRowsProvider query={query} initial={shelf}>
                      <CollectionList query={query} book={book} />
                    </ShelfRowsProvider>
                  ) : (
                    <LoadFailed />
                  )}
                </div>
                {book !== null && <BookDetail ctx={ctx} bookId={book} query={query} />}
              </div>
              <SelectBar />
            </ShelfActionsProvider>
          </SelectionProvider>
        </FilterPanelProvider>
      </CollectionDisplayProvider>
    </div>
  )
}
