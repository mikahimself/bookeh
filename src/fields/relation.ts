import type { CollectionSlug, RelationshipFieldValidation, SingleRelationshipField } from 'payload'
import { relationship } from 'payload/shared'

import { asRequestUser } from '@/access/asRequestUser'

type RelationOptions = { name: string; required?: boolean; hasMany?: boolean }

/**
 * The distinct target ids of a relationship value (one, or a hasMany list).
 * Only numbers reach here: `beforeValidate` unwraps `{ id }` objects and
 * Payload's `relationship` validator, run first, rejects any other id.
 */
const relationIds = (value: unknown): number[] =>
  [...new Set(Array.isArray(value) ? value : [value])].filter(
    (id): id is number => typeof id === 'number',
  )

/**
 * Spine, AD-17: Payload's own relationship check, then every target must be
 * readable by the request user. The count goes through `asRequestUser(req)`
 * and carries `req`, so it joins the request's transaction and sees its
 * uncommitted rows.
 */
const readableTargets =
  (slug: CollectionSlug): RelationshipFieldValidation =>
  async (value, options) => {
    const builtIn = await relationship(value, options)
    if (builtIn !== true) return builtIn
    if (options.event === 'onChange') return true

    const { req } = options
    const ids = relationIds(value)
    if (ids.length === 0) return true
    if (!req.user) return req.t('validation:invalidSelection')

    const { totalDocs } = await req.payload.count({
      collection: slug,
      where: { id: { in: ids } },
      // Read access returning false counts 0 instead of throwing Forbidden,
      // whose catch would end the request's transaction.
      disableErrors: true,
      ...asRequestUser(req),
    })
    return totalDocs === ids.length ? true : req.t('validation:invalidSelection')
  }

function relation(slug: CollectionSlug, { name, required, hasMany }: RelationOptions) {
  const validate = readableTargets(slug)
  const base = { name, type: 'relationship', relationTo: slug, required } as const
  const field: SingleRelationshipField = hasMany
    ? { ...base, hasMany: true, validate }
    : { ...base, hasMany: false, validate }
  return field
}

/**
 * Spine, AD-17: a relation to a private collection (`copies`, `locations`,
 * `user-books`, ...). Rejects any target the request user cannot read, which
 * for an owner-scoped collection means a row of another user. `validate` is
 * fixed: pass the name and options here rather than spreading the result.
 * The check runs in `validate`, so it covers only fields submitted in the
 * write, never draft saves of a collection without `drafts.validate`, and it
 * rejects a write without `req.user` (every write path builds a req for a
 * concrete user, AD-16).
 */
export const ownedRelation = (
  slug: CollectionSlug,
  options: RelationOptions,
): SingleRelationshipField => relation(slug, options)

/**
 * Spine, AD-17: a relation to a target that is not owner-scoped but still
 * read through access (catalogue `books`, `users`). Same check as
 * `ownedRelation`, with the same limits; the name records which kind of
 * target the field expects.
 */
export const readableRelation = (
  slug: CollectionSlug,
  options: RelationOptions,
): SingleRelationshipField => relation(slug, options)
