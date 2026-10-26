// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const refresh = vi.fn()
const show = vi.fn()
const createPersonAction = vi.fn()
const mergePersonAction = vi.fn()
const deletePersonAction = vi.fn()

// Key-echo translator that also shows the values, so a test can read what a string was built from.
// `rich` echoes the same: `JSON.stringify` leaves out the tag functions.
vi.mock('next-intl', () => {
  const t = (key: string, values?: Record<string, unknown>) =>
    values ? `${key} ${JSON.stringify(values)}` : key
  return { useTranslations: () => Object.assign(t, { rich: t }) }
})
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ replace: vi.fn(), refresh }),
}))
vi.mock('@/app/(frontend)/(sections)/settings/actions', () => ({
  createPersonAction,
  renamePersonAction: vi.fn(),
  mergePersonAction,
  deletePersonAction,
}))
vi.mock('@/app/(frontend)/components/toast/ToastProvider', () => ({
  useToast: () => ({ show, dismiss: vi.fn(), withdraw: vi.fn() }),
}))

const { installNavigationTracking } = await import('@/app/(frontend)/components/navigation')
const { PeopleGroup } = await import('@/app/(frontend)/(sections)/settings/PeopleGroup')

installNavigationTracking()

const antti = { id: 1, name: 'Antti', loans: 2 }
const leena = { id: 2, name: 'Leena', loans: 0 }

describe('PeopleGroup', () => {
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
    mergePersonAction.mockResolvedValue({ ok: true, data: null })
    deletePersonAction.mockResolvedValue({ ok: true, data: null })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it("Delete on a Person with loans says they can't be deleted and offers Merge instead", async () => {
    render(createElement(PeopleGroup, { people: [antti, leena] }))

    fireEvent.click(screen.getAllByRole('button', { name: 'delete' })[0])
    const blocked = await screen.findByRole('dialog', {
      name: 'personInUseTitle {"name":"Antti"}',
    })
    expect(within(blocked).getByText(/personInUseBody \{"count":2\}/)).toBeTruthy()
    fireEvent.click(within(blocked).getByRole('button', { name: 'merge' }))

    const picker = await screen.findByRole('dialog', {
      name: 'personMergeInto {"name":"Antti"}',
    })
    // Nothing opens on top of a dialog: the in-use dialog is gone before the picker opens.
    expect(screen.queryByRole('dialog', { name: 'personInUseTitle {"name":"Antti"}' })).toBeNull()
    fireEvent.click(within(picker).getByRole('button', { name: 'Leena' }))
    const confirm = await screen.findByRole('dialog', {
      name: 'personMergeTitle {"source":"Antti","target":"Leena"}',
    })
    fireEvent.click(within(confirm).getByRole('button', { name: 'merge' }))

    await waitFor(() => expect(mergePersonAction).toHaveBeenCalledExactlyOnceWith(1, 2))
    expect(deletePersonAction).not.toHaveBeenCalled()
  })

  it('lists each Person with their loans, offers Merge only with another Person, and says when there are none', () => {
    const { rerender } = render(createElement(PeopleGroup, { people: [antti, leena] }))
    expect(screen.getByText('personCount {"count":2}')).toBeTruthy()
    expect(screen.getByText('personCount {"count":0}')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'merge' })).toHaveLength(2)

    rerender(createElement(PeopleGroup, { people: [leena] }))
    expect(screen.queryByRole('button', { name: 'merge' })).toBeNull()
    expect(screen.getByRole('button', { name: 'rename' })).toBeTruthy()

    rerender(createElement(PeopleGroup, { people: [] }))
    expect(screen.getByText('noPeople')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'addPerson' })).toBeTruthy()
  })

  it('drops a blank new Person with no call, and rejects a taken name under the field without a Merge Link', async () => {
    createPersonAction.mockResolvedValue({ ok: false, code: 'NAME_TAKEN', conflictId: antti.id })
    render(createElement(PeopleGroup, { people: [antti] }))

    fireEvent.click(screen.getByRole('button', { name: 'addPerson' }))
    fireEvent.blur(screen.getByLabelText('settings.name'))
    expect(createPersonAction).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'addPerson' }))
    const field = screen.getByLabelText('settings.name')
    fireEvent.change(field, { target: { value: ' antti ' } })
    fireEvent.blur(field)

    expect(await screen.findByText('errors.NAME_TAKEN')).toBeTruthy()
    expect(createPersonAction).toHaveBeenCalledExactlyOnceWith('antti')
    expect(screen.queryByRole('button', { name: 'settings.merge' })).toBeNull()
  })

  it('a Person with loans and no one to merge into gets only Cancel', async () => {
    render(createElement(PeopleGroup, { people: [antti] }))

    fireEvent.click(screen.getByRole('button', { name: 'delete' }))
    const blocked = await screen.findByRole('dialog')
    expect(within(blocked).queryByRole('button', { name: 'merge' })).toBeNull()
    expect(within(blocked).getByRole('button', { name: 'cancel' })).toBeTruthy()
  })

  it.each([
    [{ ok: true, data: null }, false],
    [{ ok: false, code: 'PERSON_IN_USE' }, true],
    [{ ok: false, code: 'NOT_FOUND' }, true],
  ])('a confirmed Delete of an unused Person (%o) refreshes the list', async (result, toast) => {
    deletePersonAction.mockResolvedValue(result)
    render(createElement(PeopleGroup, { people: [antti, leena] }))

    fireEvent.click(screen.getAllByRole('button', { name: 'delete' })[1])
    const dialog = await screen.findByRole('dialog', { name: 'deleteTitle {"name":"Leena"}' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'delete' }))

    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(deletePersonAction).toHaveBeenCalledExactlyOnceWith(leena.id)
    expect(show).toHaveBeenCalledTimes(toast ? 1 : 0)
  })
})
