// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createElement, type ComponentProps, type MouseEvent } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const router = { replace: vi.fn(), push: vi.fn() }
let search = new URLSearchParams()
let pathname = '/'
let sheetChip: ((href: string) => void) | null = null

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useSearchParams: () => search,
}))
vi.mock('@/app/(frontend)/(sections)/BookDetailSheet', () => ({ useSheetChip: () => sheetChip }))
// Next's Link: navigates unless the click handler prevented it.
vi.mock('next/link', () => ({
  default: ({
    href,
    replace,
    scroll,
    prefetch: _prefetch,
    onClick,
    ...rest
  }: ComponentProps<'a'> & {
    href: string
    replace?: boolean
    scroll?: boolean
    prefetch?: boolean
  }) =>
    createElement('a', {
      ...rest,
      href,
      onClick: (event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event)
        if (event.defaultPrevented) return
        event.preventDefault()
        router[replace ? 'replace' : 'push'](href, { scroll })
      },
    }),
}))

const { FilterChip } = await import('@/app/(frontend)/(sections)/FilterChip')

const chip = (field: 'author' | 'location', id: number) =>
  render(
    // `children` comes as the argument after props.
    createElement(FilterChip, { field, id } as ComponentProps<typeof FilterChip>, 'Väinö Linna'),
  )
const link = () => screen.getByRole('link', { name: 'Väinö Linna' })

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  sheetChip = null
  pathname = '/'
  search = new URLSearchParams()
})

describe('a Filter chip', () => {
  it('in the wide panel widens the field and keeps the open Book, replacing', () => {
    search = new URLSearchParams('q=linna&author=3&book=5')
    chip('author', 7)
    expect(link().getAttribute('href')).toBe('/?q=linna&author=3&author=7&book=5')

    fireEvent.click(link())
    expect(router.replace).toHaveBeenCalledWith('/?q=linna&author=3&author=7&book=5', {
      scroll: false,
    })
  })

  it('in the phone sheet hands the address without the Book to the sheet and does not navigate', () => {
    const close = vi.fn()
    sheetChip = close
    search = new URLSearchParams('genre=2&book=5')
    chip('location', 4)

    fireEvent.click(link())
    expect(close).toHaveBeenCalledWith('/?location=4&genre=2')
    expect(router.replace).not.toHaveBeenCalled()
    expect(router.push).not.toHaveBeenCalled()
  })

  it("off the collection opens it with only the chip's filter and no Book, pushing", () => {
    pathname = '/loans'
    // Not shelf params on `/loans`; the chip ignores them all the same.
    search = new URLSearchParams('author=3&book=5')
    chip('author', 7)
    expect(link().getAttribute('href')).toBe('/?author=7')
    fireEvent.click(link())
    expect(router.push).toHaveBeenCalledWith('/?author=7', { scroll: undefined })
    expect(router.replace).not.toHaveBeenCalled()
    cleanup()

    const close = vi.fn()
    sheetChip = close
    chip('author', 7)
    fireEvent.click(link())
    expect(close).toHaveBeenCalledWith('/?author=7')
    expect(router.push).toHaveBeenCalledOnce()
  })
})
