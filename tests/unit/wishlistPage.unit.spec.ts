// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import {
  cloneElement,
  createElement,
  isValidElement,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { EffectiveBook } from '@/lib/books/effectiveBook'
import type { PersonUse } from '@/lib/people/people'
import type { WishlistView } from '@/lib/wishlists/wishlists'

// EXPERIENCE.md, Wishlists and States; FR-38, FR-39, FR-48: one list under a
// Back link, its name as typed as the `h1`; a row per open entry with "For
// {person}" only when it has a recipient; "Nothing on this list."; Load
// failed; a foreign or bad id redirects; Delete confirms, deletes and leaves.
// Wishlists → Entry opened, States → Entry gone; FR-38, UX-DR49: `?entry=`
// opens that entry, never another of its Book's; "For" saves at once; an id
// that names no open entry of this list toasts "Not on this list".
// FR-28: Bought and Ordered toast by outcome with Undo and land on a fresh
// list; Remove confirms, toasts nothing and lands; a toast Undo refreshes.

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn(), back: vi.fn() }
const getWishlist = vi.fn<(ctx: unknown, id: number) => Promise<WishlistView | null>>()
const getEffectiveBooks =
  vi.fn<(ctx: unknown, ids: readonly number[]) => Promise<Map<number, EffectiveBook>>>()
const deleteWishlistAction = vi.fn()
const renameWishlistAction = vi.fn()
const setEntryRecipientAction = vi.fn()
const closeEntryAction = vi.fn()
const removeEntryAction = vi.fn()
const onUndone = vi.fn((_listener: () => void) => () => {})
const personUse = vi.fn<(ctx: unknown) => Promise<PersonUse[]>>()
const showToast = vi.fn()
const logError = vi.fn()
const redirect = vi.fn((href: string) => {
  throw new Error(`redirect ${href}`)
})

const english = async () => {
  const { createTranslator } = await vi.importActual<typeof import('next-intl')>('next-intl')
  const { default: messages } = await import('../../messages/en.json')
  return (namespace?: string) =>
    createTranslator({ locale: 'en', messages, namespace: namespace as 'wishlists' })
}

vi.mock('next-intl', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next-intl')>()),
  useTranslations: await english(),
  useLocale: () => 'en',
}))
vi.mock('next-intl/server', async () => {
  const translator = await english()
  return {
    getTranslations: async (namespace?: string) => translator(namespace),
    getLocale: async () => 'en',
  }
})
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => router,
  usePathname: () => '/wishlists/7',
  useSearchParams: () => new URLSearchParams(),
  redirect,
}))
vi.mock('next/link', () => ({
  default: ({
    href,
    replace,
    scroll,
    prefetch: _prefetch,
    transitionTypes: _transitionTypes,
    onClick,
    ...rest
  }: ComponentProps<'a'> & {
    href: string
    replace?: boolean
    scroll?: boolean
    prefetch?: boolean
    transitionTypes?: string[]
  }) =>
    createElement('a', {
      ...rest,
      href,
      onClick: (event: Parameters<NonNullable<typeof onClick>>[0]) => {
        onClick?.(event)
        if (event.defaultPrevented) return
        event.preventDefault()
        router[replace ? 'replace' : 'push'](href, { scroll })
      },
    }),
}))
vi.mock('@/lib/payload/context', () => ({ requireUser: async () => ({ user: { id: 1 } }) }))
vi.mock('@/lib/errors', () => ({ logger: () => ({ error: logError }) }))
vi.mock('@/lib/wishlists/wishlists', () => ({ getWishlist }))
vi.mock('@/lib/books/effectiveBook', () => ({ getEffectiveBooks }))
vi.mock('@/lib/people/people', () => ({ personUse }))
vi.mock('@/app/(frontend)/actions/wishlists', () => ({
  renameWishlistAction,
  deleteWishlistAction,
  setEntryRecipientAction,
  closeEntryAction,
  removeEntryAction,
}))
vi.mock('@/app/(frontend)/components/toast/ToastProvider', () => ({
  useToast: () => ({ show: showToast, dismiss: vi.fn(), withdraw: vi.fn(), onUndone }),
}))

const { installNavigationTracking } = await import('@/app/(frontend)/components/navigation')
const { default: WishlistPage } =
  await import('@/app/(frontend)/(sections)/wishlists/[listId]/page')

installNavigationTracking()

/** The page's tree with its async server components awaited, as the server renderer does. */
async function serverTree(node: ReactNode): Promise<ReactNode> {
  if (Array.isArray(node)) return Promise.all(node.map(serverTree))
  if (!isValidElement(node)) return node
  const { type, props } = node as ReactElement<{ children?: ReactNode }>
  if (typeof type === 'function' && type.constructor.name === 'AsyncFunction') {
    return serverTree(await (type as (props: unknown) => Promise<ReactNode>)(props))
  }
  if (props.children === undefined) return node
  const children = await serverTree(props.children)
  return Array.isArray(children)
    ? cloneElement(node, undefined, ...(children as ReactNode[]))
    : cloneElement(node, undefined, children)
}

const renderPage = async (listId = '7', search: Record<string, string> = {}) =>
  render(
    await serverTree(
      await WishlistPage({
        params: Promise.resolve({ listId }),
        searchParams: Promise.resolve(search),
      }),
    ),
  )

const book = (bookId: number, title: string, authors: EffectiveBook['authors']): EffectiveBook => ({
  bookId,
  isbn13: null,
  visibility: 'shared',
  source: null,
  title,
  subtitle: null,
  authors,
  series: null,
  seriesIndex: null,
  genres: [],
  themes: [],
  publisher: null,
  year: null,
  language: null,
  pages: null,
  description: null,
  coverUrl: null,
  overridden: [],
})

const christmas: WishlistView = {
  id: 7,
  name: 'Christmas list',
  entries: [
    { entryId: 2, bookId: 10, forPerson: null },
    { entryId: 1, bookId: 11, forPerson: { id: 5, name: 'Äiti' } },
  ],
}

// The phone unless a case widens the screen.
let wide = false

describe('One wishlist', () => {
  beforeEach(() => {
    window.history.pushState({ page: 'list' }, '', '/wishlists/7')
    vi.stubGlobal('matchMedia', (query: string) => ({
      media: query,
      matches: wide,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    getEffectiveBooks.mockResolvedValue(
      new Map([
        [10, book(10, 'Puhdistus', [{ id: 3, name: 'Sofi Oksanen' }])],
        [11, book(11, 'Sinuhe', [])],
      ]),
    )
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('shows the Back link, the name as typed as the h1, the count and a row per entry', async () => {
    getWishlist.mockResolvedValue(christmas)
    await renderPage()

    expect(screen.getByRole('link', { name: 'Wishlists' }).getAttribute('href')).toBe('/wishlists')
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual([
      'Christmas list',
    ])
    expect(screen.getByText('2 books')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Rename' })).toBeTruthy()

    const rows = screen.getAllByRole('listitem')
    expect(rows.map((row) => within(row).queryByText(/^For /)?.textContent ?? null)).toEqual([
      null,
      'For Äiti',
    ])
    expect(within(rows[0]).getByText('Sofi Oksanen')).toBeTruthy()
    expect(getWishlist).toHaveBeenCalledWith(expect.anything(), 7)

    const links = rows.map((row) => within(row).getByRole('link'))
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/wishlists/7?entry=2',
      '/wishlists/7?entry=1',
    ])
    fireEvent.click(links[1]!)
    expect(router.push).toHaveBeenCalledWith('/wishlists/7?entry=1', { scroll: false })
    expect(showToast).not.toHaveBeenCalled()
  })

  it('shows Nothing on this list. with no open entries', async () => {
    getWishlist.mockResolvedValue({ id: 7, name: 'Christmas list', entries: [] })
    await renderPage()

    expect(screen.getByText('Nothing on this list.')).toBeTruthy()
    expect(screen.getByText('0 books')).toBeTruthy()
    expect(screen.queryAllByRole('listitem')).toEqual([])
  })

  it('shows the Back link and Load failed, and logs, when the read fails', async () => {
    const err = new Error('db down')
    getWishlist.mockRejectedValue(err)
    await renderPage()

    expect(screen.getByRole('link', { name: 'Wishlists' })).toBeTruthy()
    expect(screen.getByText("Couldn't load.")).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
    expect(logError).toHaveBeenCalledWith({ err }, expect.any(String))
  })

  it('redirects to /wishlists for a list that is not mine and for a bad id', async () => {
    getWishlist.mockResolvedValue(null)
    await expect(renderPage('7')).rejects.toThrow('redirect /wishlists')
    await expect(renderPage('1.5')).rejects.toThrow('redirect /wishlists')
    expect(getWishlist).toHaveBeenCalledOnce()
  })

  it('Rename keeps the field open for a taken name and brings the heading back on success', async () => {
    getWishlist.mockResolvedValue(christmas)
    renameWishlistAction.mockResolvedValueOnce({ ok: false, code: 'NAME_TAKEN', conflictId: 9 })
    await renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))
    const field = screen.getByLabelText('Name')
    fireEvent.change(field, { target: { value: 'New name' } })
    fireEvent.keyDown(field, { key: 'Enter' })

    expect(await screen.findByText('That name is already in use.')).toBeTruthy()
    expect(renameWishlistAction).toHaveBeenCalledExactlyOnceWith(7, 'New name')
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()

    renameWishlistAction.mockResolvedValueOnce({ ok: true, data: null })
    const again = screen.getByLabelText('Name')
    again.focus()
    fireEvent.change(again, { target: { value: 'Newer name' } })
    fireEvent.keyDown(again, { key: 'Enter' })

    await waitFor(() => expect(router.refresh).toHaveBeenCalledOnce())
    expect(renameWishlistAction).toHaveBeenLastCalledWith(7, 'Newer name')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Christmas list')
    expect(screen.queryByLabelText('Name')).toBeNull()
  })

  it('Delete confirms in a dialog, deletes the list and replaces to /wishlists', async () => {
    getWishlist.mockResolvedValue(christmas)
    deleteWishlistAction.mockResolvedValue({ ok: true, data: null })
    await renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('The list and its entries go.')).toBeTruthy()
    expect(deleteWishlistAction).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/wishlists'))
    expect(deleteWishlistAction).toHaveBeenCalledExactlyOnceWith(7)
  })

  describe('opened entry', () => {
    // One Book twice: entry 12 for Äiti, entry 13 for the viewer.
    const twice: WishlistView = {
      id: 7,
      name: 'Christmas list',
      entries: [
        { entryId: 13, bookId: 10, forPerson: null },
        { entryId: 12, bookId: 10, forPerson: { id: 5, name: 'Äiti' } },
      ],
    }

    beforeEach(() => {
      getWishlist.mockResolvedValue(twice)
      personUse.mockResolvedValue([
        { id: 5, name: 'Äiti', loans: 0, entries: 1 },
        { id: 6, name: 'Leena', loans: 2, entries: 0 },
      ])
    })

    const forField = (sheet: HTMLElement) =>
      within(sheet).getByRole<HTMLInputElement>('combobox', { name: 'For' })

    it("opens the entry ?entry= names, not its Book's other entry, with its row marked", async () => {
      await renderPage('7', { entry: '13' })

      const sheet = await screen.findByRole('dialog', { name: 'Puhdistus' })
      expect(within(sheet).getByRole('heading', { name: 'Puhdistus' })).toBeTruthy()
      expect(within(sheet).getByText('On Christmas list')).toBeTruthy()
      expect(forField(sheet).value).toBe('')
      const links = screen.getAllByRole('link', { hidden: true })
      const current = links.filter((link) => link.getAttribute('aria-current') === 'true')
      expect(current.map((link) => link.getAttribute('href'))).toEqual(['/wishlists/7?entry=13'])
      expect(showToast).not.toHaveBeenCalled()
      cleanup()

      await renderPage('7', { entry: '12' })
      expect(forField(await screen.findByRole('dialog', { name: 'Puhdistus' })).value).toBe('Äiti')
    })

    it.each(['99', 'abc'])(
      'shows the list alone for ?entry=%s, toasts Not on this list and replaces to the list',
      async (entry) => {
        await renderPage('7', { entry })

        await waitFor(() =>
          expect(showToast).toHaveBeenCalledWith({ kind: 'success', message: 'Not on this list' }),
        )
        expect(router.replace).toHaveBeenCalledWith('/wishlists/7', { scroll: false })
        expect(screen.queryByRole('dialog')).toBeNull()
        expect(screen.getAllByRole('listitem')).toHaveLength(2)
        expect(personUse).not.toHaveBeenCalled()
      },
    )

    it('saves a chosen Person at once and refreshes; Clear sends null', async () => {
      setEntryRecipientAction
        .mockResolvedValueOnce({ ok: true, data: 6 })
        .mockResolvedValueOnce({ ok: true, data: null })
      await renderPage('7', { entry: '13' })
      const sheet = await screen.findByRole('dialog', { name: 'Puhdistus' })

      act(() => forField(sheet).focus())
      fireEvent.keyDown(forField(sheet), { key: 'ArrowDown' })
      fireEvent.click(await screen.findByRole('option', { name: 'Leena' }))

      await waitFor(() => expect(router.refresh).toHaveBeenCalledOnce())
      expect(setEntryRecipientAction).toHaveBeenCalledExactlyOnceWith(13, 6)
      expect(forField(sheet).value).toBe('Leena')

      fireEvent.click(within(sheet).getByRole('button', { name: 'Clear' }))
      await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(2))
      expect(setEntryRecipientAction).toHaveBeenLastCalledWith(13, null)
    })

    it('restores For on a failure: a bad name under the field, a gone entry refreshes', async () => {
      setEntryRecipientAction
        .mockResolvedValueOnce({ ok: false, code: 'VALIDATION', fields: { person: 'TOO_LONG' } })
        .mockResolvedValueOnce({ ok: false, code: 'NOT_FOUND' })
      await renderPage('7', { entry: '12' })
      const sheet = await screen.findByRole('dialog', { name: 'Puhdistus' })

      fireEvent.click(within(sheet).getByRole('button', { name: 'Clear' }))
      expect(await within(sheet).findByText('Too long.')).toBeTruthy()
      expect(forField(sheet).value).toBe('Äiti')
      expect(router.refresh).not.toHaveBeenCalled()

      fireEvent.click(within(sheet).getByRole('button', { name: 'Clear' }))
      await waitFor(() => expect(router.refresh).toHaveBeenCalledOnce())
      expect(forField(sheet).value).toBe('Äiti')
      expect(showToast).not.toHaveBeenCalled()
    })

    it("links the entry's author chip to the collection with only that author", async () => {
      await renderPage('7', { entry: '13' })
      const sheet = await screen.findByRole('dialog', { name: 'Puhdistus' })
      expect(within(sheet).getByRole('link', { name: 'Sofi Oksanen' }).getAttribute('href')).toBe(
        '/?author=3',
      )
    })

    describe('Bought, Ordered and Remove', () => {
      const hylly = { id: 4, name: 'Hylly' }
      const sheet = () => screen.findByRole('dialog', { name: 'Puhdistus' })
      const landed = () =>
        waitFor(() =>
          expect(router.replace).toHaveBeenCalledWith('/wishlists/7', { scroll: false }),
        )

      it.each([
        ['13', 'Bought', 'bought', { copyId: 30, savedTo: hylly }, 'Saved to Hylly'],
        ['13', 'Bought', 'bought', { copyId: 30, savedTo: null }, 'Saved'],
        ['12', 'Bought', 'bought', { copyId: null, savedTo: null }, 'Bought'],
        ['13', 'Ordered', 'ordered', { copyId: 31, savedTo: null }, 'Ordered'],
      ])(
        'entry %s, %s: toasts by outcome with Undo and lands on the list',
        async (entry, button, as, data, message) => {
          closeEntryAction.mockResolvedValue({
            ok: true,
            data: { ...data, undoToken: 'u1', undoSeconds: 10 },
          })
          await renderPage('7', { entry })
          fireEvent.click(within(await sheet()).getByRole('button', { name: button }))

          await landed()
          expect(closeEntryAction).toHaveBeenCalledExactlyOnceWith(Number(entry), as)
          expect(showToast).toHaveBeenCalledExactlyOnceWith({
            kind: 'success',
            message,
            undo: { token: 'u1', seconds: 10 },
          })
          expect(router.refresh).not.toHaveBeenCalled()
        },
      )

      it('refreshes with no success toast on NOT_FOUND; stays open and reports INTERNAL', async () => {
        closeEntryAction.mockResolvedValueOnce({ ok: false, code: 'NOT_FOUND' })
        await renderPage('7', { entry: '13' })
        const opened = await sheet()
        fireEvent.click(within(opened).getByRole('button', { name: 'Bought' }))
        await waitFor(() => expect(router.refresh).toHaveBeenCalledOnce())
        expect(showToast).not.toHaveBeenCalled()

        closeEntryAction.mockResolvedValueOnce({ ok: false, code: 'INTERNAL' })
        fireEvent.click(within(opened).getByRole('button', { name: 'Bought' }))
        await waitFor(() =>
          expect(showToast).toHaveBeenCalledExactlyOnceWith({ kind: 'error', code: 'INTERNAL' }),
        )
        expect(router.refresh).toHaveBeenCalledOnce()
        expect(router.replace).not.toHaveBeenCalled()
        expect(router.back).not.toHaveBeenCalled()
        expect(screen.getByRole('dialog', { name: 'Puhdistus' })).toBe(opened)
      })

      it('Remove asks first: Cancel calls nothing, confirm removes with no toast and lands', async () => {
        removeEntryAction.mockResolvedValue({ ok: true, data: null })
        await renderPage('7', { entry: '13' })
        const opened = await sheet()

        fireEvent.click(within(opened).getByRole('button', { name: 'Remove' }))
        const ask = await screen.findByRole('dialog', { name: 'Remove from Christmas list?' })
        fireEvent.click(within(ask).getByRole('button', { name: 'Cancel' }))
        await waitFor(() =>
          expect(screen.queryByRole('dialog', { name: 'Remove from Christmas list?' })).toBeNull(),
        )
        expect(removeEntryAction).not.toHaveBeenCalled()

        fireEvent.click(within(opened).getByRole('button', { name: 'Remove' }))
        const again = await screen.findByRole('dialog', { name: 'Remove from Christmas list?' })
        fireEvent.click(within(again).getByRole('button', { name: 'Remove' }))

        await landed()
        expect(removeEntryAction).toHaveBeenCalledExactlyOnceWith(13)
        expect(showToast).not.toHaveBeenCalled()
      })

      it('refreshes after a toast Undo', async () => {
        await renderPage('7', { entry: '13' })
        await sheet()
        const listener = onUndone.mock.calls.at(-1)?.[0]
        expect(listener).toBeDefined()
        act(() => listener?.())
        await waitFor(() => expect(router.refresh).toHaveBeenCalledOnce())
      })

      describe('at 1300px', () => {
        beforeEach(() => {
          wide = true
        })

        afterEach(() => {
          wide = false
        })

        it('Bought closes the panel and lands on the list', async () => {
          closeEntryAction.mockResolvedValue({
            ok: true,
            data: { copyId: 30, savedTo: hylly, undoToken: 'u1', undoSeconds: 10 },
          })
          await renderPage('7', { entry: '13' })
          const aside = await screen.findByRole('complementary', { name: 'Puhdistus' })
          fireEvent.click(within(aside).getByRole('button', { name: 'Bought' }))

          await landed()
          expect(router.refresh).not.toHaveBeenCalled()
        })
      })
    })
  })
})
