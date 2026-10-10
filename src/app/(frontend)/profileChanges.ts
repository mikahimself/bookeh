import { locales } from '@/i18n/locale'
import {
  COLLECTION_VISIBILITIES,
  PROFILE_VISIBILITIES,
  type ProfileChanges,
} from '@/lib/account/profile'

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value))

const isOneOf = <V extends string>(values: readonly V[], value: unknown): value is V =>
  typeof value === 'string' && (values as readonly string[]).includes(value)

/**
 * Validates profile changes from the client: a plain object holding only
 * `displayName` (a string), `language` (a locale) and/or the two visibilities
 * (a value from the matching tuple). Anything else, an extra key included, is
 * `null`, never repaired. Trim and NFC are the service's job
 * (`updateProfile`). Not in `actions/account.ts`: a `'use server'` file
 * exports only async functions.
 */
export function parseProfileChanges(value: unknown): ProfileChanges | null {
  if (!isPlainObject(value)) return null
  const changes: ProfileChanges = {}
  for (const [key, field] of Object.entries(value)) {
    if (key === 'displayName' && typeof field === 'string') changes.displayName = field
    else if (key === 'language' && isOneOf(locales, field)) changes.language = field
    else if (key === 'profileVisibility' && isOneOf(PROFILE_VISIBILITIES, field))
      changes.profileVisibility = field
    else if (key === 'collectionVisibility' && isOneOf(COLLECTION_VISIBILITIES, field))
      changes.collectionVisibility = field
    else return null
  }
  return changes
}
