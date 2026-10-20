import { logger } from '@/lib/errors'
import { fixtureCover } from '@/lib/metadata/sources/fixture'

/**
 * The fixture source's covers (Story 3.52, e2e only): a generated JPEG when
 * `BOOKEH_SOURCES=fixture` is on and the ISBN's fixture has a cover, 404 in
 * every other case. No sign-in: the server fetches it, through the cover
 * allowlist, which admits this origin only in fixture mode.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ isbn13: string }> },
): Promise<Response> {
  try {
    const { isbn13 } = await params
    const bytes = await fixtureCover(isbn13)
    if (!bytes) return new Response(null, { status: 404 })
    return new Response(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength), {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Length': String(bytes.length),
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (err) {
    logger().error({ err }, 'Unexpected error in the fixture cover')
    return new Response(null, { status: 500 })
  }
}
