import { getPayload } from 'payload'
import { describe, expect, it } from 'vitest'

import { limits } from '@/fields/limits'
import { upsertUserBook } from '@/lib/books/upsertUserBook'
import * as gateway from '@/lib/payload/gateway'
import { withTransaction } from '@/lib/payload/transaction'
import { changeTags } from '@/lib/tags/changeTags'
import { undo, withUndo } from '@/lib/undo/undo'
import config from '@/payload.config'

import { copyAs, failure, freshUser, sharedBook, unique } from '../helpers/builders'

const named = (name: string) => ({ create: name })
const tagsOf = async (ctx: Awaited<ReturnType<typeof freshUser>>['ctx'], bookId: number) =>
  (
    await gateway.find(ctx, {
      collection: 'user-books',
      where: { book: { equals: bookId } },
      depth: 0,
    })
  ).docs[0]

const setup = async () => {
  const { user, ctx } = await freshUser()
  const book = await sharedBook({ by: user })
  const copy = await copyAs(user, { book: book.id })
  return { user, ctx, book, copy }
}

describe('changeTags', () => {
  it('changes distinct Books once, deduplicates, keeps other state and restores only changed Books', async () => {
    const { user, ctx, book, copy } = await setup()
    const second = await copyAs(user, { book: book.id })
    const other = await sharedBook({ by: user })
    const third = await copyAs(user, { book: other.id })
    await upsertUserBook(ctx, book.id, { read: true, rating: 4, overrides: { title: 'Mine' } })
    await changeTags(
      ctx,
      { bookId: book.id },
      { add: [named('Other kind')], remove: [], kind: 'theme' },
    )
    await changeTags(
      ctx,
      { bookId: other.id },
      { add: [named('MO\u0308KKI  books')], remove: [], kind: 'tag' },
    )
    const old = (await tagsOf(ctx, other.id))!.tags![0] as number
    const before = await tagsOf(ctx, book.id)
    const result = await withUndo(ctx, (tx) =>
      changeTags(
        tx,
        { copyIds: [copy.id, second.id, third.id, copy.id] },
        { add: [named(' mökki\tbooks '), old], remove: [old], kind: 'tag' },
      ),
    )
    expect(result.count).toBe(2)
    const after = await tagsOf(ctx, book.id)
    expect(after).toMatchObject({ read: true, rating: 4, title: 'Mine', ratedAt: before!.ratedAt })
    expect(after!.tags).toEqual([...before!.tags!, old])
    // The already assigned Book was unchanged and is absent from the restore.
    await changeTags(ctx, { bookId: other.id }, { add: [], remove: [old], kind: 'tag' })
    await undo(ctx, result.undoToken)
    expect((await tagsOf(ctx, book.id))!.tags).toEqual(before!.tags)
    expect((await tagsOf(ctx, other.id))!.tags).toEqual([])
  })

  it('gates every copy before label creation, including foreign copies for admins', async () => {
    const { user, book, copy } = await setup()
    for (const roles of [['user'], ['admin']] as const) {
      const { ctx } = await freshUser({ roles: [...roles] })
      for (const ids of [[copy.id], [0], [2147483647], []]) {
        expect(
          await failure(
            changeTags(
              ctx,
              { copyIds: ids },
              {
                add: [named('Never created')],
                remove: [],
                kind: 'tag',
              },
            ),
          ),
        ).toMatchObject({ code: 'NOT_FOUND' })
      }
      expect((await gateway.count(ctx, { collection: 'tags' })).totalDocs).toBe(0)
      expect(
        await failure(
          changeTags(
            ctx,
            { bookId: book.id },
            {
              add: [],
              remove: [],
              kind: 'tag',
            },
          ),
        ),
      ).toMatchObject({ code: 'NOT_FOUND' })
    }
    const { ctx } = await freshUser()
    const own = await copyAs(ctx.user, { book: book.id })
    expect(
      await failure(
        changeTags(
          ctx,
          { copyIds: [own.id, copy.id] },
          {
            add: [named('Never created')],
            remove: [],
            kind: 'tag',
          },
        ),
      ),
    ).toMatchObject({ code: 'NOT_FOUND' })
    expect((await gateway.count(ctx, { collection: 'tags' })).totalDocs).toBe(0)
    expect(user.id).not.toBe(ctx.user.id)
  })

  it('accepts an open wishlist-only Book and ordered copies', async () => {
    const { user, ctx } = await freshUser()
    const book = await sharedBook({ by: user })
    const list = await gateway.create(ctx, {
      collection: 'wishlists',
      data: { owner: user.id, name: 'Wishes', nameKey: '' },
    })
    await gateway.create(ctx, {
      collection: 'wishlist-entries',
      data: { owner: user.id, wishlist: list.id, book: book.id },
    })
    await changeTags(ctx, { bookId: book.id }, { add: [named('Wanted')], remove: [], kind: 'tag' })
    const ordered = await copyAs(user, { book: book.id, status: 'ordered' })
    await changeTags(
      ctx,
      { copyIds: [ordered.id] },
      { add: [named('Ordered')], remove: [], kind: 'tag' },
    )
    expect((await tagsOf(ctx, book.id))!.tags).toHaveLength(2)
  })

  it('rejects invalid names, kinds and foreign or wrong-kind IDs atomically', async () => {
    const { ctx, book } = await setup()
    const foreign = await setup()
    await changeTags(
      foreign.ctx,
      { bookId: foreign.book.id },
      { add: [named('Foreign')], remove: [], kind: 'tag' },
    )
    const foreignId = (await tagsOf(foreign.ctx, foreign.book.id))!.tags![0] as number
    await changeTags(ctx, { bookId: book.id }, { add: [named('Genre')], remove: [], kind: 'genre' })
    const genreId = (await tagsOf(ctx, book.id))!.tags![0] as number
    for (const ref of [named(' \t '), named('x'.repeat(limits.name + 1)), foreignId, genreId, 0]) {
      const before = (await gateway.count(ctx, { collection: 'tags' })).totalDocs
      expect(
        await failure(
          changeTags(
            ctx,
            { bookId: book.id },
            {
              add: [named(unique('Rolled back')), ref],
              remove: [],
              kind: 'tag',
            },
          ),
        ),
      ).toMatchObject({ code: 'VALIDATION' })
      expect((await gateway.count(ctx, { collection: 'tags' })).totalDocs).toBe(before)
    }
    for (const id of [foreignId, genreId, 0]) {
      expect(
        await failure(
          changeTags(
            ctx,
            { bookId: book.id },
            {
              add: [],
              remove: [id],
              kind: 'tag',
            },
          ),
        ),
      ).toMatchObject({ code: 'VALIDATION', fields: { tags: 'VALIDATION' } })
    }
    expect(
      await failure(
        changeTags(
          ctx,
          { bookId: book.id },
          {
            add: [],
            remove: [],
            kind: 'invalid' as 'tag',
          },
        ),
      ),
    ).toMatchObject({ code: 'VALIDATION', fields: { kind: 'VALIDATION' } })
  })

  it('checks both system genre languages and only themes from readable own copies', async () => {
    const { user, ctx, book } = await setup()
    const payload = await getPayload({ config })
    const english = unique('System')
    const finnish = unique('Järjestelmä')
    await changeTags(ctx, { bookId: book.id }, { add: [named(english)], remove: [], kind: 'genre' })
    await payload.create({
      collection: 'genres',
      data: { name: english, nameFi: finnish, nameKey: '' },
    })
    await changeTags(
      ctx,
      { bookId: book.id },
      { add: [named(english.toUpperCase())], remove: [], kind: 'genre' },
    )
    expect(
      await failure(
        changeTags(
          ctx,
          { bookId: book.id },
          {
            add: [named(finnish.toUpperCase())],
            remove: [],
            kind: 'genre',
          },
        ),
      ),
    ).toMatchObject({ code: 'VALIDATION', fields: { tags: 'SYSTEM_NAME' } })
    const other = await freshUser()
    const hidden = await sharedBook({ by: other.user, themes: ['Unheld theme'] })
    await copyAs(other.user, { book: hidden.id })
    await changeTags(
      ctx,
      { bookId: book.id },
      { add: [named('Unheld theme')], remove: [], kind: 'theme' },
    )
    const themed = await sharedBook({ by: user, themes: ['Mökki'] })
    await copyAs(user, { book: themed.id })
    expect(
      await failure(
        changeTags(
          ctx,
          { bookId: book.id },
          {
            add: [named(' MO\u0308KKI ')],
            remove: [],
            kind: 'theme',
          },
        ),
      ),
    ).toMatchObject({ code: 'VALIDATION', fields: { tags: 'SYSTEM_NAME' } })
    await changeTags(ctx, { bookId: book.id }, { add: [named('Mokki')], remove: [], kind: 'theme' })
    const fresh = await freshUser()
    await copyAs(fresh.user, { book: book.id })
    expect(
      await failure(
        changeTags(
          fresh.ctx,
          { bookId: book.id },
          {
            add: [named(english)],
            remove: [],
            kind: 'genre',
          },
        ),
      ),
    ).toMatchObject({ fields: { tags: 'SYSTEM_NAME' } })
  })

  it('resolves equal names separately by kind and reuses a theme after a system collision appears', async () => {
    const { user, ctx, book } = await setup()
    const ids: number[] = []
    for (const kind of ['tag', 'genre', 'theme'] as const) {
      await changeTags(
        ctx,
        { bookId: book.id },
        {
          add: [named(' MO\u0308KKI  books ')],
          remove: [],
          kind,
        },
      )
      const { docs } = await gateway.find(ctx, {
        collection: 'tags',
        where: { kind: { equals: kind } },
        depth: 0,
      })
      expect(docs).toHaveLength(1)
      expect(docs[0]).toMatchObject({ kind, nameKey: 'mökki books' })
      ids.push(docs[0].id)
    }
    expect(new Set(ids).size).toBe(3)
    expect((await tagsOf(ctx, book.id))!.tags).toEqual(ids)
    const themed = await sharedBook({ by: user, themes: ['Mökki books'] })
    await copyAs(user, { book: themed.id })
    await changeTags(
      ctx,
      { bookId: themed.id },
      {
        add: [named('mökki\tbooks')],
        remove: [],
        kind: 'theme',
      },
    )
    expect((await tagsOf(ctx, themed.id))!.tags).toEqual([ids[2]])
    expect((await gateway.count(ctx, { collection: 'tags' })).totalDocs).toBe(3)
  })

  it('checks themes only on readable held Books, including the admin read rule', async () => {
    const creator = await freshUser()
    const payload = await getPayload({ config })
    for (const roles of [['user'], ['admin']] as const) {
      const { ctx, user } = await freshUser({ roles: [...roles] })
      const target = await sharedBook({ by: user })
      await copyAs(user, { book: target.id })
      const hidden = await sharedBook({ by: creator.user, themes: ['Hidden system theme'] })
      await copyAs(user, { book: hidden.id })
      await payload.update({
        collection: 'books',
        id: hidden.id,
        data: { visibility: 'private' },
        req: creator.ctx.req,
      })
      const change = changeTags(
        ctx,
        { bookId: target.id },
        {
          add: [named('Hidden system theme')],
          remove: [],
          kind: 'theme',
        },
      )
      if (roles[0] === 'admin') {
        expect(await failure(change)).toMatchObject({ fields: { tags: 'SYSTEM_NAME' } })
      } else {
        await change
        expect((await tagsOf(ctx, target.id))!.tags).toHaveLength(1)
      }
    }
  })

  it('keeps inline labels on Undo, omits deleted labels, skips gone rows and joins rollback', async () => {
    const { ctx, book } = await setup()
    await changeTags(
      ctx,
      { bookId: book.id },
      { add: [named('Previous')], remove: [], kind: 'tag' },
    )
    const old = (await tagsOf(ctx, book.id))!.tags![0] as number
    const result = await withUndo(ctx, (tx) =>
      changeTags(
        tx,
        { bookId: book.id },
        {
          add: [named('Inline')],
          remove: [old],
          kind: 'tag',
        },
      ),
    )
    await gateway.deleteByID(ctx, { collection: 'tags', id: old })
    await upsertUserBook(ctx, book.id, { read: true })
    await undo(ctx, result.undoToken)
    expect(await tagsOf(ctx, book.id)).toMatchObject({ tags: [], read: true })
    expect((await gateway.find(ctx, { collection: 'tags' })).docs.map((row) => row.name)).toEqual([
      'Inline',
    ])
    const gone = await withUndo(ctx, (tx) =>
      changeTags(
        tx,
        { bookId: book.id },
        {
          add: [named('Inline')],
          remove: [],
          kind: 'tag',
        },
      ),
    )
    await gateway.deleteByID(ctx, {
      collection: 'user-books',
      id: (await tagsOf(ctx, book.id))!.id,
    })
    await undo(ctx, gone.undoToken)
    expect(await tagsOf(ctx, book.id)).toBeUndefined()
    await expect(
      withTransaction(ctx, async (tx) => {
        await changeTags(
          tx,
          { bookId: book.id },
          { add: [named('Rollback')], remove: [], kind: 'tag' },
        )
        throw new Error('abort')
      }),
    ).rejects.toThrow('abort')
    expect(await tagsOf(ctx, book.id)).toBeUndefined()
    expect((await gateway.find(ctx, { collection: 'tags' })).docs.map((row) => row.name)).toEqual([
      'Inline',
    ])
  })
})
