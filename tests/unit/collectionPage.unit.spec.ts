// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  DEFAULT_PREFS,
  book,
  CollectionPage,
  countLine,
  devicePrefs,
  fetchStub,
  getShelfRows,
  lentRow,
  logError,
  page,
  pressed,
  readingNow,
  renderPage,
  resetCollectionPage,
  router,
  row,
  setDevicePrefsAction,
  setSearchParams,
} from '../helpers/collectionPage'
import en from '../../messages/en.json'

// The collection list: rows, layout, select mode and its empty and failed states.

describe('CollectionPage', () => {
  resetCollectionPage()

  it('shows the tools, the count and one row per copy in shelf order', async () => {
    getShelfRows.mockResolvedValue({
      rows: [
        row(11, book(1, 'Tuntematon sotilas'), 'owned', { id: 2, name: 'Tampere' }),
        row(12, book(2, 'Täällä Pohjantähden alla 1', { year: null })),
        row(13, book(2, 'Täällä Pohjantähden alla 1', { year: null }), 'ordered'),
      ],
      total: 3,
      labels: {},
    })
    await renderPage()

    screen.getByRole('searchbox', { name: 'Search your books' })
    expect(countLine().textContent).toBe('3 books')
    const items = screen.getAllByRole('listitem')
    expect(items.map((item) => item.querySelector('p')?.textContent)).toEqual([
      'Tuntematon sotilas',
      'Täällä Pohjantähden alla 1',
      'Täällä Pohjantähden alla 1',
    ])
    within(items[0]).getByText('Väinö Linna · 1954 · WSOY')
    within(items[0]).getByText('Tampere')
    within(items[1]).getByText('Väinö Linna · WSOY')
    // Owned with no location: no ending.
    expect(items[1].textContent?.endsWith('Väinö Linna · WSOY')).toBe(true)
    within(items[2]).getByText('Ordered')
  })

  it('ends a lent row with the marker and its borrower, an ordered one with Ordered, a read-in-progress one with Reading', async () => {
    const tampere = { id: 2, name: 'Tampere' }
    const tuntematon = book(1, 'Tuntematon sotilas')
    getShelfRows.mockResolvedValue({
      rows: [
        lentRow(row(11, tuntematon, 'owned', tampere)),
        row(12, book(2, 'Sinuhe'), 'owned', tampere),
        lentRow(row(13, book(3, 'Seitsemän veljestä'), 'ordered')),
        lentRow(row(14, book(4, 'Taikatalvi'))),
        row(15, tuntematon, 'owned', tampere),
        row(16, tuntematon, 'ordered'),
      ],
      total: 6,
      labels: {},
    })
    // Books 1 and 3 are being read; 2 and 4 are not.
    readingNow.mockResolvedValue([
      { book: tuntematon, since: '2026-10-21' },
      { book: book(3, 'Seitsemän veljestä'), since: '2026-11-03' },
    ])
    await renderPage()

    const items = screen.getAllByRole('listitem').filter((item) => !item.closest('section'))
    expect(items[0].textContent?.endsWith('Lent · Antti')).toBe(true)
    expect(within(items[0]).queryByText('Tampere')).toBeNull()
    expect(items[1].textContent?.endsWith('Tampere')).toBe(true)
    expect(items[2].textContent?.endsWith('Ordered')).toBe(true)
    expect(within(items[2]).queryByText(/Lent/)).toBeNull()
    expect(items[3].textContent?.endsWith('Lent · Antti')).toBe(true)
    expect(items[4].textContent?.endsWith('Reading')).toBe(true)
    expect(within(items[4]).queryByText('Tampere')).toBeNull()
    expect(items[5].textContent?.endsWith('Ordered')).toBe(true)

    // Select mode keeps the ending beside the checkbox.
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    const ticking = screen.getAllByRole('listitem')
    within(ticking[0]).getByRole('checkbox')
    expect(ticking[0].textContent?.endsWith('Lent · Antti')).toBe(true)
  })

  it('lists the Books being read above the count line, oldest first, and hides them in select mode', async () => {
    getShelfRows.mockResolvedValue({ rows: [row(11, book(1, 'Sinuhe'))], total: 1, labels: {} })
    readingNow.mockResolvedValue([
      { book: book(2, 'Tuntematon sotilas'), since: '2026-10-21' },
      { book: book(3, 'Taikatalvi'), since: '2026-11-03' },
    ])
    await renderPage()

    const strip = screen.getByRole('region', { name: 'Currently reading' })
    expect(
      within(strip)
        .getAllByRole('listitem')
        .map((item) => item.querySelector('p')?.textContent),
    ).toEqual(['Tuntematon sotilas', 'Taikatalvi'])
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    expect(screen.queryByRole('region', { name: 'Currently reading' })).toBeNull()
  })

  it('logs a failed read of the Books being read and renders the list without the strip', async () => {
    getShelfRows.mockResolvedValue({
      rows: [row(11, book(1, 'Sinuhe'), 'owned', { id: 2, name: 'Tampere' })],
      total: 1,
      labels: {},
    })
    readingNow.mockRejectedValue(new Error('down'))
    await renderPage()

    expect(logError).toHaveBeenCalledOnce()
    expect(screen.queryByRole('region', { name: 'Currently reading' })).toBeNull()
    expect(screen.getByRole('listitem').textContent?.endsWith('Tampere')).toBe(true)
  })

  it("shows a lent tile's borrower", async () => {
    devicePrefs.mockResolvedValue({ ...DEFAULT_PREFS, layout: 'covers' })
    getShelfRows.mockResolvedValue({
      rows: [
        lentRow(row(11, book(1, 'Tuntematon sotilas'))),
        lentRow(row(12, book(2, 'Sinuhe'), 'ordered')),
      ],
      total: 2,
      labels: {},
    })
    await renderPage()

    const [lent, ordered] = screen.getAllByRole('listitem')
    within(lent).getByText('Lent · Antti')
    expect(within(ordered).queryByText(/Lent/)).toBeNull()
    within(ordered).getByText('Ordered')
  })

  it('starts the list over for a new query, and keeps the rows held when only book changes', async () => {
    const answer = (copyId: number, title: string) =>
      getShelfRows.mockResolvedValueOnce({
        rows: [row(copyId, book(copyId, title))],
        total: 1,
        labels: {},
      })
    const titles = () =>
      screen
        .getAllByRole('listitem')
        .filter((item) => !item.closest('[role="dialog"]'))
        .map((item) => item.querySelector('p')?.textContent)

    answer(1, 'Seitsemän veljestä')
    const { rerender } = render(await page({ q: 'kivi' }))
    expect(titles()).toEqual(['Seitsemän veljestä'])

    answer(2, 'Tuntematon sotilas')
    rerender(await page({ q: 'linna' }))
    expect(titles()).toEqual(['Tuntematon sotilas'])

    answer(3, 'Sinuhe')
    rerender(await page({ q: 'linna', book: '7' }))
    expect(titles()).toEqual(['Tuntematon sotilas'])
  })

  it('renders the layout and size from the device preferences on first paint', async () => {
    devicePrefs.mockResolvedValue({ ...DEFAULT_PREFS, layout: 'covers', size: 's' })
    getShelfRows.mockResolvedValue({
      rows: [row(11, book(1, 'Tuntematon sotilas'))],
      total: 1,
      labels: {},
    })
    await renderPage()

    expect(pressed('Layout')).toBe('Covers')
    expect(pressed('Size')).toBe('S')
    const [tile] = screen.getAllByRole('listitem')
    within(tile).getByText('Tuntematon sotilas', { selector: 'p' })
    within(tile).getByText('Väinö Linna')
    expect(within(tile).queryByText(/· 1954 · WSOY/)).toBeNull()
  })

  it('switches layout and size at once, saves each, and fetches nothing', async () => {
    setDevicePrefsAction.mockResolvedValue({ ok: true, data: null })
    getShelfRows.mockResolvedValue({
      rows: [row(11, book(1, 'Tuntematon sotilas'))],
      total: 1,
      labels: {},
    })
    await renderPage()
    within(screen.getByRole('listitem')).getByText('Väinö Linna · 1954 · WSOY')

    fireEvent.click(screen.getByRole('button', { name: 'L' }))
    const item = screen.getByRole('listitem')
    within(item).getByText('Väinö Linna')
    within(item).getByText('1954 · WSOY')
    fireEvent.click(screen.getByRole('button', { name: 'Covers' }))
    await act(async () => {})

    expect(setDevicePrefsAction.mock.calls).toEqual([[{ size: 'l' }], [{ layout: 'covers' }]])
    expect(pressed('Layout')).toBe('Covers')
    expect(pressed('Size')).toBe('L')
    within(screen.getByRole('listitem')).getByText('Väinö Linna', { selector: 'p' })
    expect(fetchStub).not.toHaveBeenCalled()
  })

  it('returns the switch and the list to the stored layout when the save fails', async () => {
    setDevicePrefsAction.mockResolvedValue({ ok: false, code: 'NO_CONNECTION' })
    getShelfRows.mockResolvedValue({
      rows: [row(11, book(1, 'Tuntematon sotilas'))],
      total: 1,
      labels: {},
    })
    await renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Covers' }))
    await act(async () => {})

    expect(pressed('Layout')).toBe('Rows')
    within(screen.getByRole('listitem')).getByText('Väinö Linna · 1954 · WSOY')
  })

  it('ticks copies in select mode, keeps them across queries, and clears on Done or Esc', async () => {
    const page = (params: Record<string, string>) =>
      CollectionPage({ searchParams: Promise.resolve(params) })
    const both = {
      rows: [row(11, book(1, 'Sinuhe')), row(12, book(2, 'Kätilö'))],
      total: 2,
      labels: {},
    }
    const box = (title: string) => screen.getByRole('checkbox', { name: new RegExp(title) })
    const selected = () => screen.queryByText(/\d+ selected/)?.textContent
    const tap = (title: string) => screen.getByText(title, { selector: 'p' })

    getShelfRows.mockResolvedValueOnce(both)
    const { rerender } = render(await page({}))
    expect(screen.queryByRole('checkbox')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    expect(screen.getAllByRole('checkbox')).toHaveLength(2)
    expect(selected()).toBe('0 selected')
    // No locations: no Move.
    expect(screen.queryByRole('button', { name: 'Move' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Select' })).toBeNull()

    fireEvent.click(tap('Sinuhe'))
    expect((box('Sinuhe') as HTMLInputElement).checked).toBe(true)
    expect(selected()).toBe('1 selected')
    fireEvent.click(tap('Sinuhe'))
    expect((box('Sinuhe') as HTMLInputElement).checked).toBe(false)
    expect(selected()).toBe('0 selected')
    fireEvent.click(tap('Sinuhe'))
    fireEvent.click(tap('Kätilö'))
    expect(selected()).toBe('2 selected')

    getShelfRows.mockResolvedValueOnce({ rows: [both.rows[0]], total: 1, labels: {} })
    rerender(await page({ q: 'sinuhe' }))
    expect(screen.queryByText('Kätilö')).toBeNull()
    expect(selected()).toBe('2 selected')

    getShelfRows.mockResolvedValueOnce(both)
    rerender(await page({}))
    expect((box('Kätilö') as HTMLInputElement).checked).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(selected()).toBeUndefined()

    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    expect(selected()).toBe('0 selected')
    fireEvent.click(tap('Sinuhe'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('checkbox')).toBeNull()
    screen.getByRole('button', { name: 'Select' })
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('ticks a cover tile in select mode', async () => {
    devicePrefs.mockResolvedValue({ ...DEFAULT_PREFS, layout: 'covers' })
    getShelfRows.mockResolvedValue({ rows: [row(11, book(1, 'Sinuhe'))], total: 1, labels: {} })
    await renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.click(screen.getByText('Sinuhe', { selector: 'p' }))
    expect((screen.getByRole('checkbox', { name: /Sinuhe/ }) as HTMLInputElement).checked).toBe(
      true,
    )
    screen.getByText('1 selected')
  })

  it('closes Book detail on entering select mode', async () => {
    setSearchParams({ sort: 'title', book: '5' })
    getShelfRows.mockResolvedValue({ rows: [row(11, book(1, 'Sinuhe'))], total: 1, labels: {} })
    await renderPage({ sort: 'title', book: '5' })

    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    expect(router.replace).toHaveBeenCalledWith('/?sort=title', { scroll: false })
    expect(router.back).not.toHaveBeenCalled()
  })

  it('shows First run with no copies', async () => {
    getShelfRows.mockResolvedValue({ rows: [], total: 0, labels: {} })
    await renderPage()

    expect(countLine().textContent).toBe('0 books')
    screen.getByText('No books yet')
    screen.getByText(en.collection.emptyRemark)
    expect(screen.getByRole('link', { name: 'Scan book' }).getAttribute('href')).toBe('/scan')
  })

  it('shows No matches with Clear back to / with sort kept', async () => {
    getShelfRows.mockResolvedValue({ rows: [], total: 0, labels: {} })
    await renderPage({ q: 'zzz', sort: 'title', book: '7' })

    expect(countLine().textContent).toBe('“zzz” · 0 books · Clear')
    screen.getByText('No books match')
    const clears = screen.getAllByRole('link', { name: 'Clear' })
    expect(clears).toHaveLength(2)
    for (const clear of clears) expect(clear.getAttribute('href')).toBe('/?sort=title')
  })

  it('names the active filters in the count line', async () => {
    getShelfRows.mockResolvedValue({ rows: [], total: 14, labels: { 'location:3': 'Tampere' } })
    await renderPage({ location: '3', read: 'unread' })

    expect(countLine().textContent).toBe('Tampere, unread · 14 books · Clear')
  })

  it('shows Load failed when the shelf read fails, and Try again re-renders', async () => {
    getShelfRows.mockRejectedValue(new Error('down'))
    await renderPage()

    expect(logError).toHaveBeenCalledOnce()
    screen.getByRole('searchbox', { name: 'Search your books' })
    screen.getByText("Couldn't load.")
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(router.refresh).toHaveBeenCalledOnce()
  })
})
