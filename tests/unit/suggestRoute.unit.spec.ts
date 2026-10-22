import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ActionResult } from '@/lib/errors'

// `/data/suggest`'s input check: an unknown or missing `field`, or a `q` over
// 200 characters, answers `VALIDATION` without running a query.

const suggest = vi.fn(async () => [])
vi.mock('@/lib/payload/context', () => ({ requireUserOrThrow: async () => ({}) }))
vi.mock('@/lib/shelf/suggest', () => ({ suggest }))

const { GET } = await import('@/app/(frontend)/data/suggest/route')

const answer = async (search: string) =>
  (await (
    await GET(new Request(`http://bookeh.test/data/suggest?${search}`))
  ).json()) as ActionResult<unknown>

describe('/data/suggest', () => {
  beforeEach(() => suggest.mockClear())

  it.each(['field=title&q=kivi', 'q=kivi', `field=author&q=${'k'.repeat(201)}`])(
    'answers VALIDATION for %s',
    async (search) => {
      expect(await answer(search)).toEqual({ ok: false, code: 'VALIDATION' })
      expect(suggest).not.toHaveBeenCalled()
    },
  )
})
