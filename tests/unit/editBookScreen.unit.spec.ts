// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createElement, Fragment, type ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const show = vi.fn()
const dismiss = vi.fn()
const editBookAction = vi.fn()
// Back as the browser does it, so a close lands on the entry below.
const router = { back: vi.fn(() => window.history.back()), replace: vi.fn() }

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}.${key}` : key,
  useLocale: () => 'en',
}))
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => router,
}))
vi.mock('@/app/(frontend)/books/[bookId]/edit/actions', () => ({ editBookAction }))
vi.mock('@/app/(frontend)/components/toast/ToastProvider', () => ({
  useToast: () => ({ show, dismiss }),
}))

const { installNavigationTracking, OVERLAY_TOKENS_KEY, TaskBase } =
  await import('@/app/(frontend)/components/navigation')
const { EditBookScreen } = await import('@/app/(frontend)/books/[bookId]/edit/EditBookScreen')
const { NotHeld } = await import('@/app/(frontend)/books/[bookId]/edit/NotHeld')

installNavigationTracking()

const KEY = 'bookeh:edit-book:7'
const PATH = '/books/7/edit'

const effective = {
  title: 'Kotiseutu',
  subtitle: null,
  authors: ['A. Kirjoittaja'],
  series: null,
  seriesIndex: null,
  genres: [3],
  publisher: null,
  year: 2014,
  language: 'fi',
  pages: null,
  description: null,
}

type Details = Pick<
  ComponentProps<typeof EditBookScreen>,
  'effective' | 'isbnEditable' | 'genreOptions' | 'genres' | 'themes'
> &
  Partial<Pick<ComponentProps<typeof EditBookScreen>, 'copy' | 'locations'>>

/** A shared Book seen by someone who is not the admin. */
const shared: Details = {
  effective,
  isbnEditable: false,
  genreOptions: null,
  genres: [{ id: 3, name: 'Fiction' }],
  themes: ['Sota'],
}

const open = (draft?: object, details: Details = shared) => {
  if (draft) window.sessionStorage.setItem(KEY, JSON.stringify(draft))
  render(
    createElement(
      Fragment,
      null,
      createElement(TaskBase),
      createElement(EditBookScreen, {
        bookId: 7,
        title: 'Kotiseutu',
        authors: 'A. Kirjoittaja',
        source: 'From Finna',
        cover: null,
        copy: null,
        locations: [],
        ...details,
      }),
    ),
  )
}

/** The Back guard's entry is the current one. */
const guarded = () => OVERLAY_TOKENS_KEY in (window.history.state as object)
const save = () => fireEvent.click(screen.getByRole('button', { name: 'editBook.save' }))
const discardAsked = () => screen.findByRole('dialog', { name: 'editBook.discardTitle' })
const unfold = () => fireEvent.click(screen.getByRole('button', { name: 'editBook.moreDetails' }))
const type = (field: HTMLElement, value: string) => fireEvent.change(field, { target: { value } })
const field = (key: string) => screen.getByLabelText(`editBook.field.${key}`)

describe('EditBookScreen', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/')
    window.history.pushState({}, '', PATH)
    window.sessionStorage.clear()
  })

  afterEach(async () => {
    cleanup()
    vi.clearAllMocks()
    // Let a close's traversal settle, so the next test's close is live.
    await new Promise((resolve) => setTimeout(resolve, 50))
  })

  it('saves the stored draft, shows "Saved", closes and clears the draft', async () => {
    editBookAction.mockResolvedValue({ ok: true, data: null })
    open({ year: 2015 })
    await waitFor(() => expect(guarded()).toBe(true))
    save()

    await waitFor(() => expect(window.location.pathname).toBe('/'))
    expect(editBookAction).toHaveBeenCalledWith({ bookId: 7, edits: { year: 2015 } })
    expect(show).toHaveBeenCalledWith({ kind: 'success', message: 'toast.saved' })
    expect(window.sessionStorage.getItem(KEY)).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('goes to sign in from the task entry when signed out and keeps the draft', async () => {
    editBookAction.mockResolvedValue({ ok: false, code: 'UNAUTHENTICATED' })
    let replacedGuard: boolean | undefined
    router.replace.mockImplementationOnce(() => {
      replacedGuard = guarded()
    })
    open({ year: 2015 })
    await waitFor(() => expect(guarded()).toBe(true))
    save()

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith(`/login?next=${encodeURIComponent(PATH)}`),
    )
    expect(replacedGuard).toBe(false)
    expect(window.sessionStorage.getItem(KEY)).toBe(JSON.stringify({ year: 2015 }))
  })

  it('reports a rejected field, stays and keeps the draft', async () => {
    editBookAction.mockResolvedValue({
      ok: false,
      code: 'VALIDATION',
      fields: { title: 'VALIDATION' },
    })
    open({ title: ' ' })
    save()

    await waitFor(() => expect(show).toHaveBeenCalledWith({ kind: 'error', code: 'VALIDATION' }))
    expect(window.location.pathname).toBe(PATH)
    expect(window.sessionStorage.getItem(KEY)).toBe(JSON.stringify({ title: ' ' }))
  })

  it('asks before the X leaves changes, and Discard clears them and closes', async () => {
    open({ year: 2015 })
    await waitFor(() => expect(guarded()).toBe(true))
    fireEvent.click(screen.getByRole('button', { name: 'task.close' }))
    fireEvent.click(within(await discardAsked()).getByRole('button', { name: 'editBook.discard' }))

    await waitFor(() => expect(window.location.pathname).toBe('/'))
    expect(window.sessionStorage.getItem(KEY)).toBeNull()
  })

  it('closes at once from the X with no changes', async () => {
    open()
    expect(guarded()).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'task.close' }))

    await waitFor(() => expect(window.location.pathname).toBe('/'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('asks on Back with changes, and Discard clears them and closes', async () => {
    open({ year: 2015 })
    await waitFor(() => expect(guarded()).toBe(true))
    act(() => window.history.back())
    fireEvent.click(within(await discardAsked()).getByRole('button', { name: 'editBook.discard' }))

    await waitFor(() => expect(window.location.pathname).toBe('/'))
    expect(window.sessionStorage.getItem(KEY)).toBeNull()
  })

  it('asks on Back with changes; Cancel stays and Back asks again', async () => {
    open({ year: 2015 })
    await waitFor(() => expect(guarded()).toBe(true))
    act(() => window.history.back())
    const dialog = await discardAsked()
    fireEvent.click(within(dialog).getByRole('button', { name: 'overlay.cancel' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(guarded()).toBe(true))
    expect(window.location.pathname).toBe(PATH)

    act(() => window.history.back())
    expect(await discardAsked()).toBeTruthy()
    expect(window.location.pathname).toBe(PATH)
  })
})

describe('EditBookScreen, More details', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/')
    window.history.pushState({}, '', PATH)
    window.sessionStorage.clear()
  })

  afterEach(async () => {
    cleanup()
    vi.clearAllMocks()
    await new Promise((resolve) => setTimeout(resolve, 50))
  })

  it('unfolds the effective values on a shared Book, genres and themes read-only, no ISBN', () => {
    open()
    expect(screen.queryByLabelText('editBook.field.year')).toBeNull()
    unfold()

    expect(field('title')).toHaveProperty('value', 'Kotiseutu')
    expect(field('author')).toHaveProperty('value', 'A. Kirjoittaja')
    expect(field('year')).toHaveProperty('value', '2014')
    expect(field('language')).toHaveProperty('value', 'fi')
    expect(field('subtitle')).toHaveProperty('value', '')
    expect(screen.queryByLabelText('editBook.field.isbn')).toBeNull()
    expect(screen.getByText('Fiction')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Fiction' })).toBeNull()
    expect(screen.getByText('Sota')).toBeTruthy()
  })

  it('saves a changed number as an integer, only that key', async () => {
    editBookAction.mockResolvedValue({ ok: true, data: null })
    open()
    unfold()
    type(field('year'), '2016')
    save()

    await waitFor(() =>
      expect(editBookAction).toHaveBeenCalledWith({ bookId: 7, edits: { year: 2016 } }),
    )
  })

  it('drops a field edited back to its effective value from the draft', async () => {
    open()
    unfold()
    type(field('year'), '2016')
    expect(window.sessionStorage.getItem(KEY)).toBe(JSON.stringify({ year: 2016 }))
    type(field('year'), '2014')

    expect(window.sessionStorage.getItem(KEY)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'task.close' }))
    await waitFor(() => expect(window.location.pathname).toBe('/'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('saves the authors as the names of their rows, an added one included', async () => {
    editBookAction.mockResolvedValue({ ok: true, data: null })
    open()
    unfold()
    type(field('author'), 'B')
    fireEvent.click(screen.getByRole('button', { name: 'editBook.addAuthor' }))
    type(screen.getAllByLabelText('editBook.field.author')[1]!, 'C')
    save()

    await waitFor(() =>
      expect(editBookAction).toHaveBeenCalledWith({ bookId: 7, edits: { authors: ['B', 'C'] } }),
    )
  })

  it('marks a rejected field, unfolded, until it is edited', async () => {
    editBookAction.mockResolvedValue({
      ok: false,
      code: 'VALIDATION',
      fields: { title: 'VALIDATION' },
    })
    open({ title: '' })
    save()

    await waitFor(() => expect(show).toHaveBeenCalledWith({ kind: 'error', code: 'VALIDATION' }))
    expect(field('title')).toHaveProperty('value', '')
    expect(screen.getByText('editBook.checkField')).toBeTruthy()
    type(field('title'), 'K')
    expect(screen.queryByText('editBook.checkField')).toBeNull()
  })

  it('edits the ISBN and system genres of my private Book', async () => {
    const { genres: _genres, ...noGenres } = effective
    open(undefined, {
      effective: { ...noGenres, genres: [] },
      isbnEditable: true,
      genreOptions: [
        { id: 3, name: 'Fiction' },
        { id: 5, name: 'History' },
      ],
      genres: [],
      themes: [],
    })
    unfold()
    editBookAction.mockResolvedValueOnce({
      ok: false,
      code: 'VALIDATION',
      fields: { isbn13: 'INVALID_ISBN' },
    })
    type(field('isbn'), '123')
    fireEvent.click(screen.getByRole('button', { name: 'Fiction' }))
    save()

    await waitFor(() => expect(screen.getByText('errors.INVALID_ISBN')).toBeTruthy())
    expect(editBookAction).toHaveBeenCalledWith({
      bookId: 7,
      edits: { isbn13: '123', genres: [3] },
    })

    editBookAction.mockResolvedValueOnce({ ok: true, data: null })
    type(field('isbn'), '')
    expect(screen.queryByText('errors.INVALID_ISBN')).toBeNull()
    save()
    await waitFor(() =>
      expect(editBookAction).toHaveBeenLastCalledWith({ bookId: 7, edits: { genres: [3] } }),
    )
  })

  it('keeps an emptied ISBN empty', () => {
    open(undefined, {
      effective: { ...effective, isbn13: '9789510000000' },
      isbnEditable: true,
      genreOptions: [],
      genres: [],
      themes: [],
    })
    unfold()
    type(field('isbn'), '')

    expect(field('isbn')).toHaveProperty('value', '')
    expect(window.sessionStorage.getItem(KEY)).toBeNull()
  })

  it('drops genres toggled back to the effective set from the draft', () => {
    open(undefined, {
      effective: { ...effective, genres: [3, 5] },
      isbnEditable: true,
      genreOptions: [
        { id: 3, name: 'Fiction' },
        { id: 5, name: 'History' },
      ],
      genres: [],
      themes: [],
    })
    unfold()
    const fiction = screen.getByRole('button', { name: 'Fiction' })
    fireEvent.click(fiction)
    expect(window.sessionStorage.getItem(KEY)).toBe(JSON.stringify({ genres: [5] }))
    fireEvent.click(fiction)

    expect(window.sessionStorage.getItem(KEY)).toBeNull()
  })
})

describe('EditBookScreen, the copy', () => {
  /** Copy 9, owned at Tampere, opened from the save toast. */
  const owned: Details = {
    ...shared,
    copy: { id: 9, status: 'owned', location: 2 },
    locations: [
      { id: 4, name: 'Mökki' },
      { id: 2, name: 'Tampere' },
    ],
  }
  const status = (name: 'owned' | 'ordered') =>
    screen.getByRole('button', { name: `editBook.${name}` })
  const location = () => screen.queryByLabelText<HTMLInputElement>('editBook.location')

  beforeEach(() => {
    window.history.pushState({}, '', '/scan')
    window.history.pushState({}, '', `${PATH}?copy=9`)
    window.sessionStorage.clear()
  })

  afterEach(async () => {
    cleanup()
    vi.clearAllMocks()
    await new Promise((resolve) => setTimeout(resolve, 50))
  })

  it('marks ordered: hides the location, saves only the status and returns to Scan', async () => {
    editBookAction.mockResolvedValue({ ok: true, data: null })
    open(undefined, owned)
    expect(status('owned').getAttribute('aria-pressed')).toBe('true')
    expect(location()!.value).toBe('Tampere')
    fireEvent.click(status('ordered'))
    expect(location()).toBeNull()
    save()

    await waitFor(() => expect(window.location.pathname).toBe('/scan'))
    expect(editBookAction).toHaveBeenCalledWith({
      bookId: 7,
      edits: {},
      copy: { id: 9, status: 'ordered' },
    })
    expect(show).toHaveBeenCalledWith({ kind: 'success', message: 'toast.saved' })
  })

  it('drops the copy from the draft after ordered and owned again, location kept', () => {
    open(undefined, owned)
    fireEvent.click(status('ordered'))
    expect(window.sessionStorage.getItem(KEY)).toBe(
      JSON.stringify({ copy: { id: 9, status: 'ordered' } }),
    )
    fireEvent.click(status('owned'))

    expect(window.sessionStorage.getItem(KEY)).toBeNull()
    expect(location()!.value).toBe('Tampere')
  })

  it('keeps a move in the draft and asks before the X discards it', async () => {
    open(undefined, owned)
    const input = location()!
    act(() => input.focus())
    fireEvent.input(input, { target: { value: 'Mök' }, inputType: 'insertText' })
    fireEvent.click(await screen.findByRole('option', { name: 'Mökki' }))

    expect(window.sessionStorage.getItem(KEY)).toBe(
      JSON.stringify({ copy: { id: 9, location: 4 } }),
    )
    // The draft holds only the copy: More details stays folded.
    expect(screen.getByRole('button', { name: 'editBook.moreDetails' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'task.close' }))
    expect(await discardAsked()).toBeTruthy()
  })
})

describe('NotHeld', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('shows "Not in library" and replaces with the section', () => {
    render(createElement(NotHeld))

    expect(show).toHaveBeenCalledWith({ kind: 'success', message: 'answer.notInLibrary' })
    expect(router.replace).toHaveBeenCalledWith('/')
  })
})
