// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement, type ComponentProps } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const { action, show, afterAction } = vi.hoisted(() => ({
  action: vi.fn(),
  show: vi.fn(),
  afterAction: vi.fn(),
}))
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string, values?: { name?: string; count?: number }) =>
    values?.name ? `${key}: ${values.name}` : values?.count ? `${key}: ${values.count}` : key,
}))
vi.mock('@/app/(frontend)/components/ui/Picker', () => ({
  PickerFrame: ({ children }: { children: React.ReactNode }) => children,
}))
vi.mock('@/app/(frontend)/(sections)/actions', () => ({ changeSelectionTagsAction: action }))
vi.mock('@/app/(frontend)/(sections)/ShelfRows', () => ({ useAfterAction: () => afterAction }))
vi.mock('@/app/(frontend)/components/toast/ToastProvider', () => ({ useToast: () => ({ show }) }))
const { SelectionTagPicker } = await import('@/app/(frontend)/(sections)/SelectionTagPicker')
const options = {
  tag: [{ id: 5, name: 'Shelf' }],
  genre: [{ id: 6, name: 'History' }],
  theme: [{ id: 7, name: 'Sea' }],
}
const props = () => ({
  open: true,
  onOpenChange: vi.fn(),
  onClosed: vi.fn(),
  options,
  copyIds: [11, 12, 13],
  pending: false,
  startTransition: (work: () => void) => {
    work()
  },
  onSettled: vi.fn(),
})
const mount = (p: ComponentProps<typeof SelectionTagPicker>) =>
  render(createElement(SelectionTagPicker, p))
const choose = async (label: string, name: string) => {
  const input = screen.getByRole<HTMLInputElement>('combobox', { name: label })
  act(() => input.focus())
  fireEvent.input(input, { target: { value: name }, inputType: 'insertText' })
  await waitFor(() => expect(screen.getByRole('option', { name })).toBeTruthy())
  fireEvent.click(screen.getByRole('option', { name }))
}
beforeEach(() => vi.resetAllMocks())
afterEach(cleanup)

it.each(['tag', 'genre', 'theme'] as const)(
  'adds and removes %s immediately with distinct count and Undo',
  async (kind) => {
    const p = props()
    action.mockResolvedValue({
      ok: true,
      data: { count: 2, undoToken: 'receipt', undoSeconds: 1800 },
    })
    const view = mount(p)
    fireEvent.click(screen.getByRole('button', { name: `tagPicker.${kind}` }))
    await choose(`selectionTags.add.${kind}`, options[kind][0].name)
    await waitFor(() => expect(p.onOpenChange).toHaveBeenCalledWith(false))
    expect(action).toHaveBeenCalledWith({
      copyIds: [11, 12, 13],
      kind,
      add: [options[kind][0].id],
      remove: [],
    })
    expect(show).toHaveBeenCalledWith({
      kind: 'success',
      message: 'tagPicker.tagged: 2',
      undo: { token: 'receipt', seconds: 1800 },
    })
    expect(afterAction).toHaveBeenCalled()
    view.unmount()
    mount(p)
    fireEvent.click(screen.getByRole('button', { name: `tagPicker.${kind}` }))
    await choose(`selectionTags.remove.${kind}`, options[kind][0].name)
    await waitFor(() =>
      expect(action).toHaveBeenLastCalledWith({
        copyIds: [11, 12, 13],
        kind,
        add: [],
        remove: [options[kind][0].id],
      }),
    )
  },
)

it('retains a rejected new name and displays its field error, then retries', async () => {
  const p = props()
  action.mockResolvedValueOnce({ ok: false, code: 'VALIDATION', fields: { tags: 'SYSTEM_NAME' } })
  action.mockResolvedValueOnce({ ok: true, data: { count: 2, undoToken: 'r', undoSeconds: 1800 } })
  mount(p)
  const input = screen.getByRole<HTMLInputElement>('combobox', { name: 'selectionTags.add.tag' })
  act(() => input.focus())
  fireEvent.input(input, { target: { value: 'Reserved' }, inputType: 'insertText' })
  await waitFor(() => expect(screen.getByRole('option', { name: 'create: Reserved' })).toBeTruthy())
  fireEvent.click(screen.getByRole('option', { name: 'create: Reserved' }))
  await waitFor(() => expect(screen.getByText('errors.SYSTEM_NAME')).toBeTruthy())
  expect(input.value).toBe('Reserved')
  expect(p.onOpenChange).not.toHaveBeenCalled()
  expect(afterAction).not.toHaveBeenCalled()
  act(() => input.focus())
  fireEvent.input(input, { target: { value: 'Allowed' }, inputType: 'insertText' })
  expect(screen.queryByText('errors.SYSTEM_NAME')).toBeNull()
  expect(action).toHaveBeenCalledTimes(1)
  await waitFor(() => expect(screen.getByRole('option', { name: 'create: Allowed' })).toBeTruthy())
  fireEvent.click(screen.getByRole('option', { name: 'create: Allowed' }))
  await waitFor(() => expect(p.onOpenChange).toHaveBeenCalledWith(false))
})

it('offers removal only from existing labels and disables every choice while pending or empty', async () => {
  const p = props()
  const view = mount(p)
  const input = screen.getByRole('combobox', { name: 'selectionTags.remove.tag' })
  act(() => input.focus())
  fireEvent.input(input, { target: { value: 'Unknown' } })
  expect(screen.queryByRole('option', { name: 'create: Unknown' })).toBeNull()
  view.rerender(createElement(SelectionTagPicker, { ...p, pending: true }))
  for (const input of screen.getAllByRole('combobox'))
    expect((input as HTMLInputElement).disabled).toBe(true)
  view.rerender(createElement(SelectionTagPicker, { ...p, copyIds: [] }))
  for (const input of screen.getAllByRole('combobox'))
    expect((input as HTMLInputElement).disabled).toBe(true)
  expect(action).not.toHaveBeenCalled()
})

it('guards repeated choices and settles against the sent snapshot across a selection change', async () => {
  let finish!: (value: unknown) => void
  action.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve
    }),
  )
  const p = props()
  const view = mount(p)
  await choose('selectionTags.add.tag', 'Shelf')
  view.rerender(createElement(SelectionTagPicker, { ...p, copyIds: [99] }))
  await choose('selectionTags.remove.tag', 'Shelf')
  expect(action).toHaveBeenCalledTimes(1)
  await act(async () => finish({ ok: false, code: 'NOT_FOUND' }))
  expect(p.onSettled).toHaveBeenCalledWith({ ok: false, code: 'NOT_FOUND' }, [11, 12, 13])
})
