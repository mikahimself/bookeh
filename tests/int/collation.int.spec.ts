import { getPayload, Payload } from 'payload'
import config from '@/payload.config'

import { describe, it, beforeAll, expect } from 'vitest'

let payload: Payload

describe('database collation', () => {
  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
  })

  it('is ICU fi-FI on bookeh, bookeh_test and template1', async () => {
    const { pool } = payload.db
    // daticulocale is the Postgres 16 column name (datlocale from 17). Only
    // the named databases: a developer's scratch libc database must not fail
    // this.
    const { rows } = await pool.query<{
      datname: string
      datlocprovider: string
      daticulocale: string | null
    }>(
      `select datname, datlocprovider, daticulocale from pg_database
       where datname in ('bookeh', 'bookeh_test', 'template1') order by datname`,
    )
    expect(rows.map((r) => r.datname)).toEqual(['bookeh', 'bookeh_test', 'template1'])
    for (const row of rows) {
      expect(row).toMatchObject({ datlocprovider: 'i', daticulocale: 'fi-FI' })
    }
  })

  it('sorts å, ä and ö after z', async () => {
    const { pool } = payload.db
    const { rows } = await pool.query<{ v: string }>(
      'select v from unnest($1::text[]) v order by v',
      [['ö', 'ä', 'å', 'z', 'a', 'o']],
    )
    expect(rows.map((r) => r.v)).toEqual(['a', 'o', 'z', 'å', 'ä', 'ö'])
  })
})
