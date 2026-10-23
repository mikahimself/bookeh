'use client'

import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'

import { locales } from '@/i18n/locale'
import type { Profile } from '@/lib/account/profile'

import { updateProfileAction } from '../../actions/account'
import { TextSwitch } from '../../components/TextSwitch'
import { useSavedSwitch } from '../../components/useSavedSwitch'

/**
 * Interface language (FR-51, AD-15): on the profile, so it follows the user
 * to every device. The chosen option switches at once; on success the route
 * is refreshed, a new request, so the whole interface, `<html lang>`
 * included, re-renders in the new language. On failure the stored option returns.
 */
export function LanguageSwitch({ initial }: { initial: Profile['language'] }) {
  const t = useTranslations('settings')
  const router = useRouter()
  const [language, change] = useSavedSwitch(
    initial,
    (language) => updateProfileAction({ language }),
    () => router.refresh(),
  )

  return (
    <TextSwitch
      label={t('language')}
      value={language}
      options={locales.map((locale) => ({ value: locale, label: t(`languages.${locale}`) }))}
      onChange={change}
      properNames
    />
  )
}
