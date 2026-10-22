import { getFormatter, getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'

import {
  COLLECTION_VISIBILITIES,
  DISPLAY_NAME_MAX_LENGTH,
  getProfile,
  PROFILE_VISIBILITIES,
} from '@/lib/account/profile'
import { listLocations } from '@/lib/copies/locations'
import { requireUser } from '@/lib/payload/context'
import { filterValues } from '@/lib/shelf/filterValues'

import { SignOutButton } from '../../components/SignOutButton'
import { devicePrefs, THEMES } from '../../prefs'
import { DefaultLocationField } from './DefaultLocationField'
import { DisplayNameField } from './DisplayNameField'
import { LanguageSwitch } from './LanguageSwitch'
import { readLastBackup } from './lastBackup'
import { LocationsGroup } from './LocationsGroup'
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
 * the managed lists (Locations) and, for admins only, Backup (NFR-6) in the
 * second; one column on the phone. Backup shows the last backup from
 * `readLastBackup()`, in `danger` with "Backup is overdue." when overdue.
 * Reads go through `getProfile()`, `listLocations()`, `filterValues()` and
 * `devicePrefs()`; the controls write through `updateProfileAction`,
 * `setDefaultLocationAction`, `setDevicePrefsAction` and the location actions
 * in `./actions`.
 */
export default async function SettingsPage() {
  const ctx = await requireUser()
  const [{ theme }, t, format, backup] = await Promise.all([
    devicePrefs(),
    getTranslations('settings'),
    getFormatter(),
    readLastBackup(ctx.user),
  ])
  // Gateway calls on one context run one after the other, never concurrently.
  const profile = await getProfile(ctx)
  const locations = await listLocations(ctx)
  // Spine, AD-18: a location's count is its copies from the shelf values; unused ones are absent.
  const counts = new Map(
    (await filterValues(ctx, profile.language)).location.map(({ id, count }) => [id, count]),
  )
  const counted = locations.map((location) => ({
    ...location,
    count: counts.get(location.id) ?? 0,
  }))
  // A refresh after a rename, merge or delete remounts the field with the fresh default and list.
  const defaultLocationKey = [
    profile.defaultLocation,
    ...locations.map(({ id, name }) => `${id}:${name}`),
  ].join('|')

  return (
    <div className="px-page-margin-phone pt-7 pb-7 wide:grid wide:grid-cols-2 wide:gap-7 wide:px-page-margin">
      <div className="flex max-w-panel-width flex-col gap-7">
        <Group heading={t('profile')}>
          <DisplayNameField initial={profile.displayName} maxLength={DISPLAY_NAME_MAX_LENGTH} />
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
          <DefaultLocationField
            key={defaultLocationKey}
            initial={profile.defaultLocation}
            locations={locations}
          />
        </Group>
        <SignOutButton />
      </div>
      {/* Second column: the managed lists, then Backup (admin only); People and tags arrive with later stories. */}
      <div className="flex max-w-panel-width flex-col gap-7 max-wide:mt-7">
        <Group heading={t('locations')}>
          <LocationsGroup locations={counted} />
        </Group>
        {backup && (
          <Group heading={t('backup')}>
            <div
              className={`flex flex-col gap-1 text-control ${backup.overdue ? 'text-danger' : 'text-text'}`}
            >
              <p>
                {backup.kind === 'missing'
                  ? t('lastBackupNone')
                  : t(backup.kind === 'success' ? 'lastBackup' : 'lastBackupFailed', {
                      date: format.dateTime(backup.time, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }),
                    })}
              </p>
              {backup.overdue && <p>{t('backupOverdue')}</p>}
            </div>
          </Group>
        )}
      </div>
    </div>
  )
}
