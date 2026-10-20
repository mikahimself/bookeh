// The fixture source (Story 3.52): the captured Finna responses in `tests/fixtures/finna/`,
// served in place of every real source when `BOOKEH_SOURCES=fixture`, for the e2e lane.
// Refused in production. Its covers come from the app itself (`/data/fixture-cover/`).
import fs from 'node:fs/promises'
import path from 'node:path'

import sharp from 'sharp'

import type { Source, SourceResult } from '../source'
import { finnaResults } from './finna'
import { compact, lookupFailed } from './shared'

/** The environment the selection reads; `process.env` unless a test passes its own. */
export type SourceEnv = Readonly<Record<string, string | undefined>>

const LABEL = 'Fixture'
const ISBN13 = /^\d{13}$/

/**
 * Whether the fixture source replaces the real ones: `BOOKEH_SOURCES` unset
 * or empty is `false`, `fixture` is `true`. Throws on any other value, and on
 * `fixture` under `NODE_ENV=production`.
 */
export function usesFixtureSources(env: SourceEnv = process.env): boolean {
  const value = env.BOOKEH_SOURCES
  if (value === undefined || value === '') return false
  if (value !== 'fixture') {
    throw new Error(`BOOKEH_SOURCES must be unset or 'fixture', not '${value}'`)
  }
  if (env.NODE_ENV === 'production') {
    throw new Error('BOOKEH_SOURCES=fixture is refused under NODE_ENV=production')
  }
  return true
}

/** The app's own origin, which serves the fixture covers. */
export function fixtureOrigin(env: SourceEnv = process.env): string {
  return `http://localhost:${env.PORT ?? '3000'}`
}

/** The captured body for `isbn13`; `null` when there is no fixture, `undefined` after a logged failure. */
async function readFixture(isbn13: string): Promise<unknown> {
  if (!ISBN13.test(isbn13)) return null
  const file = path.resolve(process.cwd(), 'tests/fixtures/finna', `${isbn13}.json`)
  let text: string
  try {
    text = await fs.readFile(file, 'utf8')
  } catch (err) {
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === 'ENOENT') return null
    return lookupFailed(LABEL, isbn13, 'fixture unreadable', { err })
  }
  try {
    return JSON.parse(text) as unknown
  } catch (err) {
    return lookupFailed(LABEL, isbn13, 'fixture is not JSON', { err })
  }
}

export const fixture: Source = {
  id: 'fixture',
  async lookupByIsbn(isbn13) {
    const body = await readFixture(isbn13)
    if (body === null) return []
    if (body === undefined) return undefined
    return finnaResults(body, isbn13)?.map((result): SourceResult =>
      compact({
        ...result,
        coverUrl: result.coverUrl ? `${fixtureOrigin()}/data/fixture-cover/${isbn13}` : undefined,
        source: 'fixture',
        raw: { fixture: body },
      }),
    )
  },
}

/**
 * A generated 300×450 JPEG for `isbn13` when fixture mode is on and the
 * ISBN's fixture has a cover; otherwise `undefined`.
 */
export async function fixtureCover(
  isbn13: string,
  env: SourceEnv = process.env,
): Promise<Buffer | undefined> {
  if (!usesFixtureSources(env)) return undefined
  const body = await readFixture(isbn13)
  if (body === null || body === undefined) return undefined
  if (!finnaResults(body, isbn13)?.some((result) => result.coverUrl)) return undefined
  return sharp({
    create: { width: 300, height: 450, channels: 3, background: { r: 120, g: 90, b: 60 } },
  })
    .jpeg()
    .toBuffer()
}
