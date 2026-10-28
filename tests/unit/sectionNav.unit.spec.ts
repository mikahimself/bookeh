// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// EXPERIENCE.md, Navigation; story 7.11: the headings row on a section root,
// and nothing of it below one, where the page brings its own `h1`.

const pathname = vi.fn(() => '/wishlists')

const english = async () => {
  const { createTranslator } = await vi.importActual<typeof import('next-intl')>('next-intl')
  const { default: messages } = await import('../../messages/en.json')
  return (namespace?: string) =>
    createTranslator({ locale: 'en', messages, namespace: namespace as 'sections' })
}

vi.mock('next-intl', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next-intl')>()),
  useTranslations: await english(),
}))
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: () => pathname(),
}))

const { SectionNav } = await import('@/app/(frontend)/components/SectionNav')

describe('SectionNav', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('shows the current section as the h1 and links to the others on a section root', () => {
    pathname.mockReturnValue('/wishlists')
    render(createElement(SectionNav))

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Wishlists')
    const nav = screen.getByRole('navigation')
    expect([...nav.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual([
      '/settings',
      '/',
      '/loans',
    ])
  })

  it('renders no heading and no navigation below a section root', () => {
    pathname.mockReturnValue('/wishlists/7')
    render(createElement(SectionNav))

    expect(screen.queryByRole('heading')).toBeNull()
    expect(screen.queryByRole('navigation')).toBeNull()
  })
})
