'use client'

import { useTranslations } from 'next-intl'

import { Button } from '../components/Button'

import { useSelection } from './Selection'

/**
 * DESIGN.md and EXPERIENCE.md, Action bar: in select mode, full width along
 * the bottom with a 2px `text` top edge, the count on the left and Done on
 * the right. Sticky at the bottom with the pinned Scan book's padding, which
 * it hides on the phone (styles.css); `data-pinned-wide` lifts the toast
 * above it on wide screens too. Bar actions come with their stories.
 */
export function SelectBar() {
  const t = useTranslations('collection')
  const { selecting, ticked, done } = useSelection()
  if (!selecting) return null

  return (
    <div
      data-action-bar
      data-pinned-bottom
      data-pinned-wide
      className="sticky bottom-0 -mx-page-margin-phone mt-auto flex items-center justify-between gap-4 border-t-2 border-text bg-background px-page-margin-phone pt-4 pb-[calc(var(--spacing-4)+env(safe-area-inset-bottom))] wide:-mx-page-margin wide:px-page-margin"
    >
      <p aria-live="polite" className="text-body text-text">
        {t('selected', { n: ticked.size })}
      </p>
      {/* Select unmounts on entering, so focus moves here rather than to the page. */}
      <Button variant="primary" onClick={done} autoFocus>
        {t('done')}
      </Button>
    </div>
  )
}
