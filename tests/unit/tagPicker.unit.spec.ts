// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string, values?: { name?: string }) =>
    values?.name === undefined ? key : `${key}: ${values.name}`,
}))
vi.mock('@/app/(frontend)/components/ui/Picker', () => ({
  PickerFrame: ({ children }: { children: React.ReactNode }) => children,
}))
const { TagPicker } = await import('@/app/(frontend)/components/TagPicker')
afterEach(cleanup)

it('selects kinds, emits refs and resets a successful addition after the combobox closes', async () => {
  const add = vi.fn(() => true)
  const remove = vi.fn()
  render(
    createElement(TagPicker, {
      open: true,
      onOpenChange: vi.fn(),
      options: { tag: [], genre: [{ id: 5, name: 'History' }], theme: [] },
      selected: { theme: [{ create: 'Sea' }] },
      onAdd: add,
      onRemove: remove,
    }),
  )
  fireEvent.click(screen.getByRole('button', { name: 'genre' }))
  const input = screen.getByRole<HTMLInputElement>('combobox', { name: 'find.genre' })
  act(() => input.focus())
  fireEvent.input(input, { target: { value: 'His' }, inputType: 'insertText' })
  await waitFor(() => expect(screen.getByRole('option', { name: 'History' })).toBeTruthy())
  fireEvent.click(screen.getByRole('option', { name: 'History' }))
  expect(add).toHaveBeenCalledWith('genre', 5)
  await waitFor(() => expect(input.value).toBe(''))
  fireEvent.click(screen.getByRole('button', { name: 'theme' }))
  fireEvent.click(screen.getByRole('button', { name: 'remove: Sea' }))
  expect(remove).toHaveBeenCalledWith('theme', { create: 'Sea' })
})
