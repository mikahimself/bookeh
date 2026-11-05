import { cookies, headers } from 'next/headers'
import { getPayload, type Payload } from 'payload'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { changeSelectionTagsAction } from '@/app/(frontend)/(sections)/actions'
import { upsertUserBook } from '@/lib/books/upsertUserBook'
import * as gateway from '@/lib/payload/gateway'
import { processState } from '@/lib/processState'
import { changeTags } from '@/lib/tags/changeTags'
import { undo } from '@/lib/undo/undo'
import config from '@/payload.config'
import { copyAs, freshUser, sharedBook } from '../helpers/builders'

vi.mock('next/headers', () => ({ headers: vi.fn(), cookies: vi.fn() }))
let requestHeaders: Headers
const password = 'selection-tags-action-password'

describe('changeSelectionTagsAction', () => {
  let payload: Payload
  let viewer: Awaited<ReturnType<typeof freshUser>>
  let books: number[]
  let copyIds: number[]
  const assignments = async () =>
    (
      await gateway.find(viewer.ctx, {
        collection: 'user-books',
        where: { book: { in: books } },
        sort: 'book',
        depth: 0,
      })
    ).docs.map(({ tags }) => tags)
  const receiptCount = () => processState('undo.receipts', () => new Map<string, unknown>()).size
  beforeAll(async () => {
    payload = await getPayload({ config })
    vi.mocked(headers).mockImplementation(async () => requestHeaders as never)
    vi.mocked(cookies).mockImplementation(async () => ({ get: () => undefined }) as never)
  })
  beforeEach(async () => {
    viewer = await freshUser({ password })
    books = [(await sharedBook({ by: viewer.user })).id, (await sharedBook({ by: viewer.user })).id]
    copyIds = [
      (await copyAs(viewer.user, { book: books[0] })).id,
      (await copyAs(viewer.user, { book: books[0] })).id,
      (await copyAs(viewer.user, { book: books[1], status: 'ordered' })).id,
    ]
    const login = await payload.login({
      collection: 'users',
      data: { email: viewer.user.email, password },
    })
    requestHeaders = new Headers({ cookie: `payload-token=${login.token}` })
  })

  it.each(['tag', 'genre', 'theme'] as const)(
    'adds/removes %s across distinct Books with receipts restoring different prior sets',
    async (kind) => {
      await changeTags(
        viewer.ctx,
        { bookId: books[0] },
        { kind, add: [{ create: 'Previous' }], remove: [] },
      )
      await upsertUserBook(viewer.ctx, books[1], { tags: [] })
      const before = await assignments()
      const result = await changeSelectionTagsAction({
        copyIds,
        kind,
        add: [{ create: 'All' }],
        remove: [],
      })
      if (!result.ok) throw new Error(result.code)
      expect(result.data.count).toBe(2)
      const added = (
        await gateway.find(viewer.ctx, {
          collection: 'tags',
          where: { name: { equals: 'All' } },
          depth: 0,
        })
      ).docs[0].id
      expect(await assignments()).toEqual([[...(before[0] ?? []), added], [added]])
      await undo(viewer.ctx, result.data.undoToken)
      expect(await assignments()).toEqual(before)
      expect((await gateway.findByID(viewer.ctx, { collection: 'tags', id: added })).name).toBe(
        'All',
      )
      const previous = before[0]![0] as number
      const removed = await changeSelectionTagsAction({
        copyIds,
        kind,
        add: [],
        remove: [previous],
      })
      if (!removed.ok) throw new Error(removed.code)
      expect(await assignments()).toEqual([[], []])
      await undo(viewer.ctx, removed.data.undoToken)
      expect(await assignments()).toEqual(before)
    },
  )

  it('authenticates before validation and rejects malformed input without creating labels or receipts', async () => {
    const before = await assignments()
    const receiptsBefore = receiptCount()
    requestHeaders = new Headers()
    expect(await changeSelectionTagsAction(null)).toMatchObject({
      ok: false,
      code: 'UNAUTHENTICATED',
    })
    const login = await payload.login({
      collection: 'users',
      data: { email: viewer.user.email, password },
    })
    requestHeaders = new Headers({ cookie: `payload-token=${login.token}` })
    const input = { copyIds, kind: 'tag', add: [], remove: [] }
    for (const bad of [
      null,
      [],
      { ...input, copyIds: [] },
      { ...input, copyIds: ['1'] },
      { ...input, kind: 'system' },
      { ...input, add: [{ create: 'Bad', extra: true }] },
      { ...input, remove: [{ create: 'Bad' }] },
    ]) {
      expect(await changeSelectionTagsAction(bad)).toEqual({ ok: false, code: 'VALIDATION' })
      expect(await assignments()).toEqual(before)
      expect(receiptCount()).toBe(receiptsBefore)
    }
    expect((await gateway.count(viewer.ctx, { collection: 'tags' })).totalDocs).toBe(0)
  })

  it('authorizes every copy and validates private label ownership/kind before committing anything', async () => {
    const before = await assignments()
    const receiptsBefore = receiptCount()
    const foreign = await freshUser()
    const book = await sharedBook({ by: foreign.user })
    const copy = await copyAs(foreign.user, { book: book.id })
    expect(
      await changeSelectionTagsAction({
        copyIds: [...copyIds, copy.id],
        kind: 'tag',
        add: [{ create: 'Never' }],
        remove: [],
      }),
    ).toEqual({ ok: false, code: 'NOT_FOUND' })
    expect(await assignments()).toEqual(before)
    expect(receiptCount()).toBe(receiptsBefore)
    expect(
      await changeSelectionTagsAction({
        copyIds: [...copyIds, 2147483647],
        kind: 'tag',
        add: [{ create: 'Never' }],
        remove: [],
      }),
    ).toEqual({ ok: false, code: 'NOT_FOUND' })
    expect(await assignments()).toEqual(before)
    expect(receiptCount()).toBe(receiptsBefore)
    await changeTags(
      foreign.ctx,
      { bookId: book.id },
      { kind: 'tag', add: [{ create: 'Foreign' }], remove: [] },
    )
    const label = (await gateway.find(foreign.ctx, { collection: 'tags' })).docs[0].id
    expect(
      await changeSelectionTagsAction({
        copyIds,
        kind: 'tag',
        add: [{ create: 'Rollback' }, label],
        remove: [],
      }),
    ).toMatchObject({ ok: false, code: 'VALIDATION' })
    expect((await gateway.count(viewer.ctx, { collection: 'tags' })).totalDocs).toBe(0)
    expect(await assignments()).toEqual(before)
    expect(receiptCount()).toBe(receiptsBefore)
  })
})
