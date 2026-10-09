'use client'

import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { sectionOf, sectionRow } from './sections'

const heading =
  'shrink-0 text-heading-section-phone ui-case max-wide:min-h-tap wide:text-heading-section'

/**
 * The headings row (EXPERIENCE.md, Navigation): the current section as the
 * page's `h1`, then links to the others. The row never wraps; it clips at
 * the right edge. The live region is in the server HTML, so only a client
 * section change is announced.
 */
export function SectionNav() {
  const t = useTranslations('sections')
  const current = sectionOf(usePathname())
  const [, ...others] = sectionRow(current.key)

  return (
    // Clipped sideways only: `overflow-hidden` would also cut off the focus
    // ring above and below the links, and would scroll to a focused link.
    <div className="flex min-w-0 flex-1 gap-6 overflow-x-clip wide:gap-7">
      <h1 className={`${heading} text-text`}>{t(current.key)}</h1>
      <nav aria-label={t('label')} className="flex shrink-0 gap-6 wide:gap-7">
        {others.map(({ key, href }) => (
          <Link key={key} href={href} className={`${heading} text-text-dim`}>
            {t(key)}
          </Link>
        ))}
      </nav>
      <p aria-live="polite" className="sr-only">
        {t(current.key)}
      </p>
    </div>
  )
}
