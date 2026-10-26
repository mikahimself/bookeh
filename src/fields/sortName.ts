import type { FieldHook, TextField, TypeWithID } from 'payload'

/** `toNameKey` without the lower-casing: NFC, trimmed, whitespace runs collapsed. */
export const normaliseName = (name: string): string =>
  name.normalize('NFC').trim().replace(/\s+/g, ' ')

/**
 * Spine, Text input: text a user types. Single-line text (a title, a name, a
 * publisher) is `normaliseName()`d; multiline text (a description) is NFC and
 * trimmed only, so it keeps its line breaks.
 */
export const normaliseText = (text: string, { multiline = false } = {}): string =>
  multiline ? text.normalize('NFC').trim() : normaliseName(text)

/**
 * Spine AD-4: an author's `sortName` is "Family, Given", derived from `name`
 * last word first when nothing better is given. The name is normalised like
 * `toNameKey` but keeps its case. A name with a comma is already inverted and
 * is its own sort name. No particle or corporate-name rules: corporate names
 * come out wrong and the admin fixes them in the back office.
 * Returns null for a blank name.
 */
export function deriveSortName(name: string): string | null {
  const normalised = normaliseName(name)
  if (normalised === '') return null
  if (normalised.includes(',')) return normalised
  const words = normalised.split(' ')
  return words.length < 2 ? normalised : `${words.at(-1)}, ${words.slice(0, -1).join(' ')}`
}

type NameSibling = { name?: unknown }

/**
 * Keeps a non-blank `sortName` (the input's, or the stored one on a partial
 * update), normalised like the name; otherwise derives one from the sibling
 * `name`, or the stored name when the input has none. A stored value is never
 * re-derived when `name` changes. A blank name gives null; `nameKeyField`
 * rejects it.
 */
const sortFromName: FieldHook<TypeWithID, unknown, NameSibling> = ({
  previousSiblingDoc,
  siblingData,
  value,
}) => {
  const kept = typeof value === 'string' ? normaliseName(value) : ''
  if (kept !== '') return kept
  const name = siblingData.name === undefined ? previousSiblingDoc?.name : siblingData.name
  return typeof name === 'string' ? deriveSortName(name) : null
}

/**
 * Spread after the collection's own `name` field. Not `required` and no
 * `validate`: admin form state validates the raw input before the hook runs,
 * and an empty field must pass there.
 */
export const sortNameField = (): TextField => ({
  name: 'sortName',
  type: 'text',
  hooks: { beforeValidate: [sortFromName] },
})
