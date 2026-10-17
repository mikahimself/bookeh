import type { Access } from 'payload'

const own: Access = ({ req: { user } }) => (user ? { owner: { equals: user.id } } : false)
const signedIn: Access = ({ req: { user } }) => Boolean(user)

/**
 * Spine, AD-1: access for every private collection (`user-books`, `copies`,
 * `locations`, ...). Any signed-in user creates; read, update and delete
 * reach only rows with `owner = current user`, for every role, the admin
 * included; signed out reaches nothing. The owner itself comes from
 * `ownerField()`. A plain object: the four rules take no parameters.
 */
export const ownerAccess = {
  create: signedIn,
  read: own,
  update: own,
  delete: own,
} satisfies Record<'read' | 'create' | 'update' | 'delete', Access>
