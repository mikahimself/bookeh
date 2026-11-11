'use client'

import { useTranslations } from 'next-intl'

import { TextSwitch } from '../components/TextSwitch'
import { ToggleGroup, ToggleGroupItem } from '../components/ui/ToggleGroup'

import { useCollectionDisplay } from './CollectionDisplay'

/** Device display preferences, following the count even when the shelf is empty. */
export function CollectionDisplayControls() {
  const t = useTranslations('collection')
  const { layout, size, setLayout, setSize } = useCollectionDisplay()

  return (
    <div className="flex shrink-0 items-center gap-4">
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
      <ToggleGroup
        aria-label={t('layout')}
        value={layout}
        onChange={setLayout}
        className="flex gap-1"
      >
        {(['rows', 'covers'] as const).map((value) => (
          <ToggleGroupItem
            key={value}
            value={value}
            aria-label={t(`layouts.${value}`)}
            className="group flex w-icon-switch items-center justify-center text-text max-wide:min-h-tap"
          >
            <span className="flex size-icon-switch items-center justify-center border-(length:--spacing-stroke-button) border-text group-data-pressed:border-accent-fill group-data-pressed:bg-accent-fill group-data-pressed:text-on-fill">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="size-6 fill-none stroke-current stroke-(length:--spacing-stroke-control)"
              >
                {value === 'rows' ? (
                  <path d="M3 5h4v4H3z M11 7h10 M3 15h4v4H3z M11 17h10" />
                ) : (
                  <path d="M3 4h7v16H3z M14 4h7v16h-7z" />
                )}
              </svg>
            </span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}
