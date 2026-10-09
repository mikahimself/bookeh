import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { compile } from '@tailwindcss/node'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import en from '../../messages/en.json'

let pathname = '/'

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ back: vi.fn(), replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
}))

// The English catalogue, looked up by dotted key under the namespace.
const translator =
  (namespace?: string) =>
  (key: string): string =>
    [...(namespace ? namespace.split('.') : []), ...key.split('.')].reduce<unknown>(
      (node, part) => (node as Record<string, unknown>)[part],
      en,
    ) as string

vi.mock('next-intl', () => ({ useTranslations: translator }))
vi.mock('next-intl/server', () => ({ getTranslations: async (ns?: string) => translator(ns) }))
vi.mock('@/lib/payload/context', () => ({ requireUser: vi.fn(async () => ({})) }))

const { SectionNav } = await import('@/app/(frontend)/components/SectionNav')
const { ActionLink, BackLink, TextLink } = await import('@/app/(frontend)/components/Link')
const { ProgressLine } = await import('@/app/(frontend)/components/ProgressLine')
const { FullScreenTask } = await import('@/app/(frontend)/components/FullScreenTask')
const { default: SectionsLayout } = await import('@/app/(frontend)/(sections)/layout')
const { default: SectionLoading } = await import('@/app/(frontend)/(sections)/loading')
const { ToastProvider } = await import('@/app/(frontend)/components/toast/ToastProvider')
const { requireUser } = await import('@/lib/payload/context')

const base = fileURLToPath(new URL('../../src/app/(frontend)/', import.meta.url))
const source = readFileSync(`${base}styles.css`, 'utf8')

async function build(candidates: string[]): Promise<string> {
  const compiler = await compile(source, { base, onDependency: () => {} })
  return compiler.build(candidates)
}

const empty = await build([])

/** Every class an element tree emits. */
const classes = (html: string) =>
  [...html.matchAll(/class="([^"]*)"/g)].flatMap(([, value]) => value.split(/\s+/).filter(Boolean))

const nav = (at: string) => {
  pathname = at
  return renderToStaticMarkup(createElement(SectionNav))
}

/** The `class` of the first element matching `pattern` (which captures it). */
const classOf = (html: string, pattern: RegExp) => (html.match(pattern)?.[1] ?? '').split(/\s+/)

const textLink = renderToStaticMarkup(createElement(TextLink, { href: '/loans' }, 'Loans'))
const actionLink = renderToStaticMarkup(createElement(ActionLink, null, 'Clear'))
const destructiveLink = renderToStaticMarkup(
  createElement(ActionLink, { destructive: true }, 'Remove'),
)
const backLink = renderToStaticMarkup(createElement(BackLink, { href: '/wishlists' }, 'Wishlists'))
const progress = renderToStaticMarkup(createElement(ProgressLine, { label: 'Loading' }))
const task = renderToStaticMarkup(createElement(FullScreenTask, { title: 'Scan' }))
pathname = '/'
const shell = renderToStaticMarkup(await SectionsLayout({ children: null }))
const loading = renderToStaticMarkup(createElement(SectionLoading))
const toasts = renderToStaticMarkup(createElement(ToastProvider, null, createElement('main')))
const raise =
  'max-wide:peer-has-data-pinned-bottom:bottom-[calc(var(--spacing-pinned-bar)+var(--spacing-4)+env(safe-area-inset-bottom))]'

describe('SectionNav', () => {
  it('leads with the current section as the h1, then links the others in order', () => {
    const html = nav('/loans')
    expect(html).toMatch(/<h1 class="[^"]*">Loans<\/h1>/)
    const links = [...html.matchAll(/<a [^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/g)].map(
      ([, href, text]) => [href, text],
    )
    expect(links).toEqual([
      ['/wishlists', 'Wishlists'],
      ['/settings', 'Settings'],
      ['/', 'Collection'],
    ])
    expect(html.indexOf('<h1')).toBeLessThan(html.indexOf('<a '))
  })

  it('draws the current heading in text and the others in text-dim', () => {
    const html = nav('/')
    expect(classOf(html, /<h1 class="([^"]*)"/)).toEqual(
      expect.arrayContaining(['text-text', 'text-heading-section-phone', 'ui-case']),
    )
    const links = [...html.matchAll(/<a [^>]*class="([^"]*)"/g)].map(([, value]) =>
      value.split(' '),
    )
    expect(links).toHaveLength(3)
    for (const link of links) expect(link).toContain('text-text-dim')
  })

  it('keeps every heading at least a tap high on the phone', () => {
    const html = nav('/')
    const headings = [
      classOf(html, /<h1 class="([^"]*)"/),
      ...[...html.matchAll(/<a [^>]*class="([^"]*)"/g)].map(([, value]) => value.split(' ')),
    ]
    expect(headings).toHaveLength(4)
    for (const heading of headings) expect(heading).toContain('max-wide:min-h-tap')
  })

  it('puts the links in one labelled nav', () => {
    const html = nav('/')
    expect(html).toMatch(/<nav aria-label="Sections"[^>]*>(<a [^>]*>[^<]*<\/a>){3}<\/nav>/)
  })

  it('holds the current name in a polite live region', () => {
    expect(nav('/wishlists/3')).toMatch(/<p aria-live="polite" class="sr-only">Wishlists<\/p>/)
    expect(nav('/')).toMatch(/<p aria-live="polite" class="sr-only">Collection<\/p>/)
  })

  it('never wraps: the row clips and its items keep their width', () => {
    const html = nav('/')
    expect(classes(html)).toEqual(expect.arrayContaining(['overflow-x-clip', 'shrink-0']))
    expect(classes(html)).not.toContain('flex-wrap')
  })
})

describe('Links', () => {
  it.each([
    ['TextLink', textLink],
    ['ActionLink', actionLink],
    ['BackLink', backLink],
  ])('%s draws the accent underline', (_, html) => {
    expect(classes(html)).toEqual(
      expect.arrayContaining([
        'text-text',
        'underline',
        'decoration-2',
        'underline-offset-3',
        'decoration-accent',
        'max-wide:min-h-tap',
        'inline-flex',
        'items-center',
      ]),
    )
  })

  it('ActionLink is a type="button", underlined in danger when destructive', () => {
    expect(actionLink).toMatch(/^<button type="button"/)
    expect(classes(destructiveLink)).toContain('decoration-danger')
    expect(classes(destructiveLink)).not.toContain('decoration-accent')
  })

  it.each([
    ['ActionLink', actionLink],
    ['destructive ActionLink', destructiveLink],
  ])('%s dims label and line when disabled', (_, html) => {
    expect(classes(html)).toEqual(
      expect.arrayContaining(['disabled:text-text-dim', 'disabled:decoration-text-dim']),
    )
  })

  it('TextLink and BackLink are links; BackLink is in meta', () => {
    expect(textLink).toMatch(/^<a [^>]*href="\/loans"/)
    expect(backLink).toMatch(/^<a [^>]*href="\/wishlists"/)
    expect(classes(backLink)).toContain('text-meta')
    expect(classes(textLink)).not.toContain('text-meta')
  })
})

describe('ProgressLine', () => {
  it('is a labelled progressbar: an accent line that stands still under reduce motion', () => {
    expect(progress).toMatch(/^<div role="progressbar" aria-label="Loading"/)
    expect(classes(progress)).toEqual(
      expect.arrayContaining([
        'fixed',
        'top-0',
        'h-stroke-control',
        'bg-accent',
        'animate-progress',
        'motion-reduce:animate-none',
      ]),
    )
  })
})

describe('sections loading', () => {
  it('is the progress line', () => {
    expect(loading).toMatch(/^<div role="progressbar" aria-label="Loading"/)
  })
})

describe('ToastProvider', () => {
  it('raises the toast region above a bar pinned to the bottom of a peer', () => {
    expect(toasts).toMatch(/^<main><\/main><div role="status"/)
    expect(classOf(toasts, /<div role="status" class="([^"]*)"/)).toContain(raise)
  })
})

describe('FullScreenTask', () => {
  it('has the title as h1 and the labelled X after it', () => {
    expect(task).toMatch(/<h1 [^>]*>Scan<\/h1><button type="button" aria-label="Close"/)
    expect(classes(task)).toEqual(
      expect.arrayContaining([
        'fixed',
        'inset-0',
        'overflow-y-auto',
        'bg-background',
        'max-w-task-width',
      ]),
    )
  })
})

describe('sections layout', () => {
  const scanLinks = [...shell.matchAll(/<a [^>]*href="\/scan"[^>]*>([^<]*)<\/a>/g)]

  it('requires a signed-in user', () => {
    expect(requireUser).toHaveBeenCalled()
  })

  it('draws Scan book twice as the primary button, one copy hidden per width', () => {
    expect(scanLinks.map(([, text]) => text)).toEqual(['Scan book', 'Scan book'])
    const [wide, phone] = scanLinks.map(([tag]) => classOf(tag, /class="([^"]*)"/))
    for (const link of [wide, phone]) {
      expect(link).toEqual(expect.arrayContaining(['border-2', 'border-accent', 'ui-case']))
    }
    expect(wide).toEqual(expect.arrayContaining(['hidden', 'wide:inline-flex']))
    expect(phone).toEqual(expect.arrayContaining(['flex', 'w-full']))
  })

  it('pins the phone copy in a bar at the bottom, hidden on wide screens', () => {
    const bar = classOf(
      shell,
      /<div data-pinned-bottom="true" class="([^"]*)"><a [^>]*href="\/scan"/,
    )
    expect(bar).toEqual(
      expect.arrayContaining([
        'sticky',
        'bottom-0',
        'bg-background',
        'px-page-margin-phone',
        'pt-4',
        'wide:hidden',
      ]),
    )
  })
})

describe('shell classes', () => {
  const rendered = [
    shell,
    loading,
    toasts,
    nav('/'),
    textLink,
    actionLink,
    destructiveLink,
    backLink,
    progress,
    task,
  ]
  const all = [...new Set(rendered.flatMap(classes))]

  it.each(all)('%s produces CSS', async (candidate) => {
    expect(await build([candidate])).not.toBe(empty)
  })
})
