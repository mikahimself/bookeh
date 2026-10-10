import { getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'

import { getProfile } from '@/lib/account/profile'
import { requireUser } from '@/lib/payload/context'

import { SignOutButton } from '../../components/SignOutButton'
import { devicePrefs, THEMES } from '../../prefs'
import { DisplayNameField } from './DisplayNameField'
import { LanguageSwitch } from './LanguageSwitch'
import { ThemeSwitch } from './ThemeSwitch'

function Group({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-heading-group text-text-muted ui-case">{heading}</h2>
      {children}
    </section>
  )
}

/**
 * Settings (EXPERIENCE.md, Settings): profile, language, theme and Sign out
 * in the first of two columns on wide screens, one column on the phone.
 * Reads go through `getProfile()` and `devicePrefs()`; the controls write
 * through `updateProfileAction` and `setDevicePrefsAction`.
 */
export default async function SettingsPage() {
  const ctx = await requireUser()
  const [profile, { theme }, t] = await Promise.all([
    getProfile(ctx),
    devicePrefs(),
    getTranslations('settings'),
  ])

  return (
    <div className="px-page-margin-phone pt-7 pb-7 wide:grid wide:grid-cols-2 wide:gap-7 wide:px-page-margin">
      <div className="flex max-w-panel-width flex-col gap-7">
        <Group heading={t('profile')}>
          <DisplayNameField initial={profile.displayName} />
          {/* Shown, never edited (1.22): text, not an input. */}
          <div className="flex flex-col gap-1">
            <p className="text-label text-text-muted">{t('email')}</p>
            <p className="text-control text-text">{profile.email}</p>
          </div>
        </Group>
        <Group heading={t('language')}>
          <LanguageSwitch initial={profile.language} />
        </Group>
        <Group heading={t('theme')}>
          <ThemeSwitch initial={theme} options={THEMES} />
        </Group>
        <SignOutButton />
      </div>
      {/* Second column: the managed lists (locations, people, tags) of later stories. */}
    </div>
  )
}
