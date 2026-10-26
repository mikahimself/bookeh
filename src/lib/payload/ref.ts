// Pure, with no imports: `lib/shelf/query.ts`, which client components import, uses it.

/** Spine, Shared shapes: an existing row, or a name to create. */
export type Ref = number | { create: string }

/** The largest Payload row id: ids are Postgres `integer` (int4). */
export const MAX_ROW_ID = 2147483647

/** A value that can be a row id: an integer from 1 to `MAX_ROW_ID`. A larger one would reach Postgres and fail as `INTERNAL`. */
export const isRowId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_ROW_ID

/** The id of a relation read at any depth; `null` and `undefined` pass through. */
export function idOf(value: number | { id: number }): number
export function idOf(value: number | { id: number } | null): number | null
export function idOf(value: number | { id: number } | null | undefined): number | null | undefined
export function idOf(value: number | { id: number } | null | undefined): number | null | undefined {
  return value == null || typeof value === 'number' ? value : value.id
}
