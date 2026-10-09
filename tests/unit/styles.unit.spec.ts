import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { compile } from '@tailwindcss/node'
import { describe, expect, it } from 'vitest'

const base = fileURLToPath(new URL('../../src/app/(frontend)/', import.meta.url))
const source = readFileSync(`${base}styles.css`, 'utf8')

/** A fresh compiler each time: `build` accumulates candidates across calls. */
async function build(candidates: string[]): Promise<string> {
  const compiler = await compile(source, { base, onDependency: () => {} })
  return compiler.build(candidates)
}

/** The body of the first block opened by `header`, braces balanced. */
function block(css: string, header: string): string {
  const start = css.indexOf(`${header} {`)
  if (start === -1) throw new Error(`No block "${header}"`)
  const open = start + header.length + 1
  let depth = 1
  for (let i = open + 1; i < css.length; i++) {
    if (css[i] === '{') depth++
    if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i)
  }
  throw new Error(`Unclosed block "${header}"`)
}

function declarations(body: string): Record<string, string> {
  return Object.fromEntries(
    [...body.matchAll(/([\w-]+):\s*([^;{}]+);/g)].map(([, name, value]) => [name, value.trim()]),
  )
}

const lower = (tokens: Record<string, string>) =>
  Object.fromEntries(Object.entries(tokens).map(([k, v]) => [k, v.toLowerCase()]))

// DESIGN.md frontmatter, under Tailwind's theme namespaces.
const lightColours = {
  '--color-background': '#FFFFFF',
  '--color-text': '#1F2933',
  '--color-text-muted': '#5F6B78',
  '--color-text-dim': '#87919C',
  '--color-border': '#DDE2E7',
  '--color-accent': '#F0604F',
  '--color-scrim': '#00000033',
  '--color-danger': '#9B1C31',
  '--color-shadow': '#1F293324',
}

const darkColours = {
  '--color-background': '#14181D',
  '--color-text': '#E3E8EE',
  '--color-text-muted': '#94A0AD',
  '--color-text-dim': '#626B76',
  '--color-border': '#2C343D',
  '--color-accent': '#FF8E7F',
  '--color-scrim': '#00000066',
  '--color-danger': '#E0566F',
  '--color-shadow': '#00000073',
}

const role = (
  name: string,
  size: string,
  lineHeight: string,
  weight: string,
  tracking?: string,
) => ({
  [`--text-${name}`]: size,
  [`--text-${name}--line-height`]: lineHeight,
  [`--text-${name}--font-weight`]: weight,
  ...(tracking && { [`--text-${name}--letter-spacing`]: tracking }),
})

const typography = {
  ...role('heading-section', '44px', '1.1', '300', '-0.015em'),
  ...role('heading-section-phone', '38px', '1.1', '300', '-0.015em'),
  ...role('heading-detail', '26px', '1.15', '300'),
  ...role('heading-group', '20px', '1.3', '300'),
  ...role('title', '17px', '1.3', '400'),
  ...role('control', '17px', '1.3', '400'),
  ...role('button', '15px', '1.3', '400'),
  ...role('body', '14px', '1.45', '400'),
  ...role('meta', '13px', '1.4', '400'),
  ...role('label', '12px', '1.3', '400'),
}

const spacing = {
  '--spacing-1': '4px',
  '--spacing-2': '8px',
  '--spacing-3': '12px',
  '--spacing-4': '16px',
  '--spacing-5': '20px',
  '--spacing-6': '24px',
  '--spacing-7': '28px',
  '--spacing-page-margin': '28px',
  '--spacing-page-margin-phone': '20px',
  '--spacing-stroke-hairline': '1px',
  '--spacing-stroke-control': '2px',
  '--spacing-stroke-selection': '4px',
  '--spacing-panel-width': '360px',
  // DESIGN.md, Tap area.
  '--spacing-tap': '44px',
}

// EXPERIENCE.md, Wide.
const breakpoints = { '--breakpoint-wide': '900px' }

const radius = { '--radius': '0px' }

// Not a DESIGN.md token: keeps `p-0`, `inset-0` and the like once `--spacing` is cleared.
const zero = { '--spacing-0': '0px' }

// Defined by `layout.tsx` through `next/font`; preflight reads it.
const font = { '--default-font-family': 'var(--font-open-sans), sans-serif' }

const empty = await build([])

describe('styles.css', () => {
  it('declares every DESIGN.md token with its value, and nothing else', () => {
    const theme = declarations(block(block(empty, '@layer theme'), ':root, :host'))
    expect(theme).toEqual({
      ...lower({ ...lightColours, ...typography, ...spacing, ...breakpoints, ...radius, ...zero }),
      ...font,
    })
  })

  it("points preflight's root font-family at --default-font-family", () => {
    const preflight = declarations(block(block(empty, '@layer base'), 'html, :host'))
    expect(preflight['font-family']).toMatch(/^var\(--default-font-family,/)
  })

  it('sets all nine colours to their dark values under data-theme="dark"', () => {
    const dark = declarations(block(empty, ":root[data-theme='dark']"))
    expect(dark).toEqual({ 'color-scheme': 'dark', ...lower(darkColours) })
  })

  it('sets the same dark values for an OS dark preference unless the theme is light or dark', () => {
    const media = block(empty, '@media (prefers-color-scheme: dark)')
    const system = declarations(
      block(media, ":root:not([data-theme='light'], [data-theme='dark'])"),
    )
    expect(system).toEqual({ 'color-scheme': 'dark', ...lower(darkColours) })
  })

  it('gives the root the ground and text colours and the body the body role', () => {
    // Preflight opens the first base block; ours is the last.
    const base = block(empty.slice(empty.lastIndexOf('@layer base {')), '@layer base')
    expect(declarations(block(base, 'html'))).toEqual({
      'background-color': 'var(--color-background)',
      color: 'var(--color-text)',
      'font-synthesis-weight': 'none',
    })
    expect(declarations(block(base, 'body'))).toEqual({
      'font-size': 'var(--text-body)',
      'line-height': 'var(--tw-leading, var(--text-body--line-height))',
      'font-weight': 'var(--tw-font-weight, var(--text-body--font-weight))',
    })
  })

  it('gives keyboard focus a 2px text outline 3px outside', () => {
    const base = block(empty.slice(empty.lastIndexOf('@layer base {')), '@layer base')
    expect(declarations(block(base, ':focus-visible'))).toEqual({
      'outline-style': 'solid',
      'outline-width': '2px',
      'outline-offset': '3px',
      'outline-color': 'var(--color-text)',
      '--tw-outline-style': 'solid',
    })
  })

  it.each([
    ['bg-accent', 'background-color: var(--color-accent)'],
    ['text-text-muted', 'color: var(--color-text-muted)'],
    ['text-heading-section', 'font-size: var(--text-heading-section)'],
    ['text-heading-section', 'var(--text-heading-section--letter-spacing)'],
    ['p-7', 'padding: var(--spacing-7)'],
    ['px-page-margin', 'padding-inline: var(--spacing-page-margin)'],
    ['w-panel-width', 'width: var(--spacing-panel-width)'],
    ['w-stroke-selection', 'width: var(--spacing-stroke-selection)'],
    ['rounded', 'border-radius: var(--radius)'],
    ['p-0', 'padding: var(--spacing-0)'],
    ['ui-case', 'text-transform: lowercase'],
    ['min-h-tap', 'min-height: var(--spacing-tap)'],
    ['max-wide:min-h-tap', '@media (width < 900px)'],
    ['max-wide:min-h-tap', 'min-height: var(--spacing-tap)'],
    ['wide:p-page-margin', '@media (width >= 900px)'],
    ['outline-offset-3', 'outline-offset: 3px'],
  ])('%s reads its token', async (candidate, expected) => {
    expect(block(await build([candidate]), '@layer utilities')).toContain(expected)
  })

  it.each([
    'bg-blue-500',
    'rounded-lg',
    'shadow-md',
    'font-bold',
    'font-semibold',
    'font-normal',
    'font-light',
    'font-sans',
    'text-xl',
    'leading-tight',
    'tracking-wide',
    'p-8',
    'max-w-md',
    'md:p-1',
  ])('%s produces no CSS', async (candidate) => {
    expect(await build([candidate])).toBe(empty)
  })
})
