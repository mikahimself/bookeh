import { DomainError, runRoute } from '@/lib/errors'
import { requireUserOrThrow } from '@/lib/payload/context'
import { getShelfRows } from '@/lib/shelf/getShelfRows'
import { parseShelfQuery, SHELF_MAX_ROWS } from '@/lib/shelf/query'

/** A whole number written in digits only, or `undefined`. */
const whole = (text: string | null): number | undefined => {
  if (text === null || !/^\d+$/.test(text)) return undefined
  const n = Number(text)
  return Number.isSafeInteger(n) ? n : undefined
}

/**
 * Spine, AD-7 and AD-10: `?<shelf params>&offset=<n>&limit=<n>` as an
 * `ActionResult<ShelfRows>` from the signed-in user's collection; `book` is
 * ignored. Signed out is 401; a missing `offset` or `limit`, an `offset`
 * below 0 or a `limit` outside 1–`SHELF_MAX_ROWS` is `VALIDATION`, before
 * any query runs.
 */
export function GET(request: Request): Promise<Response> {
  return runRoute(async () => {
    const ctx = await requireUserOrThrow()
    const params = new URL(request.url).searchParams
    const offset = whole(params.get('offset'))
    const limit = whole(params.get('limit'))
    if (offset === undefined || limit === undefined || limit < 1 || limit > SHELF_MAX_ROWS) {
      throw new DomainError('VALIDATION')
    }
    const { query } = parseShelfQuery(params)
    return getShelfRows(ctx, query, { offset, limit })
  })
}
