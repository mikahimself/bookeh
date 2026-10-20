// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Ref } from '@/lib/payload/ref'

vi.mock('next-intl', () => ({
  useLocale: () => 'fi',
  useTranslations: () => (key: string, values?: { name?: string }) =>
    values?.name === undefined ? key : `${key}: ${values.name}`,
}))

const { Combobox } = await import('@/app/(frontend)/components/ui/Combobox')

const PLACES = [
  { id: 1, label: 'Tampere' },
  { id: 2, label: 'Turku' },
]

/** A caller holding the value, as a form does. */
function renderCombobox(options = PLACES, initial: Ref | null = null) {
  const changes: (Ref | null)[] = []
  function Caller() {
    const [value, setValue] = useState<Ref | null>(initial)
    return createElement(Combobox, {
      label: 'Location',
      options,
      value,
      onValueChange: (next: Ref | null) => {
        changes.push(next)
        setValue(next)
      },
    })
  }
  render(createElement(Caller))
  return changes
}

const input = () => screen.getByRole<HTMLInputElement>('combobox', { name: 'Location' })
const optionNames = () => screen.queryAllByRole('option').map((option) => option.textContent)

async function type(text: string) {
  act(() => input().focus())
  // Typed, not autofilled: Base UI opens the popup only on an `inputType`.
  fireEvent.input(input(), { target: { value: text }, inputType: 'insertText' })
  await waitFor(() => expect(screen.getByRole('listbox')).toBeTruthy())
}

async function reopen() {
  act(() => input().focus())
  fireEvent.keyDown(input(), { key: 'ArrowDown' })
  await waitFor(() => expect(screen.getByRole('listbox')).toBeTruthy())
}

describe('Combobox', () => {
  afterEach(() => {
    cleanup()
  })

  it('narrows the options and emits the id of the one chosen', async () => {
    const changes = renderCombobox()
    await type('tu')
    expect(optionNames()).toEqual(['Turku', 'create: tu'])
    fireEvent.click(screen.getByRole('option', { name: 'Turku' }))
    expect(changes).toEqual([2])
    await waitFor(() => expect(input().value).toBe('Turku'))

    await reopen()
    expect(screen.getByRole('option', { name: 'Turku' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('option', { name: 'Tampere' }).getAttribute('aria-selected')).not.toBe(
      'true',
    )
  })

  it('offers the trimmed text as a new name and emits it to be created', async () => {
    const changes = renderCombobox()
    await type(' Oulu ')
    expect(optionNames().at(-1)).toBe('create: Oulu')
    fireEvent.click(screen.getByRole('option', { name: 'create: Oulu' }))
    expect(changes).toEqual([{ create: 'Oulu' }])
    await waitFor(() => expect(input().value).toBe('Oulu'))

    await reopen()
    for (const option of screen.getAllByRole('option')) {
      expect(option.getAttribute('aria-selected')).not.toBe('true')
    }
  })

  it('offers no new name when an option has it in another case', async () => {
    renderCombobox()
    await type('tampere')
    expect(optionNames()).toEqual(['Tampere'])
  })

  it('offers a new name that differs from an option only in its accents', async () => {
    // Not ä: Finnish collation sorts it as a letter of its own, so it would differ even at 'base'.
    renderCombobox([{ id: 1, label: 'Café' }])
    await type('Cafe')
    expect(optionNames()).toContain('create: Cafe')
  })

  it('takes a new name with no options at all', async () => {
    const changes = renderCombobox([])
    await type('Koti')
    expect(optionNames()).toEqual(['create: Koti'])
    fireEvent.click(screen.getByRole('option', { name: 'create: Koti' }))
    expect(changes).toEqual([{ create: 'Koti' }])
  })

  it('shows Clear while a value is set and emits null from it', async () => {
    const changes = renderCombobox(PLACES, 1)
    expect(input().value).toBe('Tampere')
    fireEvent.click(screen.getByRole('button', { name: 'clear' }))
    expect(changes).toEqual([null])
    await waitFor(() => expect(screen.queryByRole('button', { name: 'clear' })).toBeNull())
    expect(input().value).toBe('')
  })
})
