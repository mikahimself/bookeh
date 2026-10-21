import { DomainError } from '@/lib/errors'
import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import type { User } from '@/payload-types'

/**
 * The signed-in user's profile as Settings shows it. Email is shown, never
 * edited. `defaultLocation` is always an id, never a populated row.
 */
export type Profile = Pick<
  User,
  'email' | 'displayName' | 'language' | 'profileVisibility' | 'collectionVisibility'
> & { defaultLocation: number | null }

/**
 * What a user may change on their own profile. An absent or `undefined` key
 * is left as is. `defaultLocation` is passed to the write as given:
 * `users.defaultLocation`'s `ownedRelation` rejects a foreign or missing id
 * with a `ValidationError` on `defaultLocation`.
 */
export type ProfileChanges = Partial<
  Pick<User, 'displayName' | 'language' | 'profileVisibility' | 'collectionVisibility'> & {
    defaultLocation: number | null
  }
>

/** The longest display name `updateProfile()` stores, in code points after trim and NFC. */
export const DISPLAY_NAME_MAX_LENGTH = 100

/** Empty, over the limit, or holding any control character, tab and newline included. */
const invalidDisplayName = (name: string): boolean =>
  name === '' || [...name].length > DISPLAY_NAME_MAX_LENGTH || /\p{Cc}/u.test(name)

/** Visibility towards friends (FR-4): stored now, read by nothing in Phase 1. */
export const PROFILE_VISIBILITIES: readonly User['profileVisibility'][] = ['public', 'hidden']
export const COLLECTION_VISIBILITIES: readonly User['collectionVisibility'][] = ['open', 'closed']

const toProfile = ({
  email,
  displayName,
  language,
  profileVisibility,
  collectionVisibility,
  defaultLocation,
}: User): Profile => ({
  email,
  displayName,
  language,
  profileVisibility,
  collectionVisibility,
  // Read with `depth: 0`, so a row here is never expected; the type allows one.
  defaultLocation:
    defaultLocation === null || defaultLocation === undefined
      ? null
      : typeof defaultLocation === 'number'
        ? defaultLocation
        : defaultLocation.id,
})

/**
 * Spine, AD-18: the profile is read only through `lib/account`. Always the
 * context user's own document.
 */
export async function getProfile(ctx: Context): Promise<Profile> {
  return toProfile(await gateway.findByID(ctx, { collection: 'users', id: ctx.user.id, depth: 0 }))
}

/**
 * Spine, AD-18: the profile is updated only through `lib/account`. Always the
 * context user's own document; `data` holds only the known keys, so neither an
 * id nor `roles` can reach the write, whatever the caller passes. The display
 * name is trimmed and NFC-normalised (Text input convention) and fails with
 * `VALIDATION` on `displayName` when empty, longer than
 * `DISPLAY_NAME_MAX_LENGTH` code points, or holding a control character (tab
 * and newline included). An unknown language is left to Payload's select
 * validation, which `runAction()` maps to the same shape.
 */
export async function updateProfile(ctx: Context, changes: ProfileChanges): Promise<Profile> {
  const data: ProfileChanges = {}
  if (changes.displayName !== undefined) {
    const displayName = changes.displayName.trim().normalize('NFC')
    if (invalidDisplayName(displayName)) {
      throw new DomainError('VALIDATION', { fields: { displayName: 'VALIDATION' } })
    }
    data.displayName = displayName
  }
  if (changes.language !== undefined) data.language = changes.language
  if (changes.profileVisibility !== undefined) data.profileVisibility = changes.profileVisibility
  if (changes.collectionVisibility !== undefined)
    data.collectionVisibility = changes.collectionVisibility
  if (changes.defaultLocation !== undefined) data.defaultLocation = changes.defaultLocation

  if (Object.keys(data).length === 0) return getProfile(ctx)
  return toProfile(
    await gateway.updateByID(ctx, { collection: 'users', id: ctx.user.id, data, depth: 0 }),
  )
}
