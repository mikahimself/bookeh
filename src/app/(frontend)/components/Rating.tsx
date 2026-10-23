'use client'

import { useTranslations } from 'next-intl'
import { useId } from 'react'

import { ActionLink } from './Link'

const STARS = [1, 2, 3, 4, 5] as const

/**
 * DESIGN.md, Rating: five 22px star outlines, none filled; the stars up to
 * `value` are stroked in `text`, the rest in `text-dim`. A tap on a star
 * rates that many; the current star does nothing. While a value is set, a
 * "Clear" Link in `meta` sits beside the stars. Each star is a tap on the
 * phone; on wide screens it is smaller so Clear fits beside them in the
 * Filter panel.
 */
export function Rating({
  value,
  onRate,
  onClear,
  'aria-labelledby': labelledBy,
}: {
  value: number | null
  onRate: (n: number) => void
  onClear: () => void
  'aria-labelledby': string
}) {
  const t = useTranslations('collection')
  const clearId = useId()
  return (
    <div role="group" aria-labelledby={labelledBy} className="flex items-center gap-2 text-meta">
      <div className="flex">
        {STARS.map((n) => (
          <button
            key={n}
            type="button"
            aria-label={t('stars', { n })}
            aria-pressed={n === value}
            onClick={() => {
              if (n !== value) onRate(n)
            }}
            className={`flex size-7 items-center max-wide:size-tap ${
              value !== null && n <= value ? 'text-text' : 'text-text-dim'
            }`}
          >
            <svg
              viewBox="0 0 22 22"
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
              className="size-star shrink-0"
            >
              <path d="M11 2 13.35 8.76 20.51 8.91 14.8 13.24 16.88 20.09 11 16 5.12 20.09 7.2 13.24 1.49 8.91 8.65 8.76Z" />
            </svg>
          </button>
        ))}
      </div>
      {value !== null && (
        <ActionLink id={clearId} aria-labelledby={`${clearId} ${labelledBy}`} onClick={onClear}>
          {t('clear')}
        </ActionLink>
      )}
    </div>
  )
}
