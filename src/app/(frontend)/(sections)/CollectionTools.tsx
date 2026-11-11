'use client'

import { useTranslations } from 'next-intl'

import { AppBarButton, AppBarItems } from '../components/AppBar'
import { ActionLink } from '../components/Link'

import { useFilterPanel } from './FilterPanel'
import { SearchField } from './SearchField'
import { useSelection } from './Selection'

/**
 * The collection's search and Filter/Select actions: Links on wide screens,
 * App bar buttons on the phone. Display controls follow the live count in
 * `CollectionList`, or remain available beside the failed-read message.
 */
export function CollectionTools() {
  const t = useTranslations('collection')
  const filter = useFilterPanel()
  const { selecting, start } = useSelection()

  return (
    <div className="flex flex-col gap-2 pt-4 wide:flex-row wide:items-baseline wide:gap-6">
      <div className="flex min-w-0 flex-1 items-baseline gap-4 wide:gap-6">
        <div className="min-w-0 flex-1">
          <SearchField />
        </div>
        {/* Wide draws Filter and Select here, the phone in the App bar; each once. */}
        <span className="contents max-wide:hidden">
          <ActionLink aria-expanded={filter.open} onClick={filter.toggle}>
            {t('filter')}
          </ActionLink>
          {!selecting && <ActionLink onClick={start}>{t('select')}</ActionLink>}
        </span>
        <AppBarItems>
          <AppBarButton icon="filter" aria-expanded={filter.open} onClick={filter.toggle}>
            {t('filter')}
          </AppBarButton>
          {!selecting && (
            <AppBarButton icon="select" onClick={start}>
              {t('select')}
            </AppBarButton>
          )}
        </AppBarItems>
      </div>
    </div>
  )
}
