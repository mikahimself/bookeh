import { cookies, headers } from 'next/headers'
import { getPayload, type Payload } from 'payload'
import sharp from 'sharp'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { editBookAction } from '@/app/(frontend)/books/[bookId]/edit/actions'
import type { Corners } from '@/lib/catalogue/corners'
import config from '@/payload.config'
import type { Book } from '@/payload-types'

import { contextFor, createUser } from '../helpers/harness'
import { randomIsbn } from '../helpers/isbn'

// Save on Edit book with a cover (D-4, AD-14): the edits through `editBook()`,
// then `setCover()` or `removeCover()`.

vi.mock('next/headers', () => ({ headers: vi.fn(), cookies: vi.fn() }))
// A save purges the client cache; outside a request there is none.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const password = 'edit-book-action-password'
const WIDTH = 300
const HEIGHT = 450
const whole: Corners = [
  { x: 0, y: 0 },
  { x: WIDTH, y: 0 },
  { x: WIDTH, y: HEIGHT },
  { x: 0, y: HEIGHT },
]

describe('editBookAction with a cover', () => {
  let payload: Payload
  let book: Book
  let jpeg: File

  const stored = () =>
    payload.findByID({ collection: 'books', id: book.id, depth: 0, overrideAccess: true })

  beforeAll(async () => {
    payload = await getPayload({ config })
    const admin = await createUser({ password, displayName: 'Edit Admin', roles: ['admin'] })
    book = await payload.create({
      collection: 'books',
      data: { title: 'Muumipapan urotyöt', isbn13: randomIsbn(), visibility: 'shared' },
      overrideAccess: true,
      depth: 0,
    })
    await payload.create({
      collection: 'copies',
      data: { owner: admin.id, book: book.id, status: 'owned' },
      overrideAccess: true,
      depth: 0,
      req: (await contextFor(admin)).req,
    })
    const bytes = await sharp({
      create: { width: WIDTH, height: HEIGHT, channels: 3, background: { r: 30, g: 90, b: 160 } },
    })
      .jpeg()
      .toBuffer()
    jpeg = new File([new Uint8Array(bytes)], 'cover.jpg', { type: 'image/jpeg' })

    const login = await payload.login({
      collection: 'users',
      data: { email: admin.email, password },
    })
    if (!login.token) throw new Error('login returned no token')
    const requestHeaders = new Headers({ cookie: `payload-token=${login.token}` })
    vi.mocked(headers).mockImplementation(async () => requestHeaders as never)
    vi.mocked(cookies).mockImplementation(async () => ({ get: () => undefined }) as never)
  })

  it('writes no cover when the edits fail', async () => {
    const before = (await stored()).cover ?? null

    expect(
      await editBookAction({
        bookId: book.id,
        edits: { title: '' },
        cover: { image: jpeg, corners: whole },
      }),
    ).toMatchObject({ ok: false, code: 'VALIDATION' })
    expect((await stored()).cover ?? null).toBe(before)
  })

  it('answers VALIDATION, not INTERNAL, for a book id above int4', async () => {
    expect(await editBookAction({ bookId: 2147483648, edits: { year: 1965 } })).toEqual({
      ok: false,
      code: 'VALIDATION',
    })
  })

  it("sets the admin's edit and cover on Save, and `null` removes the cover", async () => {
    expect(
      await editBookAction({
        bookId: book.id,
        edits: { year: 1965 },
        cover: { image: jpeg, corners: whole },
      }),
    ).toEqual({ ok: true, data: null })
    const saved = await stored()
    expect(saved.year).toBe(1965)
    const cover = saved.cover as number
    expect(cover).toEqual(expect.any(Number))

    expect(await editBookAction({ bookId: book.id, edits: {}, cover: null })).toEqual({
      ok: true,
      data: null,
    })
    expect((await stored()).cover ?? null).toBeNull()
    expect(
      (await payload.count({ collection: 'media', where: { id: { equals: cover } } })).totalDocs,
    ).toBe(0)
  })
})
