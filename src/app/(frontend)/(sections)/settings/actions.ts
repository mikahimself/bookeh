'use server'

import {
  createLocation,
  deleteLocation,
  mergeLocation,
  renameLocation,
} from '@/lib/copies/locations'
import { DomainError, runAction, type ActionResult } from '@/lib/errors'
import { requireUserOrThrow } from '@/lib/payload/context'
import { isRowId } from '@/lib/payload/ref'
import { createPerson, deletePerson, mergePerson, renamePerson } from '@/lib/people/people'

// Settings → Locations (FR-31) and People (FR-34), UX-DR50. Client input is
// checked here, never repaired: a name must be a string and an id a row id
// (`isRowId()`), else `VALIDATION` with no write. Normalising, the blank check
// and ownership are the services'. The client calls `router.refresh()` on
// success; no Undo.

const name = (value: unknown): string => {
  if (typeof value !== 'string') throw new DomainError('VALIDATION')
  return value
}

const id = (value: unknown): number => {
  if (!isRowId(value)) throw new DomainError('VALIDATION')
  return value
}

/** Adds a location; a name in use fails `NAME_TAKEN` with its id as `conflictId`. */
export async function createLocationAction(value: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await requireUserOrThrow()
    await createLocation(ctx, name(value))
    return null
  })
}

/** Renames a location; another location's name fails `NAME_TAKEN` with its id, to offer a merge. */
export async function renameLocationAction(
  location: unknown,
  value: unknown,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await requireUserOrThrow()
    await renameLocation(ctx, id(location), name(value))
    return null
  })
}

/** Moves the source's copies and default to the target, then deletes the source. */
export async function mergeLocationAction(
  source: unknown,
  target: unknown,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await requireUserOrThrow()
    await mergeLocation(ctx, id(source), id(target))
    return null
  })
}

/** Clears the location from copies and the default, then deletes it. */
export async function deleteLocationAction(location: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await requireUserOrThrow()
    await deleteLocation(ctx, id(location))
    return null
  })
}

/** Adds a Person; a name in use fails `NAME_TAKEN` with their id as `conflictId`. */
export async function createPersonAction(value: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await requireUserOrThrow()
    await createPerson(ctx, name(value))
    return null
  })
}

/** Renames a Person; another Person's name fails `NAME_TAKEN` with their id, to offer a merge. */
export async function renamePersonAction(
  person: unknown,
  value: unknown,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await requireUserOrThrow()
    await renamePerson(ctx, id(person), name(value))
    return null
  })
}

/** Moves the source's loans to the target, then deletes the source. */
export async function mergePersonAction(
  source: unknown,
  target: unknown,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await requireUserOrThrow()
    await mergePerson(ctx, id(source), id(target))
    return null
  })
}

/** Deletes a Person; one with any loan fails `PERSON_IN_USE`. */
export async function deletePersonAction(person: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await requireUserOrThrow()
    await deletePerson(ctx, id(person))
    return null
  })
}
