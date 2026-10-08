import { describe, expect, it } from 'vitest'

import { testDatabaseUrl } from '../helpers/testDatabase'

describe('testDatabaseUrl', () => {
  it('points the dev URL at bookeh_test', () => {
    expect(testDatabaseUrl('postgres://bookeh:bookeh@localhost:5432/bookeh')).toBe(
      'postgres://bookeh:bookeh@localhost:5432/bookeh_test',
    )
  })

  it('keeps the query string', () => {
    expect(testDatabaseUrl('postgres://bookeh:bookeh@localhost:5432/bookeh?sslmode=disable')).toBe(
      'postgres://bookeh:bookeh@localhost:5432/bookeh_test?sslmode=disable',
    )
  })

  it.each([undefined, ''])('throws naming DATABASE_URL when it is %j', (url) => {
    expect(() => testDatabaseUrl(url)).toThrow(/DATABASE_URL/)
  })
})

describe('unit project', () => {
  it('has no reachable database', () => {
    expect(new URL(process.env.DATABASE_URL ?? '').hostname).toBe(
      'unit-tests-have-no-database.invalid',
    )
  })
})
