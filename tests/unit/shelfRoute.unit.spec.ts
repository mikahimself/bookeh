import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ActionResult } from '@/lib/errors'
import type { ShelfRows } from '@/lib/shelf/query'

// `/data/shelf`'s range check: a missing or out-of-bounds `offset` or `limit`
// answers `VALIDATION` without running the shelf query.

const ctx = { user: { id: 1 } }
const getShelfRows = vi.fn(async (): Promise<ShelfRows> => ({ rows: [], total: 0, labels: {} }))
const requireUserOrThrow = vi.fn(async () => ctx)
vi.mock('@/lib/payload/context', () => ({ requireUserOrThrow }))
vi.mock('@/lib/shelf/getShelfRows', () => ({ getShelfRows }))

const { GET } = await import('@/app/(frontend)/data/shelf/route')

const respond = (search: string) => GET(new Request(`http://bookeh.test/data/shelf?${search}`))
const answer = async (search: string) =>
  (await (await respond(search)).json()) as ActionResult<ShelfRows>

describe('/data/shelf', () => {
  beforeEach(() => getShelfRows.mockClear())

  it.each([
    'offset=0&limit=0',
    'offset=0&limit=1001',
    'offset=-1&limit=50',
    'offset=x&limit=50',
    'offset=1.5&limit=50',
    'offset=0',
    'limit=50',
    'q=linna',
  ])('answers VALIDATION for %s', async (search) => {
    expect(await answer(search)).toEqual({ ok: false, code: 'VALIDATION' })
    expect(getShelfRows).not.toHaveBeenCalled()
  })

  it('reads the shelf query, without book, for the range asked', async () => {
    expect(await answer('q=linna&sort=title&book=7&offset=50&limit=1000')).toEqual({
      ok: true,
      data: { rows: [], total: 0, labels: {} },
    })
    expect(getShelfRows).toHaveBeenCalledWith(
      ctx,
      { q: 'linna', filters: {}, sort: 'title', dir: 'asc' },
      { offset: 50, limit: 1000 },
    )
  })

  it('answers 401 UNAUTHENTICATED when signed out', async () => {
    const { DomainError } = await import('@/lib/errors')
    requireUserOrThrow.mockRejectedValueOnce(new DomainError('UNAUTHENTICATED'))
    const response = await respond('offset=0&limit=50')

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ ok: false, code: 'UNAUTHENTICATED' })
    expect(getShelfRows).not.toHaveBeenCalled()
  })
})
