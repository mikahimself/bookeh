import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ActionResult } from '@/lib/errors'

// `/data/suggest`'s input check: an unknown or missing `field`, or a `q` over
// 200 characters, answers `VALIDATION` without running a query; signed out is
// 401; `q` reaches `suggest()` NFC-normalised.

const ctx = {}
const suggest = vi.fn(async () => [])
const requireUserOrThrow = vi.fn(async () => ctx)
vi.mock('@/lib/payload/context', () => ({ requireUserOrThrow }))
vi.mock('@/lib/shelf/suggest', () => ({ suggest }))

const { GET } = await import('@/app/(frontend)/data/suggest/route')

const respond = (search: string) => GET(new Request(`http://bookeh.test/data/suggest?${search}`))
const answer = async (search: string) =>
  (await (await respond(search)).json()) as ActionResult<unknown>

describe('/data/suggest', () => {
  beforeEach(() => suggest.mockClear())

  it.each(['field=title&q=kivi', 'q=kivi', `field=author&q=${'k'.repeat(201)}`])(
    'answers VALIDATION for %s',
    async (search) => {
      expect(await answer(search)).toEqual({ ok: false, code: 'VALIDATION' })
      expect(suggest).not.toHaveBeenCalled()
    },
  )

  it('answers 401 UNAUTHENTICATED when signed out', async () => {
    const { DomainError } = await import('@/lib/errors')
    requireUserOrThrow.mockRejectedValueOnce(new DomainError('UNAUTHENTICATED'))
    const response = await respond('field=author&q=kivi')

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ ok: false, code: 'UNAUTHENTICATED' })
    expect(suggest).not.toHaveBeenCalled()
  })

  it('passes q to suggest NFC-normalised', async () => {
    expect(await answer('field=author&q=a%CC%88')).toEqual({ ok: true, data: [] })
    expect(suggest).toHaveBeenCalledExactlyOnceWith(ctx, 'author', 'ä')
  })
})
