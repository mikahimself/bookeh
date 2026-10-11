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

const empty = await build([])

describe('styles.css', () => {
  // DESIGN.md tokens only: a utility off the token set must stay silent, so a
  // stray Tailwind default cannot slip into the product.
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
