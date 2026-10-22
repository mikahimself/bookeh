// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ActionResult } from '@/lib/errors'
import type { Suggestion } from '@/lib/shelf/query'

// `useSuggestions()` over a stubbed `fetch`: what it asks `/data/suggest`
// for, an older text's late answer dropped, a failure as no suggestions.

// Not under test, and its module pulls in the undo action.
vi.mock('@/app/(frontend)/components/toast/ToastProvider', () => ({ useToast: vi.fn() }))

const { useSuggestions } = await import('@/app/(frontend)/components/suggest')

/** Each request, answered when the test says. */
const requests: { url: string; answer: (body: ActionResult<Suggestion[]>) => void }[] = []
const fetchStub = vi.fn(
  (url: string) =>
    new Promise<Pick<Response, 'json' | 'status'>>((resolve) => {
      requests.push({ url, answer: (body) => resolve({ status: 200, json: async () => body }) })
    }),
)
vi.stubGlobal('fetch', fetchStub)

const kivi: Suggestion = { id: 1, name: 'Aleksis Kivi' }
const kivinen: Suggestion = { id: 2, name: 'Pekka Kivinen' }

const hook = (text: string) =>
  renderHook(({ text }: { text: string }) => useSuggestions('author', text), {
    initialProps: { text },
  })

const answer = async (index: number, body: ActionResult<Suggestion[]>) => {
  await waitFor(() => expect(requests.length).toBeGreaterThan(index))
  await act(async () => requests[index]!.answer(body))
}

describe('useSuggestions', () => {
  afterEach(() => {
    requests.length = 0
    fetchStub.mockClear()
  })

  it('asks for the field and the trimmed text as the route reads them', async () => {
    const { result } = hook(' kivi & co ')
    await answer(0, { ok: true, data: [kivi] })

    const params = new URL(requests[0]!.url, 'http://bookeh.test').searchParams
    expect(params.get('field')).toBe('author')
    expect(params.get('q')).toBe('kivi & co')
    expect(result.current).toEqual([kivi])
  })

  it("answers only for the current text, never an older text's list", async () => {
    const { result, rerender } = hook('ki')
    await answer(0, { ok: true, data: [kivi] })
    expect(result.current).toEqual([kivi])

    rerender({ text: 'kivinen' })
    expect(result.current).toEqual([])
    await waitFor(() => expect(requests).toHaveLength(2))
    rerender({ text: 'kivine' })
    await answer(2, { ok: true, data: [kivi] })
    await act(async () => requests[1]!.answer({ ok: true, data: [kivinen] }))

    expect(result.current).toEqual([kivi])
  })

  it('suggests nothing when the request fails', async () => {
    const { result, rerender } = hook('ki')
    await answer(0, { ok: true, data: [kivi] })
    rerender({ text: 'kivi' })
    await answer(1, { ok: false, code: 'INTERNAL' })

    expect(result.current).toEqual([])
  })
})
