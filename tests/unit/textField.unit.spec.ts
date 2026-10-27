// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createElement, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>()
  const { default: messages } = await import('../../messages/en.json')
  return {
    ...actual,
    useTranslations: (namespace?: string) =>
      actual.createTranslator({ locale: 'en', messages, namespace: namespace as 'field' }),
  }
})

const { TextField } = await import('@/app/(frontend)/components/TextField')

describe('Text field clear X', () => {
  afterEach(cleanup)

  it('empties a controlled field through its onChange and keeps focus in it', async () => {
    const seen: string[] = []
    function Controlled() {
      const [value, setValue] = useState('Muumipappa ja meri')
      return createElement(TextField, {
        label: 'Title',
        value,
        onChange: (event) => {
          seen.push(event.target.value)
          setValue(event.target.value)
        },
      })
    }
    render(createElement(Controlled))

    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Clear field: Title' })),
    )

    const input = screen.getByLabelText('Title')
    expect(seen).toEqual([''])
    expect(input).toHaveProperty('value', '')
    expect(document.activeElement).toBe(input)
  })
})
