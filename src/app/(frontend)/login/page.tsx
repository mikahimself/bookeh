import { getTranslations } from 'next-intl/server'

import { LoginForm } from './LoginForm'

/** FR-1: the one page without a session. The locale comes from the browser. */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { next } = await searchParams
  const t = await getTranslations('signIn')

  return (
    <div className="flex max-w-panel-width flex-col gap-7 p-page-margin-phone wide:p-page-margin">
      <h1 className="text-heading-section-phone ui-case wide:text-heading-section">
        {t('heading')}
      </h1>
      <LoginForm next={Array.isArray(next) ? next[0] : next} />
    </div>
  )
}
