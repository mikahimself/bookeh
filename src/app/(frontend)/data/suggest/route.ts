import { DomainError, runRoute } from '@/lib/errors'
import { requireUserOrThrow } from '@/lib/payload/context'
import { SUGGEST_FIELDS, type SuggestField } from '@/lib/shelf/query'
import { suggest } from '@/lib/shelf/suggest'

const MAX_Q = 200

const isField = (value: string | null): value is SuggestField =>
  SUGGEST_FIELDS.some((field) => field === value)

/**
 * Spine, AD-7 and AD-10: `?field=author|series|publisher&q=…` as an
 * `ActionResult<Suggestion[]>` from the signed-in user's collection. Signed
 * out is 401; a missing or unknown `field`, or a `q` over 200 characters, is
 * `VALIDATION`.
 */
export function GET(request: Request): Promise<Response> {
  return runRoute(async () => {
    const ctx = await requireUserOrThrow()
    const params = new URL(request.url).searchParams
    const field = params.get('field')
    const q = params.get('q') ?? ''
    if (!isField(field) || q.length > MAX_Q) throw new DomainError('VALIDATION')
    return suggest(ctx, field, q)
  })
}
