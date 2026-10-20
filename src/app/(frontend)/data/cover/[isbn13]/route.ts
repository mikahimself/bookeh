import { fetchCoverPreview } from '@/lib/catalogue/coverPreview'
import { DomainError, logger } from '@/lib/errors'
import { requireUserOrThrow } from '@/lib/payload/context'

/**
 * Spine, AD-10 and AD-14: the pre-save cover preview, `coverUrl({ isbn13 })`.
 * Sends the signed-in user's recorded cover for the ISBN, fetched and checked
 * on the server; the request supplies nothing but the ISBN. The body is
 * buffered and checked before any byte is sent, and goes out with our own
 * type and `nosniff`, so a source never serves content at this origin. The
 * answer is the status alone (spine, Errors): 401 signed out, 404 without a
 * usable cover, 500 on anything unexpected. Nothing is cached.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ isbn13: string }> },
): Promise<Response> {
  try {
    const ctx = await requireUserOrThrow()
    const { isbn13 } = await params
    const cover = await fetchCoverPreview(ctx, isbn13)
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
    logger().error({ err }, 'Unexpected error in the cover preview')
    return new Response(null, { status: 500 })
  }
}
