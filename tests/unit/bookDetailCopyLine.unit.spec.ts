// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  copy,
  detail,
  ENTRIES,
  fetchStub,
  getShelfRows,
  holds,
  installNavigationTracking,
  lendCopyAction,
  lendingPeople,
  linna,
  openSections,
  receiveCopyAction,
  removeCopiesAction,
  renderPage,
  resetCollectionPage,
  returnLoanAction,
  router,
  row,
  setNoteAction,
  setScreen,
  showToast,
} from '../helpers/collectionPage'

import { helsinkiToday } from '@/lib/loans/dates'

// Book detail's copy lines: note, Remove, Lend, Returned and Received.

installNavigationTracking()

describe('CollectionPage', () => {
  resetCollectionPage()

  describe('Book detail', () => {
    describe('a copy line', () => {
      const note = () => screen.getByRole('textbox', { name: 'Note' }) as HTMLTextAreaElement
      /** The reload after the action: `fetchStub` answers `/data/shelf`. */
      const reloads = () =>
        fetchStub.mockResolvedValue({
          status: 200,
          json: async () => ({ ok: true, data: { rows: [], total: 0, labels: {} } }),
        })
      const confirmRemove = async (sheet: HTMLElement, line = 0) => {
        fireEvent.click(within(sheet).getAllByRole('button', { name: 'Remove' })[line]!)
        const dialog = await screen.findByRole('dialog', { name: 'Remove 1 book from library?' })
        expect(within(dialog).queryByText('Its loans go too.')).toBeNull()
        fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))
      }

      beforeEach(() => {
        getShelfRows.mockResolvedValue({ rows: [row(11, linna)], total: 1, labels: {} })
        // The dialog's pop lands here: an entry with no in-app one below, so closing replaces.
        window.history.replaceState(null, '', '/')
      })

      it('saves the note on blur, and sends nothing when it is unchanged', async () => {
        holds(linna, [copy(21)])
        setNoteAction.mockResolvedValue({ ok: true, data: null })
        reloads()
        await renderPage({ book: '5' })
        await detail('Tuntematon sotilas')

        fireEvent.focus(note())
        fireEvent.blur(note())
        expect(setNoteAction).not.toHaveBeenCalled()

        fireEvent.change(note(), { target: { value: ' signed ' } })
        fireEvent.blur(note())
        await waitFor(() =>
          expect(setNoteAction).toHaveBeenCalledExactlyOnceWith({ copyId: 21, note: 'signed' }),
        )
        await waitFor(() => expect(note().value).toBe('signed'))
        await waitFor(() => expect(fetchStub).toHaveBeenCalledOnce())
        fireEvent.blur(note())
        expect(setNoteAction).toHaveBeenCalledOnce()
      })

      it('keeps the typed note when the save fails, and tries again on the next blur', async () => {
        holds(linna, [copy(21, { note: 'old' })])
        setNoteAction
          .mockResolvedValueOnce({ ok: false, code: 'INTERNAL' })
          .mockResolvedValue({ ok: true, data: null })
        reloads()
        await renderPage({ book: '5' })
        await detail('Tuntematon sotilas')
        expect(note().value).toBe('old')

        fireEvent.change(note(), { target: { value: 'signed' } })
        fireEvent.blur(note())
        await waitFor(() =>
          expect(showToast).toHaveBeenCalledWith({ kind: 'error', code: 'INTERNAL' }),
        )
        expect(note().value).toBe('signed')
        fireEvent.blur(note())
        await waitFor(() => expect(setNoteAction).toHaveBeenCalledTimes(2))
        expect(setNoteAction).toHaveBeenLastCalledWith({ copyId: 21, note: 'signed' })
        // Saved, so unmounting sends nothing into the next case.
        await waitFor(() => expect(fetchStub).toHaveBeenCalledOnce())
      })

      it('removes one of two copies after the dialog and keeps Book detail open', async () => {
        holds(linna, [copy(21), copy(22)])
        removeCopiesAction.mockResolvedValue({ ok: true, data: { removed: 1, skipped: [] } })
        reloads()
        await renderPage({ book: '5' })
        const sheet = await detail('Tuntematon sotilas')

        await confirmRemove(sheet)
        await waitFor(() => expect(router.refresh).toHaveBeenCalledOnce())
        expect(removeCopiesAction).toHaveBeenCalledExactlyOnceWith([21])
        expect(showToast).not.toHaveBeenCalled()
        await detail('Tuntematon sotilas')
        expect(router.replace).not.toHaveBeenCalled()
        expect(router.back).not.toHaveBeenCalled()
      })

      it('shows a lent copy with its borrower and date, and Returned only', async () => {
        holds(linna, [
          copy(21, {
            loan: { loanId: 31, person: { id: 41, name: 'Liisa' }, since: '2026-10-20' },
          }),
        ])
        await renderPage({ book: '5' })
        const sheet = await detail('Tuntematon sotilas')

        within(sheet).getByText('Lent to Liisa since Oct 20, 2026')
        within(sheet).getByRole('button', { name: 'Returned' })
        for (const name of ['Lend', 'Move', 'Remove']) {
          expect(within(sheet).queryByRole('button', { name })).toBeNull()
        }
      })

      describe('Lend', () => {
        const nine = ['Antti', 'Leena', 'Bea', 'Äiti', 'Kalle', 'Ville', 'Aino', 'Eero', 'Olli']
        const lent = (name: string) => ({
          ok: true,
          data: { loanId: 31, person: { id: 41, name }, undoToken: 'tok', undoSeconds: 1800 },
        })
        const openPicker = async (frame = detail) => {
          holds(linna, [copy(21, { location: { id: 3, name: 'Tampere' } })])
          reloads()
          await renderPage({ book: '5' })
          const sheet = await frame('Tuntematon sotilas')
          fireEvent.click(within(sheet).getByRole('button', { name: 'Lend' }))
          return screen.findByRole('dialog', { name: 'Lend' })
        }

        it('shows six People and Find a person, and lends to the marked one with Undo', async () => {
          lendingPeople.mockResolvedValue(nine.map((name, i) => ({ id: 40 + i, name })))
          lendCopyAction.mockResolvedValue(lent('Antti'))
          const picker = await openPicker()

          within(picker).getByText('Tuntematon sotilas · Tampere')
          const rows = within(picker).getAllByRole('button', { pressed: false })
          expect(rows.map((row) => row.textContent)).toEqual(nine.slice(0, 6))
          within(picker).getByRole('button', { name: 'Find a person…' })
          const lend = within(picker).getByRole('button', { name: 'Lend' })
          expect(lend).toHaveProperty('disabled', true)

          fireEvent.click(within(picker).getByRole('button', { name: 'Antti' }))
          expect(lend).toHaveProperty('disabled', false)
          fireEvent.click(lend)

          await waitFor(() => expect(router.refresh).toHaveBeenCalledOnce())
          expect(lendCopyAction).toHaveBeenCalledExactlyOnceWith({
            copyId: 21,
            person: 40,
            lentOn: helsinkiToday(),
          })
          expect(showToast).toHaveBeenCalledExactlyOnceWith({
            kind: 'success',
            message: 'Lent to Antti',
            undo: { token: 'tok', seconds: 1800 },
          })
        })

        describe('on a wide screen', () => {
          beforeEach(() => {
            setScreen((query) => query.includes('900px'))
          })

          it('has Lend in the Dialog foot, disabled until a person is marked', async () => {
            lendingPeople.mockResolvedValue([{ id: 40, name: 'Antti' }])
            lendCopyAction.mockResolvedValue(lent('Antti'))
            // Book detail is the panel from 900px.
            const picker = await openPicker(async (name) =>
              openSections(await screen.findByRole('complementary', { name })),
            )

            const lend = within(picker).getByRole('button', { name: 'Lend' })
            const cancel = within(picker).getByRole('button', { name: 'Cancel' })
            expect(lend.parentElement).toBe(cancel.parentElement)
            expect(lend).toHaveProperty('disabled', true)

            fireEvent.click(within(picker).getByRole('button', { name: 'Antti' }))
            expect(lend).toHaveProperty('disabled', false)
            fireEvent.click(lend)

            await waitFor(() => expect(router.refresh).toHaveBeenCalledOnce())
            expect(lendCopyAction).toHaveBeenCalledExactlyOnceWith({
              copyId: 21,
              person: 40,
              lentOn: helsinkiToday(),
            })
            expect(showToast).toHaveBeenCalledExactlyOnceWith({
              kind: 'success',
              message: 'Lent to Antti',
              undo: { token: 'tok', seconds: 1800 },
            })
          })
        })

        it('finds any of the People in the Combobox and lends to the one chosen', async () => {
          lendingPeople.mockResolvedValue(nine.map((name, i) => ({ id: 40 + i, name })))
          lendCopyAction.mockResolvedValue(lent('Olli'))
          const picker = await openPicker()

          fireEvent.click(within(picker).getByRole('button', { name: 'Find a person…' }))
          const person = await within(picker).findByRole('combobox', { name: 'Person' })
          await waitFor(() => expect(document.activeElement).toBe(person))
          fireEvent.keyDown(person, { key: 'ArrowDown' })
          await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(9))
          expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(nine)

          fireEvent.click(screen.getByRole('option', { name: 'Olli' }))
          expect(within(picker).queryByRole('button', { pressed: true })).toBeNull()
          fireEvent.click(within(picker).getByRole('button', { name: 'Lend' }))
          await waitFor(() =>
            expect(lendCopyAction).toHaveBeenCalledExactlyOnceWith({
              copyId: 21,
              person: 48,
              lentOn: helsinkiToday(),
            }),
          )
          await waitFor(() => expect(router.refresh).toHaveBeenCalledOnce())
        })

        it('sends a typed name and keeps the picker open on a field error', async () => {
          lendCopyAction
            .mockResolvedValueOnce({
              ok: false,
              code: 'VALIDATION',
              fields: { lentOn: 'VALIDATION' },
            })
            .mockResolvedValueOnce({
              ok: false,
              code: 'VALIDATION',
              fields: { person: 'TOO_LONG' },
            })
          const picker = await openPicker()

          fireEvent.change(within(picker).getByLabelText('New person'), {
            target: { value: 'Liisa' },
          })
          fireEvent.click(within(picker).getByRole('button', { name: 'Lend' }))
          await within(picker).findByText("Can't be later than today.")
          expect(lendCopyAction).toHaveBeenCalledWith(
            expect.objectContaining({ copyId: 21, person: { create: 'Liisa' } }),
          )

          // The error shows before the lend's transition lets go of the button.
          const lend = within(picker).getByRole<HTMLButtonElement>('button', { name: 'Lend' })
          await waitFor(() => expect(lend.disabled).toBe(false))
          fireEvent.click(lend)
          const tooLong = await within(picker).findByText('Too long.')
          expect(within(picker).getByLabelText('New person').getAttribute('aria-describedby')).toBe(
            tooLong.id,
          )
          expect(picker.isConnected).toBe(true)
          expect(showToast).not.toHaveBeenCalled()
          fireEvent.click(within(picker).getByRole('button', { name: 'Close' }))
          await waitFor(() => expect(picker.isConnected).toBe(false))
        })
      })

      it('returns a lent copy with a toast that undoes it', async () => {
        holds(linna, [
          copy(21, {
            loan: { loanId: 31, person: { id: 41, name: 'Liisa' }, since: '2026-10-20' },
          }),
        ])
        returnLoanAction.mockResolvedValue({
          ok: true,
          data: { loanId: 31, undoToken: 'tok', undoSeconds: 1800 },
        })
        reloads()
        await renderPage({ book: '5' })
        const sheet = await detail('Tuntematon sotilas')

        fireEvent.click(within(sheet).getByRole('button', { name: 'Returned' }))
        await waitFor(() => expect(router.refresh).toHaveBeenCalledOnce())
        expect(returnLoanAction).toHaveBeenCalledExactlyOnceWith({ loanId: 31 })
        expect(showToast).toHaveBeenCalledExactlyOnceWith({
          kind: 'success',
          message: 'Returned',
          undo: { token: 'tok', seconds: 1800 },
        })
      })

      it('closes Book detail after removing the last copy, and reloads the rows', async () => {
        holds(linna, [copy(21)])
        removeCopiesAction.mockResolvedValue({ ok: true, data: { removed: 1, skipped: [] } })
        reloads()
        await renderPage({ book: '5' })
        const sheet = await detail('Tuntematon sotilas')

        await confirmRemove(sheet)
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
        await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/', { scroll: false }))
        expect(removeCopiesAction).toHaveBeenCalledExactlyOnceWith([21])
        expect(fetchStub.mock.calls[0]![0]).toMatch(/^\/data\/shelf\?/)
        // `afterAction`'s one refresh, after the reload; the line itself refreshes nothing.
        await waitFor(() => expect(router.refresh).toHaveBeenCalledOnce())
        expect(showToast).not.toHaveBeenCalled()
      })

      it('keeps Book detail open after removing the only copy while an entry remains', async () => {
        holds(linna, [copy(21)], [ENTRIES[1]!])
        removeCopiesAction.mockResolvedValue({ ok: true, data: { removed: 1, skipped: [] } })
        reloads()
        await renderPage({ book: '5' })
        const sheet = await detail('Tuntematon sotilas')

        await confirmRemove(sheet)
        await waitFor(() => expect(router.refresh).toHaveBeenCalledOnce())
        expect(removeCopiesAction).toHaveBeenCalledExactlyOnceWith([21])
        await waitFor(() =>
          expect(document.activeElement).toBe(
            within(sheet).getByRole('button', { name: /^On wishlists/ }),
          ),
        )
        expect(router.replace).not.toHaveBeenCalled()
        expect(router.back).not.toHaveBeenCalled()
        expect(sheet.isConnected).toBe(true)
      })

      it('receives an ordered copy with a toast that undoes it, and refreshes Book detail', async () => {
        holds(linna, [copy(21, { status: 'ordered' })])
        receiveCopyAction.mockResolvedValue({
          ok: true,
          data: { savedTo: { id: 3, name: 'Olohuone' }, undoToken: 'tok', undoSeconds: 1800 },
        })
        reloads()
        await renderPage({ book: '5' })
        const sheet = await detail('Tuntematon sotilas')

        fireEvent.click(within(sheet).getByRole('button', { name: 'Received' }))
        await waitFor(() => expect(router.refresh).toHaveBeenCalledOnce())
        expect(receiveCopyAction).toHaveBeenCalledExactlyOnceWith({ copyId: 21 })
        expect(showToast).toHaveBeenCalledExactlyOnceWith({
          kind: 'success',
          message: 'Saved to Olohuone',
          undo: { token: 'tok', seconds: 1800 },
        })
      })

      it('refreshes Book detail when the copy is gone already', async () => {
        holds(linna, [copy(21), copy(22)])
        removeCopiesAction.mockResolvedValue({ ok: false, code: 'NOT_FOUND' })
        reloads()
        await renderPage({ book: '5' })
        const sheet = await detail('Tuntematon sotilas')

        await confirmRemove(sheet)
        await waitFor(() => expect(router.refresh).toHaveBeenCalledOnce())
        expect(showToast).toHaveBeenCalledExactlyOnceWith({
          kind: 'success',
          message: 'Not in library',
        })
      })
    })
  })
})
