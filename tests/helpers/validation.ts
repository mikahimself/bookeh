import { ValidationError } from 'payload'
import { expect } from 'vitest'

/** Asserts the promise rejects with a `ValidationError` and returns the failing field paths. */
export async function rejectedPaths(promise: Promise<unknown>): Promise<string[]> {
  const err: unknown = await promise.then(
    () => null,
    (e: unknown) => e,
  )
  expect(err).toBeInstanceOf(ValidationError)
  return (err as ValidationError).data.errors.map((e) => e.path)
}
