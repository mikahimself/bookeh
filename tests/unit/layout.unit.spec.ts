import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { NextIntlClientProvider } from 'next-intl'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { Open_Sans } = vi.hoisted(() => ({
  Open_Sans: vi.fn(() => ({ variable: 'open-sans-var', className: 'x', style: {} })),
}))

// The `bookeh_prefs` value the next render's request carries; `undefined` is no cookie.
let prefsCookie: string | undefined

vi.mock('next/font/google', () => ({ Open_Sans }))
vi.mock('next-intl/server', () => ({ getLocale: async () => 'en' }))
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'bookeh_prefs' && prefsCookie !== undefined
        ? { name, value: prefsCookie }
        : undefined,
  }),
}))

const { default: RootLayout, generateViewport } = await import('../../src/app/(frontend)/layout')
const { ToastProvider } = await import('../../src/app/(frontend)/components/toast/ToastProvider')
const { NavigationTracker } = await import('../../src/app/(frontend)/components/navigation')

const styles = readFileSync(
  fileURLToPath(new URL('../../src/app/(frontend)/styles.css', import.meta.url)),
  'utf8',
)

describe('frontend root layout', () => {
  beforeEach(() => {
    prefsCookie = undefined
  })

  it('loads Open Sans once, at 300 and 400, latin subset, as a CSS variable', () => {
    expect(Open_Sans).toHaveBeenCalledTimes(1)
    expect(Open_Sans).toHaveBeenCalledWith({
      subsets: ['latin'],
      weight: ['300', '400'],
      variable: '--font-open-sans',
    })
  })

  it('puts the font variable class on <html>', async () => {
    const html = (await RootLayout({ children: null })) as ReactElement<{ className?: string }>
    expect(html.type).toBe('html')
    expect(html.props.className).toBe('open-sans-var')
  })

  it('puts the stored theme on <html> as data-theme', async () => {
    prefsCookie = encodeURIComponent(JSON.stringify({ theme: 'dark' }))
    const html = (await RootLayout({ children: null })) as ReactElement<{ 'data-theme'?: string }>
    expect(html.props['data-theme']).toBe('dark')
  })

  it('renders data-theme="system" without the cookie', async () => {
    const html = (await RootLayout({ children: null })) as ReactElement<{ 'data-theme'?: string }>
    expect(html.props['data-theme']).toBe('system')
  })

  it('mounts NavigationTracker and ToastProvider inside NextIntlClientProvider, the toasts wrapping a peer main', async () => {
    type Node = ReactElement<{ children?: Node | Node[]; className?: string }>
    const html = (await RootLayout({ children: null })) as Node
    const body = html.props.children as Node
    expect(body.type).toBe('body')
    const intl = body.props.children as Node
    expect(intl.type).toBe(NextIntlClientProvider)
    const [tracker, toast] = intl.props.children as Node[]
    expect(tracker.type).toBe(NavigationTracker)
    expect(toast.type).toBe(ToastProvider)
    const main = toast.props.children as Node
    expect(main.type).toBe('main')
    // The toast region, a later sibling inside ToastProvider, reads `peer-has-…`.
    expect(main.props.className).toBe('peer')
  })

  describe('generateViewport', () => {
    const light = '#FFFFFF'
    const dark = '#14181D'
    const pair = [
      { media: '(prefers-color-scheme: light)', color: light },
      { media: '(prefers-color-scheme: dark)', color: dark },
    ]
    const cookie = (theme: string) => encodeURIComponent(JSON.stringify({ theme }))

    it.each([
      ['no cookie', undefined, pair],
      ['theme dark', cookie('dark'), dark],
      ['theme light', cookie('light'), light],
      ['theme system', cookie('system'), pair],
      ['a garbage cookie', '%%%', pair],
    ])('gives %s its theme colour, under viewport-fit=cover', async (_, value, themeColor) => {
      prefsCookie = value
      expect(await generateViewport()).toEqual({ viewportFit: 'cover', themeColor })
    })
  })

  it('publishes the variable that styles.css reads for --default-font-family', () => {
    const read = styles.match(/--default-font-family:\s*var\((--[\w-]+)\)/)?.[1]
    const [options] = Open_Sans.mock.calls[0] as unknown as [{ variable: string }]
    expect(read).toBe(options.variable)
  })
})
