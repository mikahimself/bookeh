import type { Access, CollectionConfig, FieldAccess } from 'payload'

import { isAdmin } from '@/access/roles'

/** Admin reads and updates every user; a signed-in user only themself. */
const adminOrSelf: Access = ({ req: { user } }) => {
  if (isAdmin(user)) return true
  if (user) return { id: { equals: user.id } }
  return false
}

const adminOnly: Access = ({ req: { user } }) => isAdmin(user)

const adminOnlyField: FieldAccess = ({ req: { user } }) => isAdmin(user)

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'displayName',
    defaultColumns: ['displayName', 'email', 'roles'],
  },
  auth: {
    tokenExpiration: 60 * 60 * 24 * 30,
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
  ],
}
