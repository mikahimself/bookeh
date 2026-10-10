import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { compile } from '@tailwindcss/node'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import en from '../../messages/en.json'

const profile = { email: 'mika@example.fi', displayName: 'Mika', language: 'fi' as const }
const prefsCookie = encodeURIComponent(JSON.stringify({ theme: 'dark' }))

// The English catalogue, looked up by dotted key under the namespace.
const translator =
  (namespace?: string) =>
  (key: string): string =>
    [...(namespace ? namespace.split('.') : []), ...key.split('.')].reduce<unknown>(
      (node, part) => (node as Record<string, unknown>)[part],
      en,
    ) as string

vi.mock('next/navigation', () => ({
  usePathname: () => '/settings',
  useRouter: () => ({ back: vi.fn(), replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (name === 'bookeh_prefs' ? { name, value: prefsCookie } : undefined),
  }),
}))
vi.mock('next-intl', () => ({ useTranslations: translator }))
vi.mock('next-intl/server', () => ({ getTranslations: async (ns?: string) => translator(ns) }))
vi.mock('@/lib/payload/context', () => ({
  requireUser: vi.fn(async () => ({ user: { id: 1 } })),
}))
vi.mock('@/lib/account/profile', () => ({ getProfile: vi.fn(async () => profile) }))
vi.mock('@/app/(frontend)/actions/account', () => ({
  signOutAction: vi.fn(),
  updateProfileAction: vi.fn(),
}))
vi.mock('@/app/(frontend)/actions/prefs', () => ({ setDevicePrefsAction: vi.fn() }))
vi.mock('@/app/(frontend)/components/toast/ToastProvider', () => ({
  useToast: () => ({ show: vi.fn(), dismiss: vi.fn() }),
}))

const { default: SettingsPage } = await import('@/app/(frontend)/(sections)/settings/page')
const { requireUser } = await import('@/lib/payload/context')
const { getProfile } = await import('@/lib/account/profile')

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

const html = renderToStaticMarkup(await SettingsPage())

/** The buttons of the group labelled `label`, as `[text, pressed]`. */
const options = (label: string) => {
  const group = html.match(new RegExp(`<div role="group" aria-label="${label}"[^>]*>(.*?)</div>`))
  return [...(group?.[1] ?? '').matchAll(/<button ([^>]*)>([^<]*)<\/button>/g)].map(
    ([, attrs, text]) => [text, /aria-pressed="true"/.test(attrs)] as const,
  )
}

describe('settings page', () => {
  it('requires a signed-in user and reads their profile through the service', () => {
    expect(requireUser).toHaveBeenCalled()
    expect(getProfile).toHaveBeenCalledWith({ user: { id: 1 } })
  })

  it('heads the groups Profile, Language, Theme in that order', () => {
    const headings = [...html.matchAll(/<h2 class="([^"]*)">([^<]*)<\/h2>/g)]
    expect(headings.map(([, , text]) => text)).toEqual(['Profile', 'Language', 'Theme'])
    for (const [, cls] of headings) {
      expect(cls.split(' ')).toEqual(
        expect.arrayContaining(['text-heading-group', 'text-text-muted', 'ui-case']),
      )
    }
  })

  it('prefills the display name field', () => {
    const label = html.match(/<label for="([^"]+)"[^>]*>Display name<\/label>/)?.[1]
    expect(label).toBeTruthy()
    expect(html).toMatch(new RegExp(`<input [^>]*id="${label}"[^>]* value="Mika"`))
    expect(html).not.toContain('aria-invalid')
  })

  it('shows the email as text, in no input, and has no password field', () => {
    expect(html).toMatch(
      /<p class="text-label text-text-muted">Email<\/p><p class="text-control text-text">mika@example\.fi<\/p>/,
    )
    const inputs = [...html.matchAll(/<input [^>]*>/g)].map(([tag]) => tag)
    expect(inputs).toHaveLength(1)
    expect(inputs[0]).not.toContain('mika@example.fi')
    expect(html).not.toContain('type="password"')
  })

  it('draws the two switches with the stored option pressed', () => {
    expect(options('Language')).toEqual([
      ['English', false],
      ['Suomi', true],
    ])
    expect(options('Theme')).toEqual([
      ['Light', false],
      ['Dark', true],
      ['System', false],
    ])
  })

  it('ends the first column with Sign out as the secondary button', () => {
    const signOut = html.match(/<button [^>]*class="([^"]*)"[^>]*>Sign out<\/button>/)
    expect(signOut?.[1].split(' ')).toEqual(expect.arrayContaining(['border-2', 'border-text']))
    expect(html.lastIndexOf('role="group"')).toBeLessThan(html.indexOf('>Sign out<'))
    // Nothing after the first column: the second is left to later stories.
    expect(html).toMatch(/Sign out<\/button><\/div><\/div><\/div>$/)
  })

  it('is a two-column grid on wide screens, padded by the page margin', () => {
    const outer = html.match(/^<div class="([^"]*)"/)?.[1]?.split(' ')
    expect(outer).toEqual(
      expect.arrayContaining([
        'px-page-margin-phone',
        'wide:px-page-margin',
        'wide:grid',
        'wide:grid-cols-2',
      ]),
    )
    expect(html).toMatch(/^<div class="[^"]*"><div class="[^"]*max-w-panel-width/)
  })
})

describe('settings classes', () => {
  const all = [...new Set(classes(html))]

  it.each(all)('%s produces CSS', async (candidate) => {
    expect(await build([candidate])).not.toBe(empty)
  })
})
