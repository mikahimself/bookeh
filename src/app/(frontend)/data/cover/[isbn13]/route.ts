import { fetchCoverPreview } from '@/lib/catalogue/coverPreview'
import { DomainError, logger } from '@/lib/errors'
import { requireUserOrThrow } from '@/lib/payload/context'

/**
 * Spine, AD-10 and AD-14: the pre-save cover preview, `coverUrl({ isbn13,
 * pick })`. Sends the signed-in user's recorded cover for the ISBN's
 * candidate `?pick=` (none: the best), fetched and checked on the server, or
 * served from the bytes the server holds from an earlier fetch
 * (`fetchCoverPreview()`); the request supplies nothing but the ISBN and that
 * index, and a `pick` that is not a non-negative integer is a 404. The body is
 * buffered and checked before any byte is sent, and goes out with our own
 * type and `nosniff`, so a source never serves content at this origin. The
 * answer is the status alone (spine, Errors): 401 signed out, 404 without a
 * usable cover, 429 when a fetch would pass the user's lookup limit (AD-9),
 * 500 on anything unexpected. No HTTP caching: `private, no-store`.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ isbn13: string }> },
): Promise<Response> {
  try {
    const ctx = await requireUserOrThrow()
    const { isbn13 } = await params
    const param = new URL(request.url).searchParams.get('pick')
    if (param !== null && !/^\d+$/.test(param)) return new Response(null, { status: 404 })
    const cover = await fetchCoverPreview(
      ctx,
      isbn13,
      undefined,
      param === null ? 0 : Number(param),
    )
    if (!cover) return new Response(null, { status: 404 })
    return new Response(
      new Uint8Array(cover.bytes.buffer, cover.bytes.byteOffset, cover.bytes.byteLength),
      {
        status: 200,
        headers: {
          'Content-Type': cover.mimeType,
          'Content-Length': String(cover.bytes.length),
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      },
    )
  } catch (err) {
    if (err instanceof DomainError && err.code === 'UNAUTHENTICATED') {
      return new Response(null, { status: 401 })
    }
    if (err instanceof DomainError && err.code === 'RATE_LIMITED') {
      return new Response(null, { status: 429 })
    }
    logger().error({ err }, 'Unexpected error in the cover preview')
    return new Response(null, { status: 500 })
  }
}
