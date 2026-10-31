import { readdirSync } from 'node:fs'
import path from 'node:path'

import { expect, it } from 'vitest'

import { migrations } from '@/migrations'

// AD-13: production applies only what the index lists, so a file missing from
// it shows at the next start, and an entry without a file breaks the build.
it('lists every migration file, in order, and nothing else', () => {
  const dir = path.resolve(import.meta.dirname, '../../src/migrations')
  const files = readdirSync(dir)
    .filter((file) => file.endsWith('.ts') && file !== 'index.ts')
    .map((file) => file.slice(0, -'.ts'.length))
    .sort()

  expect(migrations.map(({ name }) => name)).toEqual(files)
})
