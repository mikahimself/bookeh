import type { Ref } from '@/lib/payload/ref'

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value))

/**
 * Validates a `Ref` from the client: a positive safe integer, or a plain
 * object whose only key is `create`, holding a string. Anything else is
 * `undefined`, never repaired. Trimming and the blank check are the owning
 * service's job (`resolveLocation`). Not in a `'use server'` file: those
 * export only async functions.
 */
export function parseRef(value: unknown): Ref | undefined {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? value : undefined
  }
  if (!isPlainObject(value)) return undefined
  const keys = Object.keys(value)
  if (keys.length !== 1 || keys[0] !== 'create') return undefined
  const { create } = value
  return typeof create === 'string' ? { create } : undefined
}
