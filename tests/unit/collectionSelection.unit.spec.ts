// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  book,
  changeSelectionTagsAction,
  CollectionPage,
  fetchStub,
  getShelfRows,
  removeCopiesAction,
  renderPage,
  resetCollectionPage,
  router,
  row,
  showToast,
  toggleCopiesReadAction,
  tagUse,
} from '../helpers/collectionPage'

import type { ShelfRows } from '@/lib/shelf/query'

// Select mode's Read and Remove bar.

describe('CollectionPage', () => {
  resetCollectionPage()

  describe('Read and Remove in select mode', () => {
    const both = {
      rows: [row(11, book(1, 'Sinuhe')), row(12, book(2, 'Kätilö'))],
      total: 2,
      labels: {},
    }
    const selected = () => screen.queryByText(/\d+ selected/)?.textContent
    const tap = (title: string) => fireEvent.click(screen.getByText(title, { selector: 'p' }))
    const removeButton = () => screen.getByRole('button', { name: 'Remove' }) as HTMLButtonElement
    const readButton = () => screen.getByRole('button', { name: 'Read' }) as HTMLButtonElement
    const toggled = (read: boolean, count: number) => ({
      ok: true,
      data: { read, count, undoToken: `token-${count}`, undoSeconds: 1800 },
    })
    /** The reload after the action: `fetchStub` answers `/data/shelf`. */
    const reloadsWith = (shelf: ShelfRows) =>
      fetchStub.mockResolvedValue({ status: 200, json: async () => ({ ok: true, data: shelf }) })
    const confirm = async (title: string) => {
      fireEvent.click(removeButton())
      const dialog = await screen.findByRole('dialog', { name: title })
      fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    }

    it('toggles read on every ticked copy, in view or not, with Undo, and keeps selecting', async () => {
      const page = (params: Record<string, string>) =>
        CollectionPage({ searchParams: Promise.resolve(params) })
      toggleCopiesReadAction.mockResolvedValueOnce(toggled(true, 2))
      reloadsWith(both)
      getShelfRows.mockResolvedValueOnce(both)
      const { rerender } = render(await page({}))
      fireEvent.click(screen.getByRole('button', { name: 'Select' }))
      expect(readButton().disabled).toBe(true)

      tap('Sinuhe')
      tap('Kätilö')
      getShelfRows.mockResolvedValueOnce({ rows: [both.rows[0]], total: 1, labels: {} })
      rerender(await page({ q: 'sinuhe' }))
      readButton().focus()
      fireEvent.click(readButton())

      await waitFor(() => expect(selected()).toBe('0 selected'))
      expect(toggleCopiesReadAction).toHaveBeenCalledExactlyOnceWith([11, 12])
      expect(showToast).toHaveBeenCalledExactlyOnceWith({
        kind: 'success',
        message: 'Marked 2 read',
        undo: { token: 'token-2', seconds: 1800 },
      })
      await waitFor(() => expect(fetchStub).toHaveBeenCalledOnce())
      expect(fetchStub.mock.calls[0]![0]).toMatch(/^\/data\/shelf\?q=sinuhe&/)
      await waitFor(() =>
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Done' })),
      )
      expect(readButton().disabled).toBe(true)

      toggleCopiesReadAction.mockResolvedValueOnce(toggled(false, 1))
      tap('Sinuhe')
      fireEvent.click(readButton())
      await waitFor(() =>
        expect(showToast).toHaveBeenLastCalledWith({
          kind: 'success',
          message: 'Marked 1 unread',
          undo: { token: 'token-1', seconds: 1800 },
        }),
      )
      expect(toggleCopiesReadAction).toHaveBeenLastCalledWith([11])
    })

    it('keeps the ticks when Read fails, and clears them when a copy is gone', async () => {
      getShelfRows.mockResolvedValue(both)
      reloadsWith({ rows: [both.rows[1]], total: 1, labels: {} })
      await renderPage()
      fireEvent.click(screen.getByRole('button', { name: 'Select' }))
      tap('Sinuhe')

      toggleCopiesReadAction.mockRejectedValueOnce(new TypeError('Failed to fetch'))
      fireEvent.click(readButton())
      await waitFor(() =>
        expect(showToast).toHaveBeenCalledWith({ kind: 'error', code: 'NO_CONNECTION' }),
      )
      expect(selected()).toBe('1 selected')
      expect(fetchStub).not.toHaveBeenCalled()

      toggleCopiesReadAction.mockResolvedValueOnce({ ok: false, code: 'NOT_FOUND' })
      fireEvent.click(readButton())
      await waitFor(() => expect(selected()).toBe('0 selected'))
      expect(showToast).toHaveBeenCalledWith({ kind: 'success', message: 'Not in library' })
      await waitFor(() => expect(screen.queryByText('Sinuhe', { selector: 'p' })).toBeNull())
      expect(fetchStub).toHaveBeenCalledOnce()
    })

    it('asks first, then removes every ticked copy, in view or not, and keeps selecting', async () => {
      const page = (params: Record<string, string>) =>
        CollectionPage({ searchParams: Promise.resolve(params) })
      removeCopiesAction.mockResolvedValue({ ok: true, data: { removed: 2, skipped: [] } })
      reloadsWith({ rows: [], total: 0, labels: {} })
      getShelfRows.mockResolvedValueOnce(both)
      const { rerender } = render(await page({}))
      fireEvent.click(screen.getByRole('button', { name: 'Select' }))
      expect(removeButton().disabled).toBe(true)

      tap('Sinuhe')
      tap('Kätilö')
      fireEvent.click(removeButton())
      const dialog = await screen.findByRole('dialog', { name: 'Remove 2 books from library?' })
      expect(within(dialog).queryByText('Their loans go too.')).toBeNull()
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      expect(removeCopiesAction).not.toHaveBeenCalled()
      expect(selected()).toBe('2 selected')

      getShelfRows.mockResolvedValueOnce({ rows: [both.rows[0]], total: 1, labels: {} })
      rerender(await page({ q: 'sinuhe' }))
      await confirm('Remove 2 books from library?')

      await waitFor(() => expect(selected()).toBe('0 selected'))
      expect(removeCopiesAction).toHaveBeenCalledExactlyOnceWith([11, 12])
      await waitFor(() => expect(screen.queryByText('Sinuhe', { selector: 'p' })).toBeNull())
      expect(fetchStub.mock.calls[0]![0]).toMatch(/^\/data\/shelf\?q=sinuhe&/)
      screen.getByRole('button', { name: 'Done' })
      expect(showToast).not.toHaveBeenCalled()
      // AD-7: the bar's Remove refreshes the server render once the rows reloaded,
      // so Back to the collection finds the cached first page without the removed copies.
      await waitFor(() => expect(router.refresh).toHaveBeenCalledOnce())
    })

    it('says the loans go too when a ticked copy was lent, though out of view', async () => {
      const page = (params: Record<string, string>) =>
        CollectionPage({ searchParams: Promise.resolve(params) })
      const lent = row(12, book(2, 'Kätilö'))
      lent.copy.loan = { loanId: 31, person: { id: 41, name: 'Liisa' }, since: '2026-10-20' }
      getShelfRows.mockResolvedValueOnce({ rows: [both.rows[0]!, lent], total: 2, labels: {} })
      const { rerender } = render(await page({}))
      fireEvent.click(screen.getByRole('button', { name: 'Select' }))
      tap('Sinuhe')
      tap('Kätilö')

      getShelfRows.mockResolvedValueOnce({ rows: [both.rows[0]!], total: 1, labels: {} })
      rerender(await page({ q: 'sinuhe' }))
      await waitFor(() => expect(screen.queryByText('Kätilö', { selector: 'p' })).toBeNull())
      fireEvent.click(removeButton())
      const dialog = await screen.findByRole('dialog', { name: 'Remove 2 books from library?' })
      within(dialog).getByText('Their loans go too.')
    })

    it('skips an ordered copy, which stays ticked, and says so in the toast', async () => {
      getShelfRows.mockResolvedValue({
        rows: [both.rows[0]!, row(12, book(2, 'Kätilö'), 'ordered')],
        total: 2,
        labels: {},
      })
      removeCopiesAction.mockResolvedValue({ ok: true, data: { removed: 1, skipped: [12] } })
      reloadsWith({ rows: [row(12, book(2, 'Kätilö'), 'ordered')], total: 1, labels: {} })
      await renderPage()
      fireEvent.click(screen.getByRole('button', { name: 'Select' }))
      tap('Sinuhe')
      tap('Kätilö')

      await confirm('Remove 2 books from library?')
      await waitFor(() => expect(selected()).toBe('1 selected'))
      expect(removeCopiesAction).toHaveBeenCalledExactlyOnceWith([11, 12])
      expect(showToast).toHaveBeenCalledExactlyOnceWith({
        kind: 'success',
        message: '1 removed · 1 ordered skipped',
      })
      expect((screen.getByRole('checkbox', { name: /Kätilö/ }) as HTMLInputElement).checked).toBe(
        true,
      )
    })

    it('keeps the ticks when the call fails, and clears them when a copy is gone', async () => {
      getShelfRows.mockResolvedValue(both)
      reloadsWith({ rows: [both.rows[1]], total: 1, labels: {} })
      await renderPage()
      fireEvent.click(screen.getByRole('button', { name: 'Select' }))
      tap('Sinuhe')

      removeCopiesAction.mockRejectedValueOnce(new TypeError('Failed to fetch'))
      await confirm('Remove 1 book from library?')
      await waitFor(() =>
        expect(showToast).toHaveBeenCalledWith({ kind: 'error', code: 'NO_CONNECTION' }),
      )
      expect(selected()).toBe('1 selected')
      expect(fetchStub).not.toHaveBeenCalled()

      removeCopiesAction.mockResolvedValueOnce({ ok: false, code: 'NOT_FOUND' })
      await confirm('Remove 1 book from library?')
      await waitFor(() => expect(selected()).toBe('0 selected'))
      expect(showToast).toHaveBeenCalledWith({ kind: 'success', message: 'Not in library' })
      await waitFor(() => expect(screen.queryByText('Sinuhe', { selector: 'p' })).toBeNull())
      expect(fetchStub).toHaveBeenCalledOnce()
    })
  })
  it('tags a selection, preserves failed ticks, clears stale/success ticks and refreshes while keeping select mode', async () => {
    const shelf = {
      rows: [row(11, book(1, 'Sinuhe')), row(12, book(2, 'Kätilö'), 'ordered')],
      total: 2,
      labels: {},
    }
    getShelfRows.mockResolvedValue(shelf)
    fetchStub.mockResolvedValue({ status: 200, json: async () => ({ ok: true, data: shelf }) })
    await renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    const tag = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Tag' })
    expect(tag().disabled).toBe(true)
    fireEvent.click(screen.getByText('Sinuhe', { selector: 'p' }))
    fireEvent.click(screen.getByText('Kätilö', { selector: 'p' }))
    const choose = async () => {
      await waitFor(() =>
        expect(screen.getByRole('combobox', { name: 'Add tag to all' })).toBeTruthy(),
      )
      const input = screen.getByRole('combobox', { name: 'Add tag to all' })
      act(() => input.focus())
      fireEvent.input(input, { target: { value: 'All' }, inputType: 'insertText' })
      fireEvent.keyDown(input, { key: 'ArrowDown' })
      await waitFor(() => expect(screen.getByRole('option', { name: 'New: All' })).toBeTruthy())
      fireEvent.click(screen.getByRole('option', { name: 'New: All' }))
    }
    changeSelectionTagsAction.mockResolvedValueOnce({ ok: false, code: 'NO_CONNECTION' })
    fireEvent.click(tag())
    await choose()
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith({ kind: 'error', code: 'NO_CONNECTION' }),
    )
    expect(screen.getByText('2 selected')).toBeTruthy()
    changeSelectionTagsAction.mockResolvedValueOnce({
      ok: true,
      data: { count: 2, undoToken: 'tags', undoSeconds: 1800 },
    })
    await choose()
    await waitFor(() => expect(screen.getByText('0 selected')).toBeTruthy())
    expect(changeSelectionTagsAction).toHaveBeenLastCalledWith({
      copyIds: [11, 12],
      kind: 'tag',
      add: [{ create: 'All' }],
      remove: [],
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Done' })),
    )
    expect(showToast).toHaveBeenCalledWith({
      kind: 'success',
      message: 'Tagged 2',
      undo: { token: 'tags', seconds: 1800 },
    })
    await waitFor(() => expect(router.refresh).toHaveBeenCalled())
    fireEvent.click(screen.getByText('Sinuhe', { selector: 'p' }))
    changeSelectionTagsAction.mockResolvedValueOnce({ ok: false, code: 'NOT_FOUND' })
    fireEvent.click(tag())
    await choose()
    await waitFor(() => expect(screen.getByText('0 selected')).toBeTruthy())
  })
  it('loads existing private options for every kind and recovers a failed reader through Try again', async () => {
    const shelf = { rows: [row(11, book(1, 'Sinuhe'))], total: 1, labels: {} }
    getShelfRows.mockResolvedValue(shelf)
    tagUse.mockRejectedValueOnce(new Error('reader failed'))
    const view = await renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.click(screen.getByText('Sinuhe', { selector: 'p' }))
    fireEvent.click(screen.getByRole('button', { name: 'Tag' }))
    await waitFor(() => expect(screen.getByText("Couldn't load.")).toBeTruthy())
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(changeSelectionTagsAction).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(router.refresh).toHaveBeenCalledOnce()
    const labels = { tag: 'Shelf', genre: 'History', theme: 'Sea' }
    tagUse.mockImplementation(async (_ctx, kind) => [
      { id: { tag: 5, genre: 6, theme: 7 }[kind], name: labels[kind], copies: 0 },
    ])
    view.rerender(await CollectionPage({ searchParams: Promise.resolve({}) }))
    await waitFor(() => expect(screen.queryByText("Couldn't load.")).toBeNull())
    for (const kind of ['tag', 'genre', 'theme'] as const) {
      fireEvent.click(
        screen.getByRole('button', { name: { tag: 'Tag', genre: 'Genre', theme: 'Theme' }[kind] }),
      )
      const input = screen.getByRole('combobox', { name: `Remove ${kind} from all` })
      act(() => input.focus())
      fireEvent.input(input, { target: { value: labels[kind] }, inputType: 'insertText' })
      await waitFor(() => expect(screen.getByRole('option', { name: labels[kind] })).toBeTruthy())
      fireEvent.keyDown(input, { key: 'Escape' })
    }
    expect(changeSelectionTagsAction).not.toHaveBeenCalled()
  })
})
