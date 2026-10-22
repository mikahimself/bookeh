// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const router = { replace: vi.fn(), refresh: vi.fn() }
let search = new URLSearchParams()

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => router,
  useSearchParams: () => search,
}))

const { SearchField } = await import('@/app/(frontend)/(sections)/SearchField')

const type = (text: string) =>
  fireEvent.change(screen.getByRole('searchbox', { name: 'collection.search' }), {
    target: { value: text },
  })

describe('SearchField', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('replaces the address 300ms after the last keystroke, keeping the other parameters', () => {
    search = new URLSearchParams('location=3&book=7')
    render(createElement(SearchField))

    type('lin')
    act(() => vi.advanceTimersByTime(200))
    type('linna')
    act(() => vi.advanceTimersByTime(299))
    expect(router.replace).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(1))
    expect(router.replace).toHaveBeenCalledOnce()
    expect(router.replace).toHaveBeenCalledWith('/?q=linna&location=3&book=7', { scroll: false })
  })

  it('removes q for text that is blank after trimming', () => {
    search = new URLSearchParams('q=linna&sort=title')
    render(createElement(SearchField))

    type('  ')
    act(() => vi.advanceTimersByTime(300))
    expect(router.replace).toHaveBeenCalledWith('/?sort=title', { scroll: false })
  })

  it('focuses the search on / on a wide screen, unless focus is in a field', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({ media: query, matches: true })),
    )
    search = new URLSearchParams()
    render(createElement(SearchField))
    const searchbox = screen.getByRole('searchbox', { name: 'collection.search' })

    expect(fireEvent.keyDown(document.body, { key: '/' })).toBe(false)
    expect(document.activeElement).toBe(searchbox)

    searchbox.blur()
    const other = document.body.appendChild(document.createElement('input'))
    other.focus()
    expect(fireEvent.keyDown(other, { key: '/' })).toBe(true)
    expect(document.activeElement).toBe(other)
    other.remove()
  })
})
