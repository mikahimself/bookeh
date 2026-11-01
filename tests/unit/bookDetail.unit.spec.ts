// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  book,
  copy,
  countLine,
  detail,
  ENTRIES,
  fetchStub,
  getHoldings,
  getShelfRows,
  heldBook,
  holds,
  installNavigationTracking,
  linna,
  listLocations,
  moveCopiesAction,
  onWishlists,
  page,
  removeCopiesAction,
  renderPage,
  requireUser,
  resetCollectionPage,
  router,
  row,
  setScreen,
  setSearchParams,
  showToast,
} from '../helpers/collectionPage'

// Book detail over the list, and beside it at 1300px.

describe('CollectionPage', () => {
  resetCollectionPage()

  describe('Book detail', () => {
    it('opens over the list with the header, Your copies and Edit', async () => {
      getShelfRows.mockResolvedValue({ rows: [row(11, linna)], total: 1, labels: {} })
      holds(linna, [
        copy(21, { location: { id: 3, name: 'Tampere' } }),
        copy(22, { status: 'ordered' }),
      ])
      setSearchParams('q=linna&book=5')
      await renderPage({ q: 'linna', book: '5' })

      const sheet = await detail('Tuntematon sotilas')
      within(sheet).getByRole('heading', { name: 'Tuntematon sotilas' })
      expect(
        within(sheet).getByRole('link', { name: 'Sotaromaanit' }).parentElement?.textContent,
      ).toBe('Sotaromaanit 1')
      // Filter chips: each adds its value to the address's filters, without `book` in the sheet.
      const chip = (name: string) => within(sheet).getByRole('link', { name }).getAttribute('href')
      expect(chip('Väinö Linna')).toBe('/?q=linna&author=1')
      expect(chip('Sotaromaanit')).toBe('/?q=linna&series=2')
      expect(chip('Tampere')).toBe('/?q=linna&location=3')
      within(sheet).getByRole('heading', { name: 'Genres' })
      expect(chip('Sotaromaani')).toBe('/?q=linna&genre=8')
      within(sheet).getByText('WSOY · 1954 · 474 pages · Finnish')
      expect(
        within(sheet)
          .getAllByRole('listitem')
          .map((line) => line.querySelector('p')?.textContent),
      ).toEqual(['Tampere · Owned', 'Ordered'])
      expect(within(sheet).getByRole('link', { name: 'Edit' }).getAttribute('href')).toBe(
        '/books/5/edit',
      )
      expect(getHoldings).toHaveBeenCalledWith(expect.anything(), [5])
      // No locations: no Move.
      expect(within(sheet).queryByRole('button', { name: 'Move' })).toBeNull()
      // No entries: no On wishlists group.
      expect(within(sheet).queryByRole('heading', { name: 'On wishlists' })).toBeNull()
    })

    it('lists the open entries under On wishlists, after Your copies', async () => {
      getShelfRows.mockResolvedValue({ rows: [row(11, linna)], total: 1, labels: {} })
      holds(linna, [copy(21)], ENTRIES)
      await renderPage({ book: '5' })

      const sheet = await detail('Tuntematon sotilas')
      const headings = within(sheet)
        .getAllByRole('heading', { level: 3 })
        .map(({ textContent }) => textContent)
      expect(headings.indexOf('On wishlists')).toBe(headings.indexOf('Your copies') + 1)
      expect(
        within(onWishlists(sheet))
          .getAllByRole('listitem')
          .map(({ textContent }) => textContent),
      ).toEqual(['Joululahjat · for Liisa', 'Luettavat'])
      expect(within(onWishlists(sheet)).queryByRole('link')).toBeNull()
    })

    it('opens a Book held only through an entry, with no Your copies', async () => {
      getShelfRows.mockResolvedValue({ rows: [], total: 0, labels: {} })
      holds(linna, [], [ENTRIES[1]!])
      await renderPage({ book: '5' })

      const sheet = await detail('Tuntematon sotilas')
      expect(within(sheet).queryByRole('heading', { name: 'Your copies' })).toBeNull()
      expect(within(onWishlists(sheet)).getByRole('listitem').textContent).toBe('Luettavat')
      within(sheet).getByRole('link', { name: 'Edit' })
      within(sheet).getByRole('button', { name: 'Add to wishlist' })
    })

    it('shows Re-fetch on a shared Book with an ISBN to the admin only', async () => {
      const shared = book(5, 'Tuntematon sotilas', { isbn13: '9789510000000' })
      getShelfRows.mockResolvedValue({ rows: [row(11, shared)], total: 1, labels: {} })
      holds(shared, [copy(21)])

      requireUser.mockResolvedValue({ user: { roles: ['admin', 'user'] } })
      const { unmount } = await renderPage({ book: '5' })
      within(await detail('Tuntematon sotilas')).getByRole('button', { name: 'Re-fetch' })
      unmount()

      requireUser.mockResolvedValue({ user: { roles: ['user'] } })
      await renderPage({ book: '5' })
      expect(
        within(await detail('Tuntematon sotilas')).queryByRole('button', { name: 'Re-fetch' }),
      ).toBeNull()
    })

    it('moves one copy from its line, with Undo', async () => {
      listLocations.mockResolvedValue([
        { id: 3, name: 'Tampere' },
        { id: 4, name: 'Mökki' },
      ])
      getShelfRows.mockResolvedValue({ rows: [row(11, linna)], total: 1, labels: {} })
      holds(linna, [
        copy(21, { location: { id: 3, name: 'Tampere' } }),
        copy(22, { status: 'ordered' }),
      ])
      moveCopiesAction.mockResolvedValue({
        ok: true,
        data: {
          location: { id: 4, name: 'Mökki' },
          count: 1,
          skipped: [],
          undoToken: 't',
          undoSeconds: 1800,
        },
      })
      fetchStub.mockResolvedValue({
        status: 200,
        json: async () => ({ ok: true, data: { rows: [], total: 0, labels: {} } }),
      })
      const { rerender } = await renderPage({ book: '5' })

      const sheet = await detail('Tuntematon sotilas')
      // Only the owned line has Move.
      const [move, ...others] = within(sheet).getAllByRole('button', { name: 'Move' })
      expect(others).toHaveLength(0)
      fireEvent.click(move!)
      const picker = await screen.findByRole('dialog', { name: 'Move to' })
      expect(within(picker).getByRole('button', { pressed: true }).textContent).toBe('Tampere')
      fireEvent.click(within(picker).getByRole('button', { name: 'Mökki' }))

      await waitFor(() =>
        expect(moveCopiesAction).toHaveBeenCalledExactlyOnceWith({ copyIds: [21], location: 4 }),
      )
      await waitFor(() =>
        expect(showToast).toHaveBeenCalledWith({
          kind: 'success',
          message: '1 moved to Mökki',
          undo: { token: 't', seconds: 1800 },
        }),
      )
      // `afterAction`'s refresh, once the rows reloaded.
      await waitFor(() => expect(router.refresh).toHaveBeenCalledOnce())

      // The refresh renders the line anew from the server.
      holds(linna, [
        copy(21, { location: { id: 4, name: 'Mökki' } }),
        copy(22, { status: 'ordered' }),
      ])
      rerender(await page({ book: '5' }))
      await waitFor(() =>
        expect(
          within(sheet)
            .getAllByRole('listitem')
            .map((line) => line.querySelector('p')?.textContent),
        ).toEqual(['Mökki · Owned', 'Ordered']),
      )
    })

    it('opens from a row, pushing, and swaps the Book open, replacing', async () => {
      const other = book(6, 'Sinuhe')
      getShelfRows.mockResolvedValue({
        rows: [row(11, linna), row(12, other)],
        total: 2,
        labels: {},
      })
      const { unmount } = await renderPage({ q: 'a' })
      fireEvent.click(screen.getByRole('link', { name: /Tuntematon sotilas/ }))
      expect(router.push).toHaveBeenCalledWith('/?q=a&book=5', { scroll: false })
      unmount()

      holds(other, [copy(22)])
      await renderPage({ q: 'a', book: '6' })
      await detail('Sinuhe')
      const rowLink = screen.getAllByRole('link', { name: /Tuntematon sotilas/, hidden: true })[0]
      fireEvent.click(rowLink)
      expect(router.replace).toHaveBeenCalledWith('/?q=a&book=5', { scroll: false })
      expect(router.push).toHaveBeenCalledOnce()
    })

    it('toasts Not in library for a Book not held and leaves book', async () => {
      getShelfRows.mockResolvedValue({ rows: [row(11, linna)], total: 1, labels: {} })
      heldBook.mockResolvedValue(undefined)
      await renderPage({ q: 'linna', book: '99' })

      expect(heldBook).toHaveBeenCalledWith(expect.anything(), 99)
      expect(countLine().textContent).toBe('“linna” · 1 book · Clear')
      expect(showToast).toHaveBeenCalledWith({ kind: 'success', message: 'Not in library' })
      expect(router.replace).toHaveBeenCalledWith('/?q=linna', { scroll: false })
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('stays open when its row no longer matches', async () => {
      getShelfRows.mockResolvedValue({
        rows: [row(12, book(7, 'Seitsemän veljestä'))],
        total: 1,
        labels: {},
      })
      holds(linna, [copy(21)])
      await renderPage({ q: 'kivi', book: '5' })

      await detail('Tuntematon sotilas')
      expect(
        screen.getAllByRole('link', { hidden: true }).map((link) => link.getAttribute('href')),
      ).not.toContain('/?q=kivi&book=5')
    })

    it('closes back to the list: history back with an in-app entry, else replacing', async () => {
      installNavigationTracking()
      getShelfRows.mockResolvedValue({ rows: [row(11, linna)], total: 1, labels: {} })
      holds(linna, [copy(21)])
      const close = async () => {
        const sheet = await detail('Tuntematon sotilas')
        fireEvent.click(within(sheet).getByRole('button', { name: 'Close' }))
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      }

      const { unmount } = await renderPage({ q: 'linna', book: '5' })
      await close()
      await waitFor(() =>
        expect(router.replace).toHaveBeenCalledWith('/?q=linna', { scroll: false }),
      )
      expect(router.back).not.toHaveBeenCalled()
      unmount()

      // The row's push: an in-app entry below.
      window.history.pushState(null, '', '/?q=linna&book=5')
      await renderPage({ q: 'linna', book: '5' })
      await close()
      await waitFor(() => expect(router.back).toHaveBeenCalledOnce())
      expect(router.replace).toHaveBeenCalledOnce()
      // Settle the back as the browser would, so later cases start at depth 0.
      act(() => {
        window.history.replaceState(null, '', '/?q=linna')
        window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
      })
      // The close settles a frame after the traversal.
      await act(() => new Promise((resolve) => requestAnimationFrame(resolve)))
    })

    it('a chip closes the sheet onto the list with its filter added, replacing below', async () => {
      installNavigationTracking()
      getShelfRows.mockResolvedValue({ rows: [row(11, linna)], total: 1, labels: {} })
      holds(linna, [copy(21, { location: { id: 3, name: 'Tampere' } })])
      // The row's push: an in-app entry below.
      window.history.pushState(null, '', '/?q=linna&book=5')
      setSearchParams('q=linna&book=5')
      await renderPage({ q: 'linna', book: '5' })

      const sheet = await detail('Tuntematon sotilas')
      fireEvent.click(within(sheet).getByRole('link', { name: 'Tampere' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      await waitFor(() => expect(router.back).toHaveBeenCalledOnce())
      expect(router.replace).not.toHaveBeenCalled()

      // The back lands on the list below; then the chip's address replaces it.
      act(() => {
        window.history.replaceState(null, '', '/?q=linna')
        window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
      })
      await waitFor(() =>
        expect(router.replace).toHaveBeenCalledExactlyOnceWith('/?q=linna&location=3', {
          scroll: false,
        }),
      )
      expect(router.push).not.toHaveBeenCalled()
    })

    describe('beside the list at 1300px', () => {
      const sinuhe = book(6, 'Sinuhe')
      const panel = (name: string) => screen.findByRole('complementary', { name })

      beforeEach(() => {
        // Wide, with room for Filter and Book detail together.
        setScreen((query) => !query.includes('1200px'))
        getShelfRows.mockResolvedValue({
          rows: [row(11, linna), row(12, sinuhe)],
          total: 2,
          labels: {},
        })
        heldBook.mockImplementation(async (_, bookId) =>
          [linna, sinuhe].find((b) => b.bookId === bookId),
        )
        getHoldings.mockImplementation(
          async (_, ids) =>
            new Map(ids.map((id) => [id, { copies: [copy(20 + id)], entries: [] }])),
        )
      })

      it('opens as a panel beside the list, not a dialog', async () => {
        await renderPage({ book: '5' })

        const aside = await panel('Tuntematon sotilas')
        within(aside).getByRole('heading', { name: 'Tuntematon sotilas' })
        within(aside).getByRole('heading', { name: 'Your copies' })
        within(aside).getByRole('link', { name: 'Edit' })
        expect(screen.queryByRole('dialog')).toBeNull()
        // Not hidden from assistive technology: the list stays operable.
        fireEvent.click(screen.getByRole('link', { name: /Sinuhe/ }))
        expect(router.replace).toHaveBeenCalledWith('/?book=6', { scroll: false })
      })

      it('swaps the Book in the same panel without closing', async () => {
        setSearchParams('book=5')
        const { rerender } = await renderPage({ book: '5' })
        const aside = await panel('Tuntematon sotilas')

        setSearchParams('book=6')
        rerender(await page({ book: '6' }))
        expect(await panel('Sinuhe')).toBe(aside)
        within(aside).getByRole('heading', { name: 'Sinuhe' })
        expect(router.back).not.toHaveBeenCalled()
        expect(router.replace).not.toHaveBeenCalled()
      })

      it('closes on X, replacing without book', async () => {
        await renderPage({ q: 'linna', book: '5' })

        fireEvent.click(
          within(await panel('Tuntematon sotilas')).getByRole('button', { name: 'Close' }),
        )
        await waitFor(() =>
          expect(router.replace).toHaveBeenCalledWith('/?q=linna', { scroll: false }),
        )
      })

      it('closes on Esc from a row, not from the search field', async () => {
        await renderPage({ book: '5' })
        await panel('Tuntematon sotilas')

        fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' })
        // The leave runs after the transitions settle, a microtask later.
        await act(async () => {})
        expect(router.replace).not.toHaveBeenCalled()
        fireEvent.keyDown(screen.getByRole('link', { name: /Sinuhe/ }), { key: 'Escape' })
        await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/', { scroll: false }))
      })

      it('closes only the remove dialog on Esc, removing nothing', async () => {
        await renderPage({ book: '5' })
        const aside = await panel('Tuntematon sotilas')

        fireEvent.click(within(aside).getByRole('button', { name: 'Remove' }))
        const dialog = await screen.findByRole('dialog', { name: 'Remove 1 book from library?' })
        fireEvent.keyDown(within(dialog).getByRole('button', { name: 'Cancel' }), {
          key: 'Escape',
        })
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
        await act(async () => {})
        expect(await panel('Tuntematon sotilas')).toBe(aside)
        expect(router.replace).not.toHaveBeenCalled()
        expect(removeCopiesAction).not.toHaveBeenCalled()
      })

      it('closes only the Move picker on Esc, moving nothing', async () => {
        listLocations.mockResolvedValue([{ id: 4, name: 'Mökki' }])
        await renderPage({ book: '5' })
        const aside = await panel('Tuntematon sotilas')

        fireEvent.click(within(aside).getByRole('button', { name: 'Move' }))
        const picker = await screen.findByRole('dialog', { name: 'Move to' })
        fireEvent.keyDown(within(picker).getByRole('button', { name: 'Mökki' }), {
          key: 'Escape',
        })
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
        await act(async () => {})
        expect(await panel('Tuntematon sotilas')).toBe(aside)
        expect(router.replace).not.toHaveBeenCalled()
        expect(moveCopiesAction).not.toHaveBeenCalled()
      })

      it('closes after removing the only copy, and reloads the rows', async () => {
        // The dialog's pop lands here: an entry with no in-app one below, so closing replaces.
        window.history.replaceState(null, '', '/')
        removeCopiesAction.mockResolvedValue({ ok: true, data: { removed: 1, skipped: [] } })
        fetchStub.mockResolvedValue({
          status: 200,
          json: async () => ({ ok: true, data: { rows: [row(12, sinuhe)], total: 1, labels: {} } }),
        })
        await renderPage({ book: '5' })
        const aside = await panel('Tuntematon sotilas')

        fireEvent.click(within(aside).getByRole('button', { name: 'Remove' }))
        const dialog = await screen.findByRole('dialog', { name: 'Remove 1 book from library?' })
        fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))
        await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/', { scroll: false }))
        expect(removeCopiesAction).toHaveBeenCalledExactlyOnceWith([25])
        expect(fetchStub.mock.calls[0]![0]).toMatch(/^\/data\/shelf\?/)
        await waitFor(() => expect(router.refresh).toHaveBeenCalledOnce())
      })

      it('toasts Not in library for a Book not held, with no panel', async () => {
        await renderPage({ book: '99' })

        expect(showToast).toHaveBeenCalledWith({ kind: 'success', message: 'Not in library' })
        expect(router.replace).toHaveBeenCalledWith('/', { scroll: false })
        expect(screen.queryByRole('complementary', { name: /./ })).toBeNull()
      })
    })
  })
})
