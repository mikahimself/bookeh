// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const back = vi.fn()
const show = vi.fn()
const saveManualAction = vi.fn()

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: { location: string }) =>
    values ? `${key}:${values.location}` : key,
}))
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ replace: vi.fn() }),
}))
vi.mock('@/app/(frontend)/components/navigation', () => ({ useTaskBack: () => back }))
vi.mock('@/app/(frontend)/scan/actions', () => ({ saveManualAction }))
vi.mock('@/app/(frontend)/components/toast/ToastProvider', () => ({
  useToast: () => ({ show, dismiss: vi.fn() }),
}))

const { NotFoundForm } = await import('@/app/(frontend)/scan/NotFoundForm')

const ISBN = '9789510397077'

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
const add = () => fireEvent.click(screen.getByRole('button', { name: 'answer.addToLibrary' }))

describe('NotFoundForm', () => {
  afterEach(() => {
    cleanup()
    vi.resetAllMocks()
  })

  it.each([
    ['with an ISBN', ISBN, { isbn13: ISBN }],
    ['without one', null, {}],
  ])(
    'sends the typed text %s, then shows the held toast and goes back',
    async (_, isbn13, extra) => {
      saveManualAction.mockResolvedValue({
        ok: true,
        data: {
          bookId: 1,
          copyId: 2,
          savedTo: { id: 3, name: 'Tampere' },
          undoToken: 't',
          undoSeconds: 1800,
        },
      })
      render(createElement(NotFoundForm, { isbn13, title: '' }))
      type('answer.title', 'Kotiseutu')
      type('answer.author', 'A. Kirjoittaja')
      add()

      await waitFor(() => expect(back).toHaveBeenCalledTimes(1))
      expect(saveManualAction).toHaveBeenCalledWith({
        requestId: expect.any(String),
        title: 'Kotiseutu',
        author: 'A. Kirjoittaja',
        ...extra,
      })
      // No `isbn13: undefined`: the key is left out.
      expect('isbn13' in (saveManualAction.mock.calls[0]![0] as object)).toBe(isbn13 !== null)
      expect(show).toHaveBeenCalledWith({
        kind: 'success',
        message: 'toast.savedTo:Tampere',
        hold: true,
        undo: { token: 't', seconds: 1800 },
      })
    },
  )

  it('marks both missing fields, keeps the text and raises no toast', async () => {
    saveManualAction.mockResolvedValue({
      ok: false,
      code: 'VALIDATION',
      fields: { title: 'VALIDATION', authors: 'VALIDATION' },
    })
    render(createElement(NotFoundForm, { isbn13: null, title: ' ' }))
    add()

    expect(await screen.findByText('answer.titleRequired')).toBeTruthy()
    expect(screen.getByText('answer.authorRequired')).toBeTruthy()
    expect(screen.getByLabelText<HTMLInputElement>('answer.title').value).toBe(' ')
    expect(show).not.toHaveBeenCalled()
    expect(back).not.toHaveBeenCalled()
  })

  it('reports any other failure and clears the marks', async () => {
    saveManualAction.mockResolvedValueOnce({
      ok: false,
      code: 'VALIDATION',
      fields: { title: 'VALIDATION', authors: 'VALIDATION' },
    })
    render(createElement(NotFoundForm, { isbn13: null, title: '' }))
    add()
    expect(await screen.findByText('answer.titleRequired')).toBeTruthy()

    saveManualAction.mockResolvedValueOnce({ ok: false, code: 'SAVE_FAILED' })
    add()

    await waitFor(() => expect(show).toHaveBeenCalledWith({ kind: 'error', code: 'SAVE_FAILED' }))
    expect(back).not.toHaveBeenCalled()
    expect(screen.queryByText('answer.titleRequired')).toBeNull()
    expect(screen.queryByText('answer.authorRequired')).toBeNull()
  })

  it('marks only the missing author', async () => {
    saveManualAction.mockResolvedValue({
      ok: false,
      code: 'VALIDATION',
      fields: { authors: 'VALIDATION' },
    })
    render(createElement(NotFoundForm, { isbn13: null, title: 'Kotiseutu' }))
    add()

    expect(await screen.findByText('answer.authorRequired')).toBeTruthy()
    expect(screen.queryByText('answer.titleRequired')).toBeNull()
  })

  it('marks a too long title as such, keeps the text and focuses Title', async () => {
    saveManualAction.mockResolvedValue({
      ok: false,
      code: 'VALIDATION',
      fields: { title: 'TOO_LONG' },
    })
    const long = 'a'.repeat(501)
    render(createElement(NotFoundForm, { isbn13: null, title: long }))
    type('answer.author', 'A. Kirjoittaja')
    screen.getByLabelText<HTMLInputElement>('answer.author').focus()
    add()

    expect(await screen.findByText('errors.TOO_LONG')).toBeTruthy()
    expect(screen.queryByText('answer.titleRequired')).toBeNull()
    const title = screen.getByLabelText<HTMLInputElement>('answer.title')
    expect(title.value).toBe(long)
    expect(document.activeElement).toBe(title)
    expect(show).not.toHaveBeenCalled()
  })

  it('opens with the title focused', () => {
    render(createElement(NotFoundForm, { isbn13: null, title: '' }))

    expect(document.activeElement).toBe(screen.getByLabelText('answer.title'))
  })

  it('moves to Author on Enter in Title without submitting', () => {
    render(createElement(NotFoundForm, { isbn13: null, title: 'Kotiseutu' }))
    fireEvent.keyDown(screen.getByLabelText('answer.title'), { key: 'Enter' })

    expect(document.activeElement).toBe(screen.getByLabelText('answer.author'))
    expect(saveManualAction).not.toHaveBeenCalled()
  })
})
