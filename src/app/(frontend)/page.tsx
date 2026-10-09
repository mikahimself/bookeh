import { getTranslations } from 'next-intl/server'

import { requireUser } from '@/lib/payload/context'

import { SignOutButton } from './components/SignOutButton'

/** A signed-in placeholder until the section shell (1.19) and Settings (1.23). */
export default async function HomePage() {
  await requireUser()
  const t = await getTranslations()

  return (
    <div className="flex flex-col items-start gap-7 p-page-margin-phone wide:p-page-margin">
      <h1 className="text-heading-section-phone ui-case wide:text-heading-section">
        {t('app.name')}
      </h1>
      <SignOutButton />
    </div>
  )
}
