import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import {
  addGenre,
  deleteGenre,
  genreUse,
  mergeGenre,
  renameGenre,
  setGenreNameFi,
} from '@/lib/catalogue/genres'
import { DomainError } from '@/lib/errors'
import { withTransaction } from '@/lib/payload/transaction'
import config from '@/payload.config'
import type { User } from '@/payload-types'

import { failure, sharedBook, unique } from '../helpers/builders'
import { contextFor, createUser } from '../helpers/harness'

// Genre administration, AD-5 / Story 9.13: admin only, merge and delete move
// Books first, in one transaction, and never touch a user's private rows.

describe('genre administration', () => {
  let payload: Payload
  let admin: User
  let user: User

  const genre = async (name = unique('Admin Genre')) =>
    (
      await payload.create({
        collection: 'genres',
        data: { name, nameKey: '' },
        overrideAccess: true,
        depth: 0,
      })
    ).id
  const genresOf = async (bookId: number) =>
    (await payload.findByID({ collection: 'books', id: bookId, depth: 0, overrideAccess: true }))
      .genres
  const exists = async (id: number) =>
    (
      await payload.count({
        collection: 'genres',
        where: { id: { equals: id } },
        overrideAccess: true,
      })
    ).totalDocs === 1

  beforeAll(async () => {
    payload = await getPayload({ config })
    admin = await createUser({ roles: ['admin'] })
    user = await createUser()
  })

  it('fails every call for a non-admin with NOT_FOUND', async () => {
    const ctx = await contextFor(user)
    const id = await genre()
    const other = await genre()
    for (const call of [
      () => addGenre(ctx, unique('X')),
      () => renameGenre(ctx, id, unique('X')),
      () => setGenreNameFi(ctx, id, 'x'),
      () => mergeGenre(ctx, id, other),
      () => deleteGenre(ctx, id),
      () => genreUse(ctx),
    ]) {
      const error = await failure(call())
      expect(error).toBeInstanceOf(DomainError)
      expect(error).toMatchObject({ code: 'NOT_FOUND' })
    }
    expect(await exists(id)).toBe(true)
  })

  it('adds, renames and sets the Finnish name, refusing a name another genre has', async () => {
    const ctx = await contextFor(admin)
    const name = unique('Added')
    const id = await addGenre(ctx, name, unique('Lisätty'))
    const other = await genre()

    expect(await failure(addGenre(ctx, name.toUpperCase()))).toMatchObject({
      code: 'NAME_TAKEN',
      conflictId: id,
    })
    expect(await failure(renameGenre(ctx, other, name))).toMatchObject({
      code: 'NAME_TAKEN',
      conflictId: id,
    })

    const renamed = unique('Renamed')
    await renameGenre(ctx, id, renamed)
    await renameGenre(ctx, id, renamed.toUpperCase()) // case-only keeps its own key
    await setGenreNameFi(ctx, id, '')
    const row = await payload.findByID({
      collection: 'genres',
      id,
      depth: 0,
      overrideAccess: true,
    })
    expect(row).toMatchObject({ name: renamed.toUpperCase(), nameKey: renamed.toLowerCase() })
    expect(row.nameFi).toBeFalsy()
  })

  it('merges a source into the target on every Book, once, and deletes the source', async () => {
    const ctx = await contextFor(admin)
    const [source, target, keep] = [await genre(), await genre(), await genre()]
    const onlySource = await sharedBook({ genres: [source, keep] })
    const both = await sharedBook({ genres: [target, source] })
    const priv = await sharedBook({ by: user, visibility: 'private', genres: [source] })

    await mergeGenre(ctx, source, target)

    expect(await genresOf(onlySource.id)).toEqual([target, keep])
    expect(await genresOf(both.id)).toEqual([target])
    expect(await genresOf(priv.id)).toEqual([target])
    expect(await exists(source)).toBe(false)
    expect(await failure(mergeGenre(ctx, target, target))).toMatchObject({ code: 'VALIDATION' })
  })

  it('deletes a genre after removing it from its Books', async () => {
    const ctx = await contextFor(admin)
    const [doomed, keep] = [await genre(), await genre()]
    const book = await sharedBook({ genres: [doomed, keep] })

    await deleteGenre(ctx, doomed)

    expect(await genresOf(book.id)).toEqual([keep])
    expect(await exists(doomed)).toBe(false)
    expect(await failure(deleteGenre(ctx, doomed))).toMatchObject({ code: 'NOT_FOUND' })
  })

  it('rolls a merge back with the transaction that holds it', async () => {
    const ctx = await contextFor(admin)
    const [source, target] = [await genre(), await genre()]
    const book = await sharedBook({ genres: [source] })

    await failure(
      withTransaction(ctx, async (tx) => {
        await mergeGenre(tx, source, target)
        throw new Error('rollback')
      }),
    )

    expect(await genresOf(book.id)).toEqual([source])
    expect(await exists(source)).toBe(true)
  })

  it('counts the Books of each genre, zero included', async () => {
    const ctx = await contextFor(admin)
    const [used, unused] = [await genre(), await genre()]
    await sharedBook({ genres: [used] })
    await sharedBook({ genres: [used] })

    const uses = await genreUse(ctx)
    expect(uses.find((use) => use.id === used)?.books).toBe(2)
    expect(uses.find((use) => use.id === unused)?.books).toBe(0)
  })
})
