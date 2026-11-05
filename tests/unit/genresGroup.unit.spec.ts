// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const renameGenreAction = vi.fn()
const setGenreNameFiAction = vi.fn()

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
  addGenreAction: vi.fn(),
  renameGenreAction,
  setGenreNameFiAction,
  mergeGenreAction: vi.fn(),
  deleteGenreAction: vi.fn(),
  remapGenresAction: vi.fn(),
}))
vi.mock('@/app/(frontend)/components/toast/ToastProvider', () => ({
  useToast: () => ({ show: vi.fn(), dismiss: vi.fn(), withdraw: vi.fn() }),
}))

const { installNavigationTracking } = await import('@/app/(frontend)/components/navigation')
const { GenresGroup } = await import('@/app/(frontend)/(sections)/settings/GenresGroup')

installNavigationTracking()

describe('GenresGroup', () => {
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
    renameGenreAction.mockResolvedValue({ ok: true, data: null })
    setGenreNameFiAction.mockResolvedValue({ ok: true, data: null })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('marks only genres without a Finnish name, saves only the changed name and states the book count on delete', async () => {
    render(
      createElement(GenresGroup, {
        items: [
          { id: 1, name: 'Crime', nameEn: 'Crime', nameFi: '', count: 3, note: 'noFinnishName' },
          { id: 2, name: 'Dekkari', nameEn: 'Mystery', nameFi: 'Dekkari', count: 1 },
        ],
      }),
    )

    expect(screen.getAllByText(/noFinnishName/)).toHaveLength(1)

    fireEvent.click(screen.getAllByRole('button', { name: 'edit' })[0])
    fireEvent.change(screen.getByRole('textbox', { name: 'nameFinnish' }), {
      target: { value: 'Rikos' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'save' }))
    await waitFor(() => expect(setGenreNameFiAction).toHaveBeenCalledWith(1, 'Rikos'))
    expect(renameGenreAction).not.toHaveBeenCalled()

    fireEvent.click(screen.getAllByRole('button', { name: 'delete' })[0])
    expect(await screen.findByText('genreDeleteBody {"count":3}')).toBeTruthy()
  })
})
