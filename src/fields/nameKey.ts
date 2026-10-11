import { ValidationError, type FieldHook, type TextField, type TypeWithID } from 'payload'

/**
 * Spine, Names convention: NFC, trimmed, inner whitespace runs collapsed to
 * one space, lower-cased. No accent folding, no locale-specific casing.
 */
export function toNameKey(name: string): string {
  return name.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase()
}

type NameSibling = { name?: unknown }

/**
 * Recomputes `nameKey` from the sibling `name` on every create and update;
 * any `nameKey` in the input is ignored. A partial update without `name`
 * keys the stored name. A name that is blank after trimming fails on `name`,
 * where the screens show it, since Payload's `required` lets `'   '` through.
 */
const keyFromName: FieldHook<TypeWithID, unknown, NameSibling> = ({
  collection,
  previousSiblingDoc,
  req,
  siblingData,
}) => {
  const name = siblingData.name === undefined ? previousSiblingDoc?.name : siblingData.name
  const key = typeof name === 'string' ? toNameKey(name) : ''
  if (key === '') {
    throw new ValidationError({
      ...(collection ? { collection: collection.slug } : {}),
      errors: [{ path: 'name', message: req.t('validation:required') }],
      req,
    })
  }
  return key
}

/** Spread after the collection's own `name` field. */
export const nameKeyField = (): TextField => ({
  name: 'nameKey',
  type: 'text',
  required: true,
  admin: { hidden: true },
  hooks: { beforeValidate: [keyFromName] },
})
