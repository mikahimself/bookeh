// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const renameTagAction = vi.fn()
const deleteTagAction = vi.fn()

// Key-echo translator that also shows the values; `rich` echoes the same.
vi.mock('next-intl', () => {
  const t = (key: string, values?: Record<string, unknown>) =>
    values ? `${key} ${JSON.stringify(values)}` : key
  return { useTranslations: () => Object.assign(t, { rich: t }), useLocale: () => 'en' }
})
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/app/(frontend)/(sections)/settings/actions', () => ({
  renameTagAction,
  mergeTagAction: vi.fn(),
  deleteTagAction,
}))
vi.mock('@/app/(frontend)/components/toast/ToastProvider', () => ({
  useToast: () => ({ show: vi.fn(), dismiss: vi.fn(), withdraw: vi.fn() }),
}))

const { installNavigationTracking } = await import('@/app/(frontend)/components/navigation')
const { TagsGroup } = await import('@/app/(frontend)/(sections)/settings/TagsGroup')

installNavigationTracking()

describe('TagsGroup', () => {
  beforeEach(() => {
    window.history.pushState({ page: 'settings' }, '', '/settings')
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        media: query,
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    )
    deleteTagAction.mockResolvedValue({ ok: true, data: null })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('has no Add link, shows the system-name message and states the book count on delete', async () => {
    renameTagAction.mockResolvedValue({
      ok: false,
      code: 'VALIDATION',
      fields: { name: 'SYSTEM_NAME' },
    })
    render(
      createElement(TagsGroup, { kind: 'genre', items: [{ id: 1, name: 'Dekkari', count: 3 }] }),
    )

    expect(screen.queryByText(/add/i)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'rename' }))
    const field = await screen.findByRole('textbox')
    fireEvent.change(field, { target: { value: 'Fantasy' } })
    fireEvent.blur(field)
    expect(await screen.findByText('errors.SYSTEM_NAME')).toBeTruthy()
    fireEvent.keyDown(field, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'delete' }))
    expect(await screen.findByText('tagDeleteBody {"count":3}')).toBeTruthy()
  })
})
