import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { compile } from '@tailwindcss/node'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { CloseButton, type CloseButtonProps } from '@/app/(frontend)/components/CloseButton'
import { ToastView, type ToastViewProps } from '@/app/(frontend)/components/toast/ToastView'

const base = fileURLToPath(new URL('../../src/app/(frontend)/', import.meta.url))
const source = readFileSync(`${base}styles.css`, 'utf8')

async function build(candidates: string[]): Promise<string> {
  const compiler = await compile(source, { base, onDependency: () => {} })
  return compiler.build(candidates)
}

const empty = await build([])

const toast = (props: Partial<ToastViewProps>) =>
  renderToStaticMarkup(
    createElement(ToastView, {
      kind: 'success',
      message: 'Saved',
      closeLabel: 'Close',
      onClose: () => {},
      ...props,
    }),
  )
const close = (props: CloseButtonProps) => renderToStaticMarkup(createElement(CloseButton, props))

/** Every class an element tree emits. */
const classes = (html: string) =>
  [...html.matchAll(/class="([^"]*)"/g)].flatMap(([, value]) => value.split(/\s+/).filter(Boolean))

const rendered = [toast({ kind: 'success' }), toast({ kind: 'error' }), close({ label: 'Close' })]

describe('ToastView', () => {
  it('draws a success with no role of its own in the outlined meta box, message then Close', () => {
    // The provider's persistent role="status" region announces it; a role on
    // the box itself would be inserted together with its content and ignored.
    const html = toast({ kind: 'success', message: 'Saved to Tampere' })
    expect(html).not.toContain('role=')
    expect(html).toContain('<span class="mr-auto">Saved to Tampere</span>')
    expect(html).not.toContain('bg-danger')
    expect(classes(html)).toEqual(
      expect.arrayContaining(['border-2', 'border-text', 'bg-background', 'text-meta']),
    )
    expect(html).toMatch(/<span class="mr-auto">.*<button [^>]*aria-label="Close"/)
  })

  it('announces an error as alert, led by the danger square', () => {
    const html = toast({ kind: 'error', message: 'Didn’t work.' })
    expect(html).toMatch(/^<div role="alert"[^>]*><span aria-hidden="true" class="[^"]*bg-danger/)
    expect(html).not.toContain('role="status"')
  })
})

describe('CloseButton', () => {
  it('is a labelled type="button" with an aria-hidden X of currentColor strokes', () => {
    const html = close({ label: 'Close' })
    expect(html).toMatch(/^<button type="button" aria-label="Close"/)
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('stroke="currentColor"')
    expect(html).toContain('stroke-width="2"')
    expect(classes(html)).toContain('max-wide:min-h-tap')
  })

  it('draws no text', () => {
    expect(close({ label: 'Close' })).not.toMatch(/>[^<>]+</)
  })
})

describe('toast classes', () => {
  const all = [...new Set(rendered.flatMap(classes))]

  it.each(all)('%s produces CSS', async (candidate) => {
    expect(await build([candidate])).not.toBe(empty)
  })
})
