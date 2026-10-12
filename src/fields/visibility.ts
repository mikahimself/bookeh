import type { FieldHook, SelectField, SingleRelationshipField, TypeWithID } from 'payload'

type VisibilityData = TypeWithID & { visibility?: unknown }
type VisibilitySibling = { visibility?: unknown }

/**
 * Spine, AD-4: `createdBy` follows the row's effective visibility (the input's,
 * else the stored row's); any `createdBy` in the input is ignored. A shared row
 * has none, so promotion clears it. A private row keeps its stored creator, or
 * takes `req.user` when it had none (a create, or a shared row made private).
 * A private create without a user throws.
 */
const createdByFromRequest: FieldHook<VisibilityData, unknown, VisibilitySibling> = ({
  originalDoc,
  previousValue,
  req,
  siblingData,
}) => {
  const visibility = siblingData.visibility ?? originalDoc?.visibility
  if (visibility !== 'private') return null
  if (originalDoc?.visibility === 'private' && previousValue != null) return previousValue
  if (!req.user) throw new Error('createdBy: no req.user on a private create')
  return req.user.id
}

/**
 * Spine, AD-4: the `visibility` / `createdBy` pair of every catalogue
 * collection (`authors`, `series`, `books`). `visibility` has no default, so
 * no caller gets a shared row by leaving it out. Spread after the
 * collection's own fields.
 */
export const visibilityFields = (): [SelectField, SingleRelationshipField] => [
  {
    name: 'visibility',
    type: 'select',
    required: true,
    options: ['shared', 'private'],
  },
  {
    name: 'createdBy',
    type: 'relationship',
    relationTo: 'users',
    admin: { readOnly: true },
    hooks: { beforeValidate: [createdByFromRequest] },
  },
]
