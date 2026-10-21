// Readies bookeh_test for the int and e2e lanes (AD-13): migrates it with
// push off, or refuses at once when it has been schema-pushed, which
// `payload migrate` would otherwise answer with a prompt or "already exists".
// With DATABASE_PUSH set to anything but 'false' the lane pushes, so there is
// nothing to do. `--reset` drops and recreates schema `public` instead, and
// empties the lanes' `media-test`: files whose rows are gone would count as
// orphans in the media sweep.
// Run: npm run test:int, npm run test:e2e, npm run test:reset
import 'dotenv/config'

import { spawnSync } from 'node:child_process'
import { rm } from 'node:fs/promises'
import path from 'node:path'

import pg from 'pg'

import { assertTestDatabase, testDatabaseUrl } from '../tests/helpers/testDatabase'

const url = testDatabaseUrl(process.env.DATABASE_URL)

async function query(sql: string): Promise<pg.QueryResult> {
  const client = new pg.Client({ connectionString: url })
  await client.connect()
  try {
    return await client.query(sql)
  } finally {
    await client.end()
  }
}

/** A dev push records itself as a `batch = -1` row; CI's "Check push stayed off" reads the same. */
async function pushed(): Promise<boolean> {
  try {
    const { rowCount } = await query('select 1 from payload_migrations where batch = -1 limit 1')
    return (rowCount ?? 0) > 0
  } catch (error) {
    // An empty database has no payload_migrations table yet.
    if (error instanceof pg.DatabaseError && error.code === '42P01') return false
    throw error
  }
}

if (process.argv.includes('--reset')) {
  assertTestDatabase(url)
  await query('drop schema if exists public cascade; create schema public')
  await rm(path.resolve('media-test'), { recursive: true, force: true })
  process.stdout.write(
    'bookeh_test reset: schema public dropped and recreated, media-test emptied.\n',
  )
  process.exit(0)
}

if ((process.env.DATABASE_PUSH || 'false') !== 'false') process.exit(0)

if (await pushed()) {
  process.stderr.write(
    'bookeh_test has been schema-pushed (payload_migrations has a batch -1 row), so ' +
      'migrations cannot build it. Run `npm run test:reset`, then the lane again.\n',
  )
  process.exit(1)
}

// stdin ignored: a Payload prompt reads EOF instead of hanging.
const { status } = spawnSync('npm', ['run', 'payload', '--', 'migrate'], {
  stdio: ['ignore', 'inherit', 'inherit'],
  env: { ...process.env, DATABASE_URL: url, DATABASE_PUSH: 'false' },
})
if (status !== 0) {
  process.stderr.write(
    'If bookeh_test holds migrations this branch does not have, run `npm run test:reset`.\n',
  )
}
process.exit(status ?? 1)
