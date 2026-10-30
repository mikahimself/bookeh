'use client'

import { useTranslations } from 'next-intl'
import { useEffect } from 'react'

import { Button } from './components/Button'
import { TextLink } from './components/Link'

/**
 * EXPERIENCE.md, States, Unexpected failure: what a page that throws shows in
 * place of Next's default, inside the root layout. The error goes to the log,
 * never to the screen. Try again re-renders the segment (`retry`, this Next's
 * name for it).
 */
export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  const t = useTranslations('errorPage')

  useEffect(() => {
    // The browser has no `logger()`; the server logged its own error already.
    // eslint-disable-next-line no-console
    console.error(error)
  }, [error])

  return (
    <div className="flex max-w-panel-width flex-col gap-7 p-page-margin-phone wide:p-page-margin">
      <div role="alert">
        <h1 className="text-heading-section-phone ui-case wide:text-heading-section">
          {t('heading')}
        </h1>
      </div>
      <div className="flex flex-col items-start gap-4">
        <Button variant="primary" onClick={() => retry()}>
          {t('tryAgain')}
        </Button>
        <TextLink href="/">{t('collection')}</TextLink>
      </div>
    </div>
  )
}
