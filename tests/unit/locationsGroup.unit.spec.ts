// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const refresh = vi.fn()
const renameLocationAction = vi.fn()
const mergeLocationAction = vi.fn()
const deleteLocationAction = vi.fn()

// Key-echo translator that also shows the values, so a test can read what a string was built from.
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key} ${JSON.stringify(values)}` : key,
}))
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ replace: vi.fn(), refresh }),
}))
vi.mock('@/app/(frontend)/(sections)/settings/actions', () => ({
  createLocationAction: vi.fn(),
  renameLocationAction,
  mergeLocationAction,
  deleteLocationAction,
}))
vi.mock('@/app/(frontend)/components/toast/ToastProvider', () => ({
  useToast: () => ({ show: vi.fn(), dismiss: vi.fn(), withdraw: vi.fn() }),
}))

const { installNavigationTracking } = await import('@/app/(frontend)/components/navigation')
const { LocationsGroup } = await import('@/app/(frontend)/(sections)/settings/LocationsGroup')

installNavigationTracking()

const alpha = { id: 1, name: 'Alpha', count: 2 }
const beta = { id: 2, name: 'Beta', count: 5 }

describe('LocationsGroup', () => {
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
    mergeLocationAction.mockResolvedValue({ ok: true, data: null })
    deleteLocationAction.mockResolvedValue({ ok: true, data: null })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('a rename onto a used name offers Merge, which merges the renamed one into it', async () => {
    renameLocationAction.mockResolvedValue({ ok: false, code: 'NAME_TAKEN', conflictId: beta.id })
    render(createElement(LocationsGroup, { locations: [alpha, beta] }))

    fireEvent.click(screen.getAllByRole('button', { name: 'rename' })[0])
    const field = screen.getByLabelText('settings.locationName')
    fireEvent.change(field, { target: { value: 'beta' } })
    fireEvent.blur(field)

    fireEvent.click(await screen.findByRole('button', { name: 'settings.merge' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'merge' }))

    await waitFor(() => expect(mergeLocationAction).toHaveBeenCalledExactlyOnceWith(1, 2))
  })

  it('Delete states how many books lose their location', async () => {
    render(createElement(LocationsGroup, { locations: [{ ...alpha, count: 3 }] }))

    fireEvent.click(screen.getByRole('button', { name: 'delete' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('deleteBody {"count":3}')).toBeTruthy()
  })
})
