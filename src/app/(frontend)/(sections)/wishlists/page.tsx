import { getTranslations } from 'next-intl/server'

import { logger } from '@/lib/errors'
import { requireUser } from '@/lib/payload/context'
import { listWishlists, type WishlistLine } from '@/lib/wishlists/wishlists'

import { ListRow } from '../../components/ListRow'
import { LoadFailed } from '../LoadFailed'

import { NewList } from './NewList'

/**
 * Wishlists (EXPERIENCE.md, Wishlists and States; FR-39): the viewer's lists
 * in name order, one List row each with its name as typed and its open
 * entries, the whole row a link to `/wishlists/{id}`; then "New list". With
 * none, "No wishlists" and "New list". A failed read, Load failed alone.
 */
export default async function WishlistsPage() {
  const ctx = await requireUser()
  const lists = await listWishlists(ctx).catch((err: unknown): WishlistLine[] | null => {
    logger().error({ err }, 'The wishlists failed to load')
    return null
  })
  const t = await getTranslations()

  return (
    <div className="flex flex-1 flex-col px-page-margin-phone wide:px-page-margin">
      {lists === null ? (
        <LoadFailed />
      ) : (
        <div className="flex flex-col items-start gap-2 py-4">
          {lists.length === 0 ? (
            <p className="pt-2 text-heading-group">{t('wishlists.empty')}</p>
          ) : (
            <ul className="self-stretch">
              {lists.map((list) => (
                <ListRow
                  key={list.id}
                  title={list.name}
                  meta={t('collection.count', { n: list.count })}
                  href={`/wishlists/${list.id}`}
                />
              ))}
            </ul>
          )}
          <NewList />
        </div>
      )}
    </div>
  )
}
