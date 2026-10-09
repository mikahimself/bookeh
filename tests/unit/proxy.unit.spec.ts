import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server'
import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'

import { PATH_HEADER } from '@/lib/payload/pathHeader'
import { config, proxy } from '@/proxy'

// `NextResponse.next({ request: { headers } })` marks each forwarded request
// header as `x-middleware-request-<name>` on the response.
const forwarded = (response: Response) =>
  response.headers.get(`x-middleware-request-${PATH_HEADER}`)

describe('proxy', () => {
  it('forwards the path and search without _rsc', () => {
    const response = proxy(new NextRequest('http://localhost/settings?a=1&_rsc=x'))
    expect(forwarded(response)).toBe('/settings?a=1')
  })

  it('forwards a path without search as is', () => {
    expect(forwarded(proxy(new NextRequest('http://localhost/')))).toBe('/')
    expect(forwarded(proxy(new NextRequest('http://localhost/books?_rsc=x')))).toBe('/books')
  })

  it('overwrites a value the client sent', () => {
    const request = new NextRequest('http://localhost/settings', {
      headers: { [PATH_HEADER]: '//evil.example' },
    })
    expect(forwarded(proxy(request))).toBe('/settings')
  })

  it('does not send the header back to the client', () => {
    const response = proxy(new NextRequest('http://localhost/settings'))
    expect(response.headers.get(PATH_HEADER)).toBeNull()
  })

  it.each([
    ['/', true],
    ['/settings', true],
    ['/books/12', true],
    ['/apiary', true],
    ['/administration', true],
    ['/api', false],
    ['/api/users', false],
    ['/admin', false],
    ['/admin/collections/users', false],
    ['/_next/static/chunk.js', false],
    ['/_next/image', false],
    ['/favicon.ico', false],
    ['/media/cover.jpg', false],
  ])('matches %s: %s', (url, expected) => {
    expect(unstable_doesMiddlewareMatch({ config, url })).toBe(expected)
  })
})
