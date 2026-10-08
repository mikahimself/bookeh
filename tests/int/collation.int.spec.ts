import { getPayload, Payload } from 'payload'
import config from '@/payload.config'

import { describe, it, beforeAll, expect } from 'vitest'

let payload: Payload

describe('database collation', () => {
  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
  })

  it('is ICU fi-FI on the connected database', async () => {
    const { pool } = payload.db
    const { rows } = await pool.query<{ datlocprovider: string; daticulocale: string | null }>(
      'select datlocprovider, daticulocale from pg_database where datname = current_database()',
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({ datlocprovider: 'i', daticulocale: 'fi-FI' })
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
