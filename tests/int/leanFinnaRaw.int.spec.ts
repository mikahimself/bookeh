import { readFileSync } from 'node:fs'

import { createLocalReq, getPayload, type Payload } from 'payload'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { up } from '@/migrations/20261021_072731_lean_finna_raw'
import config from '@/payload.config'

import { randomIsbn } from '../helpers/isbn'

// The data-only migration of Story 4.20 trims Finna raw data saved before the adapter did.

type Body = { records: { id: string }[] }

describe('lean_finna_raw migration', () => {
  let payload: Payload

  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const bookWith = async (finna: unknown, isbn13 = randomIsbn()) =>
    payload.create({
      collection: 'books',
      data: {
        title: 'A clash of kings',
        isbn13,
        visibility: 'shared',
        rawMetadata: {
          v: 1,
          fetchedAt: '2026-10-21T00:00:00.000Z',
          sources: { finna },
          subjects: {},
          coverUrl: null,
        },
      },
      overrideAccess: true,
      depth: 0,
    })

  const storedFinna = async (id: number) =>
    (await payload.findByID({ collection: 'books', id, overrideAccess: true, depth: 0 }))
      .rawMetadata?.sources.finna

  it('keeps only the matching record and leaves other shapes and unmatched ISBNs alone', async () => {
    // Two records, only `helmet.2016129` carries the ISBN.
    const isbn13 = randomIsbn()
    const full = JSON.parse(
      readFileSync(
        new URL('../fixtures/finna/9780007447831.json', import.meta.url),
        'utf8',
      ).replaceAll('9780007447831', isbn13),
    ) as Body
    const untrimmed = await bookWith(full, isbn13)
    const empty = await bookWith({ records: [] })
    // The ISBN edited after the save: no stored record matches, so nothing is dropped.
    const edited = await bookWith(full)
    const info = vi.spyOn(payload.logger, 'info')

    await up({ db: payload.db.drizzle, payload, req: await createLocalReq({}, payload) })

    const match = full.records.find(({ id }) => id === 'helmet.2016129')
    expect(await storedFinna(untrimmed.id)).toStrictEqual({ ...full, records: [match] })
    expect(await storedFinna(empty.id)).toStrictEqual({ records: [] })
    expect(await storedFinna(edited.id)).toStrictEqual(full)
    const report = info.mock.calls
      .map(([message]) => message)
      .find((message) => typeof message === 'string' && message.startsWith('Trimmed Finna'))
    const trimmed = Number(/on (\d+) of \d+ Books$/.exec(String(report))?.[1])
    expect(trimmed).toBeGreaterThanOrEqual(1)
  })
})
