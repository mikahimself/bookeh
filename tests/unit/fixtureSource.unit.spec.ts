import sharp from 'sharp'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { allowsCoverUrl } from '@/lib/catalogue/covers'
import { fixture, fixtureCover, usesFixtureSources } from '@/lib/metadata/sources/fixture'

import { assertTestDatabase } from '../helpers/testDatabase'

const FIXTURE_MODE = { BOOKEH_SOURCES: 'fixture', NODE_ENV: 'development', PORT: '3100' }
const SAPIENS = '9789524035699'

afterEach(() => vi.unstubAllEnvs())

describe('usesFixtureSources', () => {
  it('is off when unset or empty', () => {
    expect(usesFixtureSources({})).toBe(false)
    expect(usesFixtureSources({ BOOKEH_SOURCES: '' })).toBe(false)
  })

  it('is on for fixture outside production', () => {
    expect(usesFixtureSources(FIXTURE_MODE)).toBe(true)
  })

  it('refuses fixture in production and any other value', () => {
    expect(() => usesFixtureSources({ ...FIXTURE_MODE, NODE_ENV: 'production' })).toThrow()
    expect(() => usesFixtureSources({ BOOKEH_SOURCES: 'foo' })).toThrow()
  })
})

describe('fixture source', () => {
  it('answers from the captured Finna response, with a local cover', async () => {
    vi.stubEnv('PORT', '3100')
    const [result, ...rest] = (await fixture.lookupByIsbn(SAPIENS)) ?? []

    expect(rest).toEqual([])
    expect(result).toMatchObject({
      isbn13: SAPIENS,
      title: 'Sapiens',
      source: 'fixture',
      coverUrl: `http://localhost:3100/data/fixture-cover/${SAPIENS}`,
    })
    expect(Object.keys(result!.raw)).toEqual(['fixture'])
  })

  it('knows nothing of an ISBN without a fixture', async () => {
    expect(await fixture.lookupByIsbn('9780000000002')).toEqual([])
  })
})

describe('fixtureCover', () => {
  it('is a JPEG in fixture mode when the fixture has a cover', async () => {
    const bytes = await fixtureCover(SAPIENS, FIXTURE_MODE)

    expect(bytes).toBeDefined()
    expect(await sharp(bytes).metadata()).toMatchObject({ format: 'jpeg', width: 300, height: 450 })
  })

  it('is nothing with the mode off, or when the fixture has no cover', async () => {
    expect(await fixtureCover(SAPIENS, {})).toBeUndefined()
    expect(await fixtureCover('9780007447831', FIXTURE_MODE)).toBeUndefined()
  })
})

describe('allowsCoverUrl', () => {
  const local = new URL(`http://localhost:3100/data/fixture-cover/${SAPIENS}`)
  const finna = new URL('https://api.finna.fi/Cover/Show?id=x')

  it('allows the local origin only in fixture mode', () => {
    expect(allowsCoverUrl(local, FIXTURE_MODE)).toBe(true)
    expect(allowsCoverUrl(local, {})).toBe(false)
  })

  it("allows Finna's https host either way", () => {
    expect(allowsCoverUrl(finna, FIXTURE_MODE)).toBe(true)
    expect(allowsCoverUrl(finna, {})).toBe(true)
  })
})

describe('assertTestDatabase', () => {
  it('passes bookeh_test and refuses bookeh', () => {
    expect(() => assertTestDatabase('postgres://u:p@localhost:5432/bookeh_test')).not.toThrow()
    expect(() => assertTestDatabase('postgres://u:p@localhost:5432/bookeh')).toThrow()
  })
})
