import { getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'

import { COLLECTION_VISIBILITIES, getProfile, PROFILE_VISIBILITIES } from '@/lib/account/profile'
import { listLocations } from '@/lib/copies/locations'
import { requireUser } from '@/lib/payload/context'

import { SignOutButton } from '../../components/SignOutButton'
import { devicePrefs, THEMES } from '../../prefs'
import { DefaultLocationField } from './DefaultLocationField'
import { DisplayNameField } from './DisplayNameField'
import { LanguageSwitch } from './LanguageSwitch'
import { ThemeSwitch } from './ThemeSwitch'
import { VisibilitySwitch } from './VisibilitySwitch'

/** Names both visibility groups, after each one's own label. */
const VISIBILITY_HEADING = 'settings-visibility'

function Group({ heading, id, children }: { heading: string; id?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 id={id} className="text-heading-group text-text-muted ui-case">
        {heading}
      </h2>
      {children}
    </section>
  )
}

/**
 * Settings (EXPERIENCE.md, Settings): profile, language, theme, visibility,
 * default location and Sign out in the first of two columns on wide screens,
 * one column on the phone.
 * Reads go through `getProfile()`, `listLocations()` and `devicePrefs()`; the
 * controls write through `updateProfileAction`, `setDefaultLocationAction`
 * and `setDevicePrefsAction`.
 */
export default async function SettingsPage() {
  const ctx = await requireUser()
  const [{ theme }, t] = await Promise.all([devicePrefs(), getTranslations('settings')])
  // Gateway calls on one context run one after the other, never concurrently.
  const profile = await getProfile(ctx)
  const locations = await listLocations(ctx)

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
        <Group heading={t('visibility')} id={VISIBILITY_HEADING}>
          <VisibilitySwitch
            field="profileVisibility"
            label={t('profileVisibility')}
            headingId={VISIBILITY_HEADING}
            initial={profile.profileVisibility}
            options={PROFILE_VISIBILITIES}
          />
          <VisibilitySwitch
            field="collectionVisibility"
            label={t('collectionVisibility')}
            headingId={VISIBILITY_HEADING}
            initial={profile.collectionVisibility}
            options={COLLECTION_VISIBILITIES}
          />
        </Group>
        <Group heading={t('defaultLocation')}>
          <DefaultLocationField initial={profile.defaultLocation} locations={locations} />
        </Group>
        <SignOutButton />
      </div>
      {/* Second column: the managed lists (locations, people, tags) of later stories. */}
    </div>
  )
}
