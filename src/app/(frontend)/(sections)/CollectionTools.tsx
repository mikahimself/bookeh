'use client'

import { useTranslations } from 'next-intl'

import { ActionLink } from '../components/Link'
import { TextSwitch } from '../components/TextSwitch'

import { SearchField } from './SearchField'

const ignore = () => {}

/**
 * The collection's tools row (EXPERIENCE.md, Collection controls): search,
 * Filter and Select, then the layout and size switches, on a second line on
 * the phone. Filter, Select and the switches stay disabled until their
 * stories wire them; the switches show rows at m.
 */
export function CollectionTools() {
  const t = useTranslations('collection')

  return (
    <div className="flex flex-col gap-2 pt-4 wide:flex-row wide:items-baseline wide:gap-6">
      <div className="flex min-w-0 flex-1 items-baseline gap-4 wide:gap-6">
        <div className="min-w-0 flex-1">
          <SearchField />
        </div>
        <ActionLink disabled>{t('filter')}</ActionLink>
        <ActionLink disabled>{t('select')}</ActionLink>
      </div>
      <div className="flex justify-between gap-6">
        <TextSwitch
          label={t('layout')}
          value="rows"
          options={[
            { value: 'rows', label: t('layouts.rows') },
            { value: 'covers', label: t('layouts.covers') },
          ]}
          onChange={ignore}
          disabled
        />
        <TextSwitch
          label={t('size')}
          value="m"
          options={[
            { value: 's', label: t('sizes.s') },
            { value: 'm', label: t('sizes.m') },
            { value: 'l', label: t('sizes.l') },
          ]}
          onChange={ignore}
          disabled
        />
      </div>
    </div>
  )
}
