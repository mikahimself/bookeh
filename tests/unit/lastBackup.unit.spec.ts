import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { readLastBackup } from '@/app/(frontend)/(sections)/settings/lastBackup'

const admin = { roles: ['admin' as const] }
const now = new Date('2026-10-22T12:00:00Z')
const ago = (ms: number) => new Date(now.getTime() - ms)
const HOUR = 60 * 60 * 1000

let dir: string
let n = 0

async function statusFile(content: string): Promise<string> {
  const file = join(dir, `last-backup-${n++}.json`)
  await writeFile(file, content)
  return file
}

const status = (time: string, outcome: string) =>
  statusFile(JSON.stringify({ time, outcome, dumpSizeBytes: 1 }))

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'bookeh-backup-'))
})

afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('readLastBackup', () => {
  it('reports a fresh success as not overdue', async () => {
    const time = ago(2 * HOUR)
    const file = await status(time.toISOString(), 'success')
    expect(await readLastBackup(admin, file, now)).toEqual({
      kind: 'success',
      time,
      overdue: false,
    })
  })

  it('reports a success older than 48 hours as overdue', async () => {
    const edge = ago(48 * HOUR)
    expect(await readLastBackup(admin, await status(edge.toISOString(), 'success'), now)).toEqual({
      kind: 'success',
      time: edge,
      overdue: false,
    })
    const time = ago(48 * HOUR + 60 * 1000)
    const file = await status(time.toISOString(), 'success')
    expect(await readLastBackup(admin, file, now)).toEqual({ kind: 'success', time, overdue: true })
  })

  it('reports a failure as overdue', async () => {
    const time = ago(HOUR)
    const file = await status(time.toISOString(), 'failure')
    expect(await readLastBackup(admin, file, now)).toEqual({ kind: 'failure', time, overdue: true })
  })

  it('reports a missing file as missing', async () => {
    expect(await readLastBackup(admin, join(dir, 'absent.json'), now)).toEqual({
      kind: 'missing',
      overdue: true,
    })
  })

  it('reports a malformed file as missing', async () => {
    const missing = { kind: 'missing', overdue: true }
    expect(await readLastBackup(admin, await statusFile('not json'), now)).toEqual(missing)
    expect(await readLastBackup(admin, await status('yesterday', 'success'), now)).toEqual(missing)
  })

  it('gives a non-admin nothing', async () => {
    const file = await status(ago(HOUR).toISOString(), 'success')
    expect(await readLastBackup({ roles: ['user'] }, file, now)).toBeNull()
  })
})
