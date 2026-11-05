// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement, type ComponentProps } from 'react'
import { afterEach, expect, it, vi } from 'vitest'

const action = vi.fn()
const show = vi.fn()
const refresh = vi.fn()
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('@/app/(frontend)/(sections)/actions', () => ({ changeBookTagsAction: action }))
vi.mock('@/app/(frontend)/components/request', () => ({
  settleAction: (value: unknown) => value,
  useReportFailure: () => vi.fn(),
}))
vi.mock('@/app/(frontend)/components/toast/ToastProvider', () => ({ useToast: () => ({ show }) }))
vi.mock('@/app/(frontend)/components/TagPicker', () => ({
  TagPicker: (
    props: ComponentProps<typeof import('@/app/(frontend)/components/TagPicker').TagPicker>,
  ) =>
    createElement(
      'div',
      null,
      createElement(
        'button',
        { onClick: () => props.onAdd('tag', { create: 'New label' }) },
        'add',
      ),
      createElement(
        'button',
        { onClick: () => props.onRemove('tag', props.selected.tag![0]) },
        'remove',
      ),
      props.errors?.tag,
    ),
}))
const { DetailTags } = await import('@/app/(frontend)/(sections)/DetailTags')
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

it('uses returned assigned IDs for a second mutation while open and retains inline failures', async () => {
  action
    .mockResolvedValueOnce({
      ok: true,
      data: {
        count: 1,
        tags: [{ id: 42, name: 'New label', kind: 'tag' }],
        undoToken: 'receipt',
        undoSeconds: 1800,
      },
    })
    .mockResolvedValueOnce({ ok: false, code: 'SYSTEM_NAME' })
  render(
    createElement(DetailTags, {
      bookId: 7,
      initial: [],
      options: { tag: [], genre: [], theme: [] },
    }),
  )
  fireEvent.click(screen.getByRole('button', { name: 'add' }))
  await waitFor(() =>
    expect(show).toHaveBeenCalledWith(
      expect.objectContaining({
        undo: { token: 'receipt', seconds: 1800 },
      }),
    ),
  )
  fireEvent.click(screen.getByRole('button', { name: 'remove' }))
  await waitFor(() =>
    expect(action).toHaveBeenLastCalledWith({
      bookId: 7,
      kind: 'tag',
      add: [],
      remove: [42],
    }),
  )
  await waitFor(() => expect(screen.getByText('errors.SYSTEM_NAME')).toBeTruthy())
  expect(refresh).toHaveBeenCalledTimes(1)
})
