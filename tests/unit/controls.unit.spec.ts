import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { compile } from '@tailwindcss/node'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { Button, type ButtonProps } from '@/app/(frontend)/components/Button'
import { ErrorMessage } from '@/app/(frontend)/components/ErrorMessage'
import { TextField, type TextFieldProps } from '@/app/(frontend)/components/TextField'

const base = fileURLToPath(new URL('../../src/app/(frontend)/', import.meta.url))
const source = readFileSync(`${base}styles.css`, 'utf8')

async function build(candidates: string[]): Promise<string> {
  const compiler = await compile(source, { base, onDependency: () => {} })
  return compiler.build(candidates)
}

const empty = await build([])

const button = (props: Omit<ButtonProps, 'children'>) =>
  renderToStaticMarkup(createElement(Button, props, 'Save'))
const field = (props: TextFieldProps) => renderToStaticMarkup(createElement(TextField, props))

/** Every class an element tree emits. */
const classes = (html: string) =>
  [...html.matchAll(/class="([^"]*)"/g)].flatMap(([, value]) => value.split(/\s+/).filter(Boolean))

const rendered = [
  button({ variant: 'primary' }),
  button({ variant: 'secondary' }),
  button({ variant: 'destructive' }),
  button({ variant: 'primary', disabled: true }),
  field({ label: 'Email' }),
  field({ label: 'Email', error: 'Wrong' }),
  renderToStaticMarkup(createElement(ErrorMessage, null, 'Wrong')),
]

describe('Button', () => {
  it.each([
    ['primary', 'border-accent'],
    ['secondary', 'border-text'],
    ['destructive', 'border-danger'],
  ] as const)('draws the %s outline in %s', (variant, outline) => {
    const html = button({ variant })
    expect(classes(html)).toContain(outline)
    expect(classes(html)).toEqual(
      expect.arrayContaining(['border-2', 'ui-case', 'max-wide:min-h-tap']),
    )
  })

  it('defaults to type="button" and takes another type', () => {
    expect(button({ variant: 'primary' })).toContain('type="button"')
    expect(button({ variant: 'primary', type: 'submit' })).toContain('type="submit"')
  })

  it('dims label and outline when disabled', () => {
    const html = button({ variant: 'primary', disabled: true })
    expect(html).toContain('disabled=""')
    expect(classes(html)).toEqual(
      expect.arrayContaining(['disabled:border-text-dim', 'disabled:text-text-dim']),
    )
  })
})

describe('TextField', () => {
  it('labels the input and has no error state when empty', () => {
    const html = field({ label: 'Email', name: 'email' })
    const label = html.match(/<label for="([^"]+)"/)?.[1]
    expect(label).toBeTruthy()
    expect(html).toMatch(new RegExp(`<input id="${label}" placeholder=" "[^>]* name="email"`))
    expect(html).not.toContain('aria-invalid')
    expect(html).not.toContain('aria-describedby')
    expect(classes(html)).toEqual(
      expect.arrayContaining(['border-text', 'placeholder-shown:border-text-dim']),
    )
  })

  it('marks an error and links its message', () => {
    const html = field({ label: 'Email', error: 'Wrong' })
    expect(html).toContain('aria-invalid="true"')
    const describedBy = html.match(/aria-describedby="([^"]+)"/)?.[1]
    expect(describedBy).toBeTruthy()
    expect(html).toMatch(new RegExp(`<p id="${describedBy}" class="text-meta">Wrong</p>`))
    expect(classes(html)).toContain('border-danger')
    expect(classes(html)).not.toContain('border-text')
  })
})

describe('ErrorMessage', () => {
  it('is an alert led by the danger square', () => {
    const html = renderToStaticMarkup(createElement(ErrorMessage, null, 'Wrong'))
    expect(html).toMatch(/^<p role="alert"[^>]*><span aria-hidden="true" class="[^"]*bg-danger/)
  })
})

describe('control classes', () => {
  const all = [...new Set(rendered.flatMap(classes))]

  it.each(all)('%s produces CSS', async (candidate) => {
    expect(await build([candidate])).not.toBe(empty)
  })
})
