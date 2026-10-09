import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'

const { Open_Sans } = vi.hoisted(() => ({
  Open_Sans: vi.fn(() => ({ variable: 'open-sans-var', className: 'x', style: {} })),
}))

vi.mock('next/font/google', () => ({ Open_Sans }))
vi.mock('next-intl/server', () => ({ getLocale: async () => 'en' }))

const { default: RootLayout } = await import('../../src/app/(frontend)/layout')

const styles = readFileSync(
  fileURLToPath(new URL('../../src/app/(frontend)/styles.css', import.meta.url)),
  'utf8',
)

describe('frontend root layout', () => {
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

  it('publishes the variable that styles.css reads for --default-font-family', () => {
    const read = styles.match(/--default-font-family:\s*var\((--[\w-]+)\)/)?.[1]
    const [options] = Open_Sans.mock.calls[0] as unknown as [{ variable: string }]
    expect(read).toBe(options.variable)
  })
})
