import { NextResponse, type NextRequest } from 'next/server'

import { PATH_HEADER } from '@/lib/payload/pathHeader'

/**
 * Hands pages their own path and search in `PATH_HEADER`, for the
 * `/login?next=` redirect of `requireUser()`. Overwrites any value the client
 * sent and drops the `_rsc` cache-busting parameter.
 */
export function proxy(request: NextRequest) {
  const url = request.nextUrl.clone()
  url.searchParams.delete('_rsc')
  const headers = new Headers(request.headers)
  headers.set(PATH_HEADER, url.pathname + url.search)
  return NextResponse.next({ request: { headers } })
}

// Pages only: not Payload's `/api` and `/admin`, Next.js assets, or files.
export const config = {
  matcher: ['/((?!(?:api|admin)(?:/|$)|_next/static|_next/image|.*\\.[^/]*$).*)'],
}
