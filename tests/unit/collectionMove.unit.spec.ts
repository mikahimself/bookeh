// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  book,
  CollectionPage,
  fetchStub,
  getShelfRows,
  listLocations,
  moveCopiesAction,
  renderPage,
  resetCollectionPage,
  router,
  row,
  showToast,
} from '../helpers/collectionPage'

import type { ShelfRows } from '@/lib/shelf/query'

// Select mode's Move.

describe('CollectionPage', () => {
  resetCollectionPage()

  describe('Move', () => {
    const both = {
      rows: [row(11, book(1, 'Sinuhe')), row(12, book(2, 'Kätilö'))],
      total: 2,
      labels: {},
    }
    const selected = () => screen.queryByText(/\d+ selected/)?.textContent
    const tap = (title: string) => fireEvent.click(screen.getByText(title, { selector: 'p' }))
    const reloadsWith = (shelf: ShelfRows) =>
      fetchStub.mockResolvedValue({ status: 200, json: async () => ({ ok: true, data: shelf }) })
    const moved = (id: number, name: string, count: number, skipped: number[] = []) => ({
      ok: true,
      data: {
        location: { id, name },
        count,
        skipped,
        undoToken: `token-${name}`,
        undoSeconds: 1800,
      },
    })
    /** Opens the bar's Move picker, once the last action's reload has let go of the bar. */
    const openMove = async () => {
      const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Move' })
      await waitFor(() => expect(button.disabled).toBe(false))
      fireEvent.click(button)
      return screen.findByRole('dialog', { name: 'Move to' })
    }
    const moveTo = async (name: string) =>
      fireEvent.click(within(await openMove()).getByRole('button', { name }))

    beforeEach(() => {
      listLocations.mockResolvedValue([
        { id: 3, name: 'Kirjahylly' },
        { id: 4, name: 'Mökki' },
      ])
    })

    it('moves every ticked owned copy, to a location or a new one, skipping ordered ones', async () => {
      const page = (params: Record<string, string>) =>
        CollectionPage({ searchParams: Promise.resolve(params) })
      getShelfRows.mockResolvedValueOnce(both)
      const { rerender } = render(await page({}))
      fireEvent.click(screen.getByRole('button', { name: 'Select' }))
      tap('Sinuhe')
      tap('Kätilö')
      getShelfRows.mockResolvedValueOnce({ rows: [both.rows[0]], total: 1, labels: {} })
      rerender(await page({ q: 'sinuhe' }))

      // Bar move: both ids, the toast with Undo, the rows reload without the moved copy.
      moveCopiesAction.mockResolvedValueOnce(moved(4, 'Mökki', 2))
      reloadsWith({ rows: [], total: 0, labels: {} })
      await moveTo('Mökki')
      await waitFor(() => expect(selected()).toBe('0 selected'))
      expect(moveCopiesAction).toHaveBeenCalledExactlyOnceWith({ copyIds: [11, 12], location: 4 })
      expect(showToast).toHaveBeenCalledExactlyOnceWith({
        kind: 'success',
        message: '2 moved to Mökki',
        undo: { token: 'token-Mökki', seconds: 1800 },
      })
      await waitFor(() => expect(screen.queryByText('Sinuhe', { selector: 'p' })).toBeNull())
      // The refresh follows the reload (AD-7).
      await waitFor(() => expect(router.refresh).toHaveBeenCalledOnce())
      screen.getByRole('button', { name: 'Done' })

      // Create inline: the name as typed; the toast names the stored one.
      reloadsWith(both)
      getShelfRows.mockResolvedValueOnce(both)
      rerender(await page({}))
      await waitFor(() => screen.getByText('Sinuhe', { selector: 'p' }))
      tap('Sinuhe')
      moveCopiesAction.mockResolvedValueOnce(moved(5, 'Kellari', 1))
      const picker = await openMove()
      fireEvent.change(within(picker).getByRole('textbox', { name: 'New location' }), {
        target: { value: ' Kellari ' },
      })
      fireEvent.click(within(picker).getByRole('button', { name: 'Move' }))
      await waitFor(() =>
        expect(moveCopiesAction).toHaveBeenLastCalledWith({
          copyIds: [11],
          location: { create: ' Kellari ' },
        }),
      )
      await waitFor(() =>
        expect(showToast).toHaveBeenLastCalledWith({
          kind: 'success',
          message: '1 moved to Kellari',
          undo: { token: 'token-Kellari', seconds: 1800 },
        }),
      )

      // Ordered ticked too: the owned copy moves, the ordered one is skipped and stays ticked.
      await waitFor(() => expect(selected()).toBe('0 selected'))
      tap('Sinuhe')
      tap('Kätilö')
      moveCopiesAction.mockResolvedValueOnce(moved(4, 'Mökki', 1, [12]))
      await moveTo('Mökki')
      await waitFor(() =>
        expect(showToast).toHaveBeenLastCalledWith({
          kind: 'success',
          message: '1 moved to Mökki · 1 ordered skipped',
          undo: { token: 'token-Mökki', seconds: 1800 },
        }),
      )
      await waitFor(() => expect(selected()).toBe('1 selected'))
      expect((screen.getByRole('checkbox', { name: /Kätilö/ }) as HTMLInputElement).checked).toBe(
        true,
      )

      // Nothing owned: nothing moves, no Undo.
      moveCopiesAction.mockResolvedValueOnce({
        ok: true,
        data: { location: null, count: 0, skipped: [12], undoToken: 't0', undoSeconds: 1800 },
      })
      await moveTo('Mökki')
      await waitFor(() =>
        expect(showToast).toHaveBeenLastCalledWith({
          kind: 'success',
          message: 'Nothing moved · 1 ordered skipped',
        }),
      )
      expect(selected()).toBe('1 selected')

      // Gone meanwhile: Not in library, a reload, the ticks cleared.
      const fetches = fetchStub.mock.calls.length
      moveCopiesAction.mockResolvedValueOnce({ ok: false, code: 'NOT_FOUND' })
      await moveTo('Mökki')
      await waitFor(() => expect(selected()).toBe('0 selected'))
      expect(showToast).toHaveBeenLastCalledWith({ kind: 'success', message: 'Not in library' })
      await waitFor(() => expect(fetchStub.mock.calls.length).toBe(fetches + 1))
      // One refresh per `ok` or `NOT_FOUND`, each after its reload.
      await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(5))
    })

    it('closes only the picker on Esc', async () => {
      getShelfRows.mockResolvedValue(both)
      await renderPage()
      fireEvent.click(screen.getByRole('button', { name: 'Select' }))
      tap('Sinuhe')

      const picker = await openMove()
      fireEvent.keyDown(within(picker).getByRole('button', { name: 'Mökki' }), { key: 'Escape' })
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      expect(selected()).toBe('1 selected')
      expect(moveCopiesAction).not.toHaveBeenCalled()
    })
  })
})
