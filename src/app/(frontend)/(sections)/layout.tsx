import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { requireUser } from '@/lib/payload/context'

import { buttonClass } from '../components/Button'
import { SectionNav } from '../components/SectionNav'

/**
 * The section shell (EXPERIENCE.md, Navigation): the headings row and Scan
 * book, on every section. Scan book is rendered once per width, the other
 * copy `hidden`: pinned full width at the bottom under 900px, top right from
 * 900px. Each keeps DOM and focus order in step with what is drawn.
 */
export default async function SectionsLayout({ children }: { children: ReactNode }) {
  await requireUser()
  const t = await getTranslations('scan')

  const scanBook = (className: string) => (
    <Link
      href="/scan"
      transitionTypes={['task-open']}
      className={`${buttonClass('primary')} items-center justify-center ${className}`}
    >
      {t('open')}
    </Link>
  )

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center gap-6 px-page-margin-phone pt-page-margin-phone wide:px-page-margin wide:pt-page-margin">
        <SectionNav />
        {scanBook('hidden shrink-0 wide:inline-flex')}
      </header>
      <div className="flex-1">{children}</div>
      <div
        data-pinned-bottom
        className="sticky bottom-0 bg-background px-page-margin-phone pt-4 pb-[calc(var(--spacing-4)+env(safe-area-inset-bottom))] wide:hidden"
      >
        {scanBook('flex w-full')}
      </div>
    </div>
  )
}
