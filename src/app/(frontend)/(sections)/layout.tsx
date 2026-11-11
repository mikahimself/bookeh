import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { requireUser } from '@/lib/payload/context'

import { AppBar, AppBarLink, AppBarProvider } from '../components/AppBar'
import { buttonClass } from '../components/Button'
import { SectionNav } from '../components/SectionNav'
import { SectionTransition } from '../components/SectionTransition'
import { SectionSwipe } from '../components/swipe'

/**
 * The section shell (EXPERIENCE.md, Navigation): the headings row and Add
 * book, on every section. Add book is rendered once per width, the other
 * copy `hidden`: the primary of the App bar under 900px, top right from 900px. Each keeps DOM
 * and focus order in step with what is drawn. The header and the content
 * slide together on a section change; Add book, in either place, stays put.
 * Under 900px a sideways swipe changes section.
 */
export default async function SectionsLayout({ children }: { children: ReactNode }) {
  await requireUser()
  const t = await getTranslations('scan')

  return (
    <AppBarProvider>
      <div className="flex min-h-dvh flex-col">
        <SectionTransition>
          <div className="flex flex-1 flex-col">
            <header className="flex items-center gap-6 px-page-margin-phone pt-page-margin-phone wide:px-page-margin wide:pt-page-margin">
              <SectionNav />
              <Link
                data-scan-book
                href="/scan"
                transitionTypes={['task-open']}
                className={`${buttonClass('primary')} hidden shrink-0 items-center justify-center wide:inline-flex`}
              >
                {t('open')}
              </Link>
            </header>
            <div className="flex flex-1 flex-col">{children}</div>
          </div>
        </SectionTransition>
        <SectionSwipe />
        <AppBar>
          <AppBarLink href="/scan" transitionTypes={['task-open']} icon="plus" primary>
            {t('open')}
          </AppBarLink>
        </AppBar>
      </div>
    </AppBarProvider>
  )
}
