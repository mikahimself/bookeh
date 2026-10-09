import { DomainError } from '@/lib/errors'
import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import type { User } from '@/payload-types'

/** The signed-in user's profile as Settings shows it. Email is shown, never edited. */
export type Profile = Pick<User, 'email' | 'displayName' | 'language'>

/** What a user may change on their own profile. An absent or `undefined` key is left as is. */
export type ProfileChanges = Partial<Pick<User, 'displayName' | 'language'>>

const toProfile = ({ email, displayName, language }: User): Profile => ({
  email,
  displayName,
  language,
})

/**
 * Spine, AD-18: the profile is read only through `lib/account`. Always the
 * context user's own document.
 */
export async function getProfile(ctx: Context): Promise<Profile> {
  return toProfile(await gateway.findByID(ctx, { collection: 'users', id: ctx.user.id }))
}

/**
 * Spine, AD-18: the profile is updated only through `lib/account`. Always the
 * context user's own document; `data` holds only the known keys, so neither an
 * id nor `roles` can reach the write, whatever the caller passes. The display
 * name is trimmed and NFC-normalised (Text input convention) and fails with
 * `VALIDATION` on `displayName` when empty. An unknown language is left to
 * Payload's select validation, which `runAction()` maps to the same shape.
 */
export async function updateProfile(ctx: Context, changes: ProfileChanges): Promise<Profile> {
  const data: ProfileChanges = {}
  if (changes.displayName !== undefined) {
    const displayName = changes.displayName.trim().normalize('NFC')
    if (displayName === '') {
      throw new DomainError('VALIDATION', { fields: { displayName: 'VALIDATION' } })
    }
    data.displayName = displayName
  }
  if (changes.language !== undefined) data.language = changes.language

  if (Object.keys(data).length === 0) return getProfile(ctx)
  return toProfile(await gateway.updateByID(ctx, { collection: 'users', id: ctx.user.id, data }))
}
