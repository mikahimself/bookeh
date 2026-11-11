'use client'

import { useTranslations } from 'next-intl'
import { useId } from 'react'

import { ActionLink, tapOutsideClass } from './Link'

const STARS = [1, 2, 3, 4, 5] as const

/**
 * DESIGN.md, Rating: five 22px star outlines, none filled; the stars up to
 * `value` are stroked in `text`, the rest in `text-dim`. A tap on a star
 * rates that many; the current star does nothing. While a value is set, a
 * "Clear" Link in `meta` sits beside the stars, or under them where the
 * column is too narrow. Each star is a tap on the phone; on wide screens it
 * is smaller so Clear fits beside them in the Filter panel. Book detail's
 * header draws them at 22px with the tap areas outside the layout
 * (`tapOutside`), so the five fit its column.
 */
export function Rating({
  value,
  onRate,
  onClear,
  'aria-labelledby': labelledBy,
  tapOutside = false,
}: {
  value: number | null
  onRate: (n: number) => void
  onClear: () => void
  'aria-labelledby': string
  /**
   * Stars drawn 22px high and Clear at its line's height, with the tap areas
   * outside the layout (`tapOutsideClass`); 24px above the group on the
   * phone, and 24px between the stars and a wrapped Clear, so no two areas
   * overlap.
   */
  tapOutside?: boolean
}) {
  const t = useTranslations('collection')
  const clearId = useId()
  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      className={`flex flex-wrap items-center text-meta ${tapOutside ? 'gap-x-2 max-wide:mt-5 max-wide:gap-y-6' : 'gap-2'}`}
    >
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
            className={`flex items-center ${tapOutside ? `h-star w-7 ${tapOutsideClass}` : 'size-7 max-wide:size-tap'} ${
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
        <ActionLink
          id={clearId}
          aria-labelledby={`${clearId} ${labelledBy}`}
          onClick={onClear}
          tapOutside={tapOutside}
        >
          {t('clear')}
        </ActionLink>
      )}
    </div>
  )
}
