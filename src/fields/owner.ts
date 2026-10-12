import type { FieldHook, SingleRelationshipField } from 'payload'

/**
 * Taken from `req.user` on create and kept from the stored row on update;
 * any `owner` in the input is ignored. A create without a user throws.
 */
const ownerFromRequest: FieldHook = ({ operation, previousValue, req }) => {
  if (operation === 'create') {
    if (!req.user) throw new Error('ownerField: no req.user on create')
    return req.user.id
  }
  return previousValue
}

/**
 * Spine, AD-1: the one owner field of every private collection. Only sets the
 * owner; who may read or change the row stays with the collection's access.
 * The default (the signed-in user) only satisfies `required` in the admin
 * form; on create the hook sets the owner whatever the form held.
 */
export const ownerField = (): SingleRelationshipField => ({
  name: 'owner',
  type: 'relationship',
  relationTo: 'users',
  required: true,
  defaultValue: ({ user }) => user?.id,
  admin: { readOnly: true },
  hooks: { beforeValidate: [ownerFromRequest] },
})
