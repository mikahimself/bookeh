'use client'

import { useTranslations } from 'next-intl'

import { ActionLink } from '../components/Link'
import { TextSwitch } from '../components/TextSwitch'

import { useCollectionDisplay } from './CollectionDisplay'
import { useFilterPanel } from './FilterPanel'
import { SearchField } from './SearchField'
import { useSelection } from './Selection'

/**
 * The collection's tools row (EXPERIENCE.md, Collection controls): search,
 * Filter and Select, then the layout and size switches, on a second line on
 * the phone. Filter opens and closes the Filter panel. Select enters select
 * mode and is not shown while it lasts (`useSelection`). The switches change the list at once and save on
 * this device (`CollectionDisplayProvider`). Their options are inline:
 * `prefs.ts` reads `next/headers`, which a client component cannot import.
 */
export function CollectionTools() {
  const t = useTranslations('collection')
  const { layout, size, setLayout, setSize } = useCollectionDisplay()
  const filter = useFilterPanel()
  const { selecting, start } = useSelection()

  return (
    <div className="flex flex-col gap-2 pt-4 wide:flex-row wide:items-baseline wide:gap-6">
      <div className="flex min-w-0 flex-1 items-baseline gap-4 wide:gap-6">
        <div className="min-w-0 flex-1">
          <SearchField />
        </div>
        <ActionLink aria-expanded={filter.open} onClick={filter.toggle}>
          {t('filter')}
        </ActionLink>
        {!selecting && <ActionLink onClick={start}>{t('select')}</ActionLink>}
      </div>
      <div className="flex justify-between gap-6">
        <TextSwitch
          label={t('layout')}
          value={layout}
          options={[
            { value: 'rows', label: t('layouts.rows') },
            { value: 'covers', label: t('layouts.covers') },
          ]}
          onChange={setLayout}
        />
        <TextSwitch
          label={t('size')}
          value={size}
          options={[
            { value: 's', label: t('sizes.s') },
            { value: 'm', label: t('sizes.m') },
            { value: 'l', label: t('sizes.l') },
          ]}
          onChange={setSize}
        />
      </div>
    </div>
  )
}
