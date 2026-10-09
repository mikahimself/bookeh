/** Spine, Roles convention: `users.roles` holds `admin` and/or `user`. */
export type Role = 'admin' | 'user'

/**
 * Anything that may carry roles: `req.user` in an access function or hook,
 * or a `User` document. Absent means signed out.
 */
export type RoleHolder = { roles?: readonly Role[] | null } | null | undefined

/** The only place that reads `roles` (AD-2). */
const hasRole = (user: RoleHolder, role: Role): boolean => user?.roles?.includes(role) ?? false

export const isAdmin = (user: RoleHolder): boolean => hasRole(user, 'admin')

/**
 * May edit shared catalogue records from the app (AD-3: Edit book, genre
 * management, cover upload). Admin only in Phase 1; a moderator role (FR-48)
 * changes this helper, not its callers.
 */
export const canEditShared = (user: RoleHolder): boolean => isAdmin(user)
