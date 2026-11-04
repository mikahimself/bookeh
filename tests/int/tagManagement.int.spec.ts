import { getPayload } from 'payload'
import { describe, expect, it } from 'vitest'

import { limits } from '@/fields/limits'
import { upsertUserBook } from '@/lib/books/upsertUserBook'
import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import { withTransaction } from '@/lib/payload/transaction'
import { deleteTag, mergeTag, renameTag, tagUse } from '@/lib/tags/tags'
import config from '@/payload.config'
import type { Tag } from '@/payload-types'

import { copyAs, failure, freshUser, sharedBook, unique } from '../helpers/builders'

const label = (ctx: Context, name: string, kind: Tag['kind'] = 'tag') =>
  gateway.create(ctx, {
    collection: 'tags',
    data: { owner: ctx.user.id, name, nameKey: '', kind },
    depth: 0,
  })
const state = async (ctx: Context, book: number) =>
  (
    await gateway.find(ctx, {
      collection: 'user-books',
      where: { book: { equals: book } },
      depth: 0,
    })
  ).docs[0]

describe('private label management', () => {
  it.each(['tag', 'genre', 'theme'] as const)(
    'renames %s within owner and kind, preserving its own key',
    async (kind) => {
      const { ctx } = await freshUser()
      const foreign = await freshUser()
      const source = await label(ctx, 'Original', kind)
      const conflict = await label(ctx, 'Mökki books', kind)
      await label(foreign.ctx, 'Available', kind)
      await label(ctx, 'Available', kind === 'tag' ? 'genre' : 'tag')
      expect(await failure(renameTag(ctx, source.id, ' MO\u0308KKI\tbooks '))).toMatchObject({
        code: 'NAME_TAKEN',
        conflictId: conflict.id,
      })
      await renameTag(ctx, source.id, ' Available ')
      await renameTag(ctx, source.id, ' AVAILABLE\t ')
      expect(await gateway.findByID(ctx, { collection: 'tags', id: source.id })).toMatchObject({
        name: 'AVAILABLE',
        nameKey: 'available',
      })
      for (const name of [' \t ', 'x'.repeat(limits.name + 1)]) {
        expect(await failure(renameTag(ctx, source.id, name))).toMatchObject({
          code: 'VALIDATION',
          fields: { name: name.trim() === '' ? 'VALIDATION' : 'TOO_LONG' },
        })
      }
    },
  )

  it('rejects bilingual system genres and held system themes while allowing accent-distinct and unheld names', async () => {
    const { ctx, user } = await freshUser()
    const payload = await getPayload({ config })
    const english = unique('System')
    const finnish = unique('Suomi')
    await payload.create({
      collection: 'genres',
      data: { name: english, nameFi: finnish, nameKey: '' },
    })
    const genre = await label(ctx, 'Genre', 'genre')
    for (const name of [english.toUpperCase(), finnish.toUpperCase()]) {
      expect(await failure(renameTag(ctx, genre.id, name))).toMatchObject({
        code: 'VALIDATION',
        fields: { name: 'SYSTEM_NAME' },
      })
    }
    const book = await sharedBook({ by: user, themes: ['Mökki'] })
    await copyAs(user, { book: book.id })
    const theme = await label(ctx, 'Theme', 'theme')
    expect(await failure(renameTag(ctx, theme.id, ' MO\u0308KKI '))).toMatchObject({
      fields: { name: 'SYSTEM_NAME' },
    })
    await renameTag(ctx, theme.id, 'Mokki')
    const other = await freshUser()
    const unheld = unique('Foreign theme')
    const foreignBook = await sharedBook({ by: other.user, themes: [unheld] })
    await copyAs(other.user, { book: foreignBook.id })
    await renameTag(ctx, theme.id, unheld)
    const hiddenName = unique('Hidden theme')
    const hidden = await sharedBook({ by: other.user, themes: [hiddenName] })
    const admin = await freshUser({ roles: ['admin'] })
    await copyAs(user, { book: hidden.id })
    await copyAs(admin.user, { book: hidden.id })
    await payload.update({
      collection: 'books',
      id: hidden.id,
      data: { visibility: 'private' },
      req: other.ctx.req,
    })
    await renameTag(ctx, theme.id, hiddenName)
    const adminTheme = await label(admin.ctx, 'Admin theme', 'theme')
    expect(await failure(renameTag(admin.ctx, adminTheme.id, hiddenName))).toMatchObject({
      code: 'VALIDATION',
      fields: { name: 'SYSTEM_NAME' },
    })
  })

  it('allows case-only renames after system names are introduced', async () => {
    const { ctx, user } = await freshUser()
    const payload = await getPayload({ config })
    const name = unique('Later system')
    const genre = await label(ctx, name, 'genre')
    const theme = await label(ctx, name, 'theme')
    await payload.create({ collection: 'genres', data: { name, nameKey: '' } })
    const book = await sharedBook({ by: user, themes: [name] })
    await copyAs(user, { book: book.id })
    for (const tag of [genre, theme]) {
      await renameTag(ctx, tag.id, name.toUpperCase())
      expect(await gateway.findByID(ctx, { collection: 'tags', id: tag.id })).toMatchObject({
        name: name.toUpperCase(),
        nameKey: tag.nameKey,
      })
    }
  })

  it.each(['tag', 'genre', 'theme'] as const)(
    'merges and deletes every %s assignment without touching other state',
    async (kind) => {
      const payload = await getPayload({ config })
      const foreign = await freshUser()
      for (const roles of [['user'], ['admin']] as const) {
        const { ctx, user } = await freshUser({ roles: [...roles] })
        const foreignTag = await label(foreign.ctx, unique('Foreign'), kind)
        const source = await label(ctx, 'Source', kind)
        const target = await label(ctx, 'Target', kind)
        const keep = await label(ctx, 'Keep')
        const books = []
        for (let n = 0; n < 5; n++) {
          const book = await sharedBook({ by: n === 4 ? foreign.user : user })
          books.push(book)
          if (n === 0) await copyAs(user, { book: book.id })
          if (n === 1) {
            const list = await gateway.create(ctx, {
              collection: 'wishlists',
              data: { owner: user.id, name: 'Wishes', nameKey: '' },
            })
            await gateway.create(ctx, {
              collection: 'wishlist-entries',
              data: { owner: user.id, wishlist: list.id, book: book.id },
            })
          }
          await upsertUserBook(ctx, book.id, {
            tags: [source.id, keep.id, ...(n === 0 ? [target.id] : [])],
            read: true,
            rating: 4,
            overrides: { title: 'Mine' },
          })
          await upsertUserBook(foreign.ctx, book.id, {
            tags: [foreignTag.id],
            read: false,
            rating: 2,
            overrides: { title: 'Theirs' },
          })
          // A private own Book and a formerly readable foreign Book retain their state rows.
          if (n >= 3)
            await payload.update({
              collection: 'books',
              id: book.id,
              data: { visibility: 'private' },
              req: n === 4 ? foreign.ctx.req : ctx.req,
            })
        }
        const foreignBefore = []
        const beforeRows = []
        for (const book of books) {
          foreignBefore.push(await state(foreign.ctx, book.id))
          beforeRows.push(await state(ctx, book.id))
        }
        const before = beforeRows[0]
        await mergeTag(ctx, source.id, target.id)
        expect(
          (await gateway.count(ctx, { collection: 'tags', where: { id: { equals: source.id } } }))
            .totalDocs,
        ).toBe(0)
        for (const book of books) {
          const row = await state(ctx, book.id)
          expect(row).toMatchObject({ read: true, rating: 4, title: 'Mine', overridden: ['title'] })
          expect(row.tags).toHaveLength(2)
          expect(row.tags).toEqual(expect.arrayContaining([keep.id, target.id]))
        }
        expect((await state(ctx, books[0].id)).ratedAt).toBe(before.ratedAt)
        for (const [index, book] of books.entries())
          expect(await state(foreign.ctx, book.id)).toEqual(foreignBefore[index])
        await deleteTag(ctx, target.id)
        for (const [index, book] of books.entries()) {
          const row = await state(ctx, book.id)
          const { read, rating, ratedAt, title, overridden } = beforeRows[index]
          expect(row).toMatchObject({ tags: [keep.id], read, rating, ratedAt, title, overridden })
          expect(await state(foreign.ctx, book.id)).toEqual(foreignBefore[index])
        }
        await deleteTag(ctx, (await label(ctx, 'Unused', kind)).id)
      }
    },
  )

  it('rejects foreign, missing and invalid IDs for users and admins before writes', async () => {
    const foreign = await freshUser()
    const tag = await label(foreign.ctx, 'Foreign')
    for (const roles of [['user'], ['admin']] as const) {
      const { ctx } = await freshUser({ roles: [...roles] })
      const own = await label(ctx, 'Own')
      const different = await label(ctx, 'Other kind', 'genre')
      for (const id of [tag.id, 0, 2147483647, NaN]) {
        for (const operation of [
          () => renameTag(ctx, id, 'Changed'),
          () => deleteTag(ctx, id),
          () => mergeTag(ctx, id, own.id),
          () => mergeTag(ctx, own.id, id),
        ]) {
          expect(await failure(operation())).toMatchObject({ code: 'NOT_FOUND' })
        }
      }
      for (const id of [own.id, different.id])
        expect(await failure(mergeTag(ctx, own.id, id))).toMatchObject({ code: 'VALIDATION' })
      expect((await gateway.findByID(ctx, { collection: 'tags', id: own.id })).name).toBe('Own')
    }
  })

  it('joins enclosing transactions for every mutation and reads uncommitted assignment counts', async () => {
    const { ctx, user } = await freshUser()
    const book = await sharedBook({ by: user })
    await copyAs(user, { book: book.id })
    const source = await label(ctx, 'Source')
    const target = await label(ctx, 'Target')
    await upsertUserBook(ctx, book.id, { tags: [source.id] })
    for (const mutate of [
      (tx: Context) => renameTag(tx, source.id, 'Renamed'),
      (tx: Context) => mergeTag(tx, source.id, target.id),
      (tx: Context) => deleteTag(tx, source.id),
    ]) {
      await expect(
        withTransaction(ctx, async (tx) => {
          await mutate(tx)
          throw new Error('abort')
        }),
      ).rejects.toThrow('abort')
      expect((await gateway.findByID(ctx, { collection: 'tags', id: source.id })).name).toBe(
        'Source',
      )
      expect((await state(ctx, book.id)).tags).toEqual([source.id])
    }
    await withTransaction(ctx, async (tx) => {
      await upsertUserBook(tx, book.id, { tags: [target.id] })
      expect(await tagUse(tx, 'tag')).toEqual([
        { id: source.id, name: 'Source', copies: 0 },
        { id: target.id, name: 'Target', copies: 1 },
      ])
    })
  })

  it.each(['tag', 'genre', 'theme'] as const)(
    'counts readable own copies and zero-use %s labels for each role',
    async (kind) => {
      const foreign = await freshUser()
      const payload = await getPayload({ config })
      for (const roles of [['user'], ['admin']] as const) {
        const { ctx, user } = await freshUser({ roles: [...roles] })
        const used = await label(ctx, 'A used', kind)
        const unused = await label(ctx, 'Z unused', kind)
        const wishlistOnly = await label(ctx, 'W wishlist', kind)
        await label(ctx, 'Other kind', kind === 'tag' ? 'genre' : 'tag')
        const book = await sharedBook({ by: user })
        await copyAs(user, { book: book.id })
        await copyAs(user, { book: book.id, status: 'ordered' })
        await copyAs(foreign.user, { book: book.id })
        await upsertUserBook(ctx, book.id, { tags: [used.id] })
        const foreignTag = await label(foreign.ctx, unique('Foreign'), kind)
        await upsertUserBook(foreign.ctx, book.id, { tags: [foreignTag.id] })
        const noCopies = await sharedBook({ by: user })
        const wishlist = await gateway.create(ctx, {
          collection: 'wishlists',
          data: { owner: user.id, name: 'Wishes', nameKey: '' },
        })
        await gateway.create(ctx, {
          collection: 'wishlist-entries',
          data: { owner: user.id, wishlist: wishlist.id, book: noCopies.id },
        })
        await upsertUserBook(ctx, noCopies.id, { tags: [wishlistOnly.id] })
        const hidden = await sharedBook({ by: foreign.user })
        await copyAs(user, { book: hidden.id })
        await upsertUserBook(ctx, hidden.id, { tags: [used.id] })
        await payload.update({
          collection: 'books',
          id: hidden.id,
          data: { visibility: 'private' },
          req: foreign.ctx.req,
        })
        expect(await tagUse(ctx, kind)).toEqual([
          { id: used.id, name: 'A used', copies: roles[0] === 'admin' ? 3 : 2 },
          { id: wishlistOnly.id, name: 'W wishlist', copies: 0 },
          { id: unused.id, name: 'Z unused', copies: 0 },
        ])
      }
    },
  )
})
