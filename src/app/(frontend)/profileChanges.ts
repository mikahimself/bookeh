import { locales, type Locale } from '@/i18n/locale'
import type { ProfileChanges } from '@/lib/account/profile'

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value))

const isLocale = (value: unknown): value is Locale =>
  typeof value === 'string' && (locales as readonly string[]).includes(value)

/**
 * Validates profile changes from the client: a plain object holding only
 * `displayName` (a string) and/or `language` (a locale). Anything else, an
 * extra key included, is `null`, never repaired. Trim and NFC are the
 * service's job (`updateProfile`). Not in `actions/account.ts`: a
 * `'use server'` file exports only async functions.
 */
export function parseProfileChanges(value: unknown): ProfileChanges | null {
  if (!isPlainObject(value)) return null
  const changes: ProfileChanges = {}
  for (const [key, field] of Object.entries(value)) {
    if (key === 'displayName' && typeof field === 'string') changes.displayName = field
    else if (key === 'language' && isLocale(field)) changes.language = field
    else return null
  }
  return changes
}
