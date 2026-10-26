import { isRowId, type Ref } from '@/lib/payload/ref'

import { isPlainObject } from './plainObject'

/**
 * Validates a `Ref` from the client: a row id (`isRowId()`), or a plain
 * object whose only key is `create`, holding a string. Anything else is
 * `undefined`, never repaired. Trimming and the blank check are the owning
 * service's job (`resolveLocation`). Not in a `'use server'` file: those
 * export only async functions.
 */
export function parseRef(value: unknown): Ref | undefined {
  if (typeof value === 'number') return isRowId(value) ? value : undefined
  if (!isPlainObject(value)) return undefined
  const keys = Object.keys(value)
  if (keys.length !== 1 || keys[0] !== 'create') return undefined
  const { create } = value
  return typeof create === 'string' ? { create } : undefined
}
