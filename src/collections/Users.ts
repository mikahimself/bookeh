import type {
  Access,
  CollectionConfig,
  FieldAccess,
  RelationshipFieldSingleValidation,
  SingleRelationshipField,
} from 'payload'

import { isAdmin } from '@/access/roles'
import { ownedRelation } from '@/fields/relation'

/** Admin reads and updates every user; a signed-in user only themself. */
const adminOrSelf: Access = ({ req: { user } }) => {
  if (isAdmin(user)) return true
  if (user) return { id: { equals: user.id } }
  return false
}

const adminOnly: Access = ({ req: { user } }) => isAdmin(user)

const adminOnlyField: FieldAccess = ({ req: { user } }) => isAdmin(user)

/** The row's own user; false on create, where `id` is undefined. */
const isSelf = (user: { id: number } | null | undefined, id: number | string | undefined) =>
  id !== undefined && user?.id === id

const self: FieldAccess = ({ req: { user }, id }) => isSelf(user, id)

// Without `hasMany` the helper builds the single-value variant with its
// validator set; its return type, the `hasMany` union, does not say so.
type OwnedSingle = Extract<SingleRelationshipField, { hasMany?: false }> & {
  validate: RelationshipFieldSingleValidation
}
const ownedLocation = ownedRelation('locations', { name: 'defaultLocation' }) as OwnedSingle

/**
 * FR-4/FR-48: the location new owned copies land at, one of the user's own
 * `locations`. Self-only field access keeps the admin from reading or writing
 * another user's default. Collection access still lets the admin update the
 * row, and Payload validates every field on update after refilling the ones
 * not submitted, so the stored default would be checked against the admin
 * (who cannot read it), against no one in a system write and against no one
 * in `forgotPassword` (FR-5): the row would lock the moment a default was
 * chosen. `ownedRelation`'s validator therefore runs only for the user's own
 * write; for anyone else access has dropped the field and the stored value
 * came back, so there is nothing to validate.
 */
const defaultLocation: SingleRelationshipField = {
  ...ownedLocation,
  validate: (value, options) =>
    isSelf(options.req.user, options.id) ? ownedLocation.validate(value, options) : true,
  access: { create: self, read: self, update: self },
}

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'displayName',
    defaultColumns: ['displayName', 'email', 'roles'],
  },
  auth: {
    tokenExpiration: 60 * 60 * 24 * 30,
    cookies: {
      // Production serves over tailnet HTTPS (`tailscale serve`); dev runs on
      // plain http://localhost and must stay non-Secure.
      secure: process.env.NODE_ENV === 'production',
    },
  },
  access: {
    admin: ({ req: { user } }) => isAdmin(user),
    create: adminOnly,
    read: adminOrSelf,
    update: adminOrSelf,
    delete: adminOnly,
    unlock: adminOnly,
  },
  fields: [
    {
      name: 'roles',
      type: 'select',
      hasMany: true,
      required: true,
      options: ['admin', 'user'],
      defaultValue: ['user'],
      access: {
        create: adminOnlyField,
        update: adminOnlyField,
      },
    },
    {
      name: 'displayName',
      type: 'text',
      required: true,
    },
    {
      name: 'language',
      type: 'select',
      required: true,
      options: ['en', 'fi'],
      defaultValue: 'en',
    },
    // Visibility towards friends (FR-4, D-1): stored from the start so Phase 2
    // needs no schema rework. Nothing reads them in Phase 1.
    {
      name: 'profileVisibility',
      type: 'select',
      required: true,
      options: ['public', 'hidden'],
      defaultValue: 'hidden',
    },
    {
      name: 'collectionVisibility',
      type: 'select',
      required: true,
      options: ['open', 'closed'],
      defaultValue: 'closed',
    },
    defaultLocation,
  ],
}
