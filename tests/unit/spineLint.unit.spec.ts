import { existsSync } from 'node:fs'
import path from 'node:path'

import { ESLint } from 'eslint'
import { beforeAll, describe, expect, it } from 'vitest'

// Samples through the real eslint.config.mjs: `clientLibImports.unit.spec.ts`
// proves the custom rules, this spec that the config mounts them and that the
// zones and bans say what the spine's import table says. A sample's file need
// not exist; what it imports must, or the zone cannot resolve it.

const root = path.resolve(import.meta.dirname, '../..')
const ZONES = 'import/no-restricted-paths'
const BANS = '@typescript-eslint/no-restricted-imports'

let eslint: ESLint

const reports = async (file: string, code: string) => {
  const [result] = await eslint.lintText(code, { filePath: path.join(root, 'src', file) })
  return result!.messages
}

const importOf = (source: string) => `import { x } from '${source}'\nexport const y = x\n`

const expectReport = async (file: string, code: string, ruleId: string, message: string) => {
  const hits = (await reports(file, code)).filter((report) => report.ruleId === ruleId)
  expect(hits).toHaveLength(1)
  expect(hits[0]!.message).toContain(message)
}

// The first call loads the config, which outgrows a test's 5 s when cold.
beforeAll(async () => {
  eslint = new ESLint({ cwd: root })
  await eslint.calculateConfigForFile(path.join(root, 'src/lib/errors.ts'))
}, 30_000)

describe('layer zones', () => {
  const COPIES = '@/lib/copies/createCopy'

  it.each([
    ['catalogue', '@/lib/loans/loans'],
    ['wishlists', '@/lib/shelf/query'],
    ['loans', '@/lib/wishlists/wishlists'],
    ['shelf', COPIES],
    ['tags', COPIES],
    ['stats', COPIES],
    ['copies', '@/lib/people/people'],
    ['people', COPIES],
    ['books', COPIES],
    ['account', COPIES],
    ['undo', COPIES],
    ['metadata', COPIES],
    ['backup', COPIES],
    ['payload', COPIES],
  ])('lib/%s refuses an edge outside its list', async (service, source) => {
    await expectReport(
      `lib/${service}/sample.ts`,
      importOf(source),
      ZONES,
      `Spine, Design Paradigm: lib/${service} may import from src/lib only`,
    )
  })

  it.each([
    ['lib/copies/sample.ts', '@/app/(frontend)/ref', 'src/lib imports only from'],
    ['lib/copies/sample.ts', '@/access/owner', 'src/lib imports only from'],
    ['collections/Sample.ts', COPIES, 'src/collections imports only from'],
    ['lib/errors.ts', '@/lib/processState', 'lib/errors.ts and lib/processState.ts import'],
    ['fields/sample.ts', COPIES, 'src/fields imports only from'],
    ['i18n/sample.ts', COPIES, 'src/i18n imports only from'],
    ['lib/catalogue/sample.ts', '@/payload.config', 'Spine, AD-2: only lib/payload imports'],
    ['lib/shelf/sample.ts', '@/payload.config', 'Spine, AD-2: only lib/payload imports'],
    ['app/(frontend)/sample.ts', '@/collections/Copies', 'src/app/(frontend) imports only from'],
    ['app/(frontend)/sample.ts', '@/access/owner', 'src/app/(frontend) imports only from'],
  ])('%s refuses %s', async (file, source, message) => {
    await expectReport(file, importOf(source), ZONES, message)
  })

  it('counts a type import, which the rule cannot tell apart', async () => {
    await expectReport(
      'fields/sample.ts',
      "import type { x } from '@/lib/copies/createCopy'\nexport type Y = x\n",
      ZONES,
      'Spine, Design Paradigm: src/fields imports only from',
    )
  })

  it.each([
    ['lib/copies/sample.ts', '@/fields/isbn'],
    ['lib/copies/sample.ts', '@/access/roles'],
    ['lib/copies/sample.ts', '@/i18n/locale'],
    ['lib/copies/sample.ts', '@/payload-types'],
    ['lib/payload/sample.ts', '@/payload.config'],
    ['fields/isbn.ts', '@/lib/errors'],
    ['fields/sample.ts', '@/access/roles'],
    ['i18n/sample.ts', '@/lib/payload/context'],
    ['app/(frontend)/sample.ts', '@/fields/isbn'],
    ['app/(frontend)/sample.ts', '@/i18n/locale'],
    ['app/(frontend)/sample.ts', '@/access/roles'],
    ['app/(frontend)/sample.ts', '@/payload-types'],
    ['app/(frontend)/sample.ts', '@/lib/shelf/query'],
  ])('%s keeps %s', async (file, source) => {
    // A zone cannot judge an import that does not resolve.
    expect(existsSync(path.join(root, 'src', `${source.slice(2)}.ts`))).toBe(true)
    const hits = (await reports(file, importOf(source))).filter(({ ruleId }) => ruleId === ZONES)
    expect(hits).toEqual([])
  })
})

describe('gateway, AD-2', () => {
  const GATEWAY = "Spine, AD-2: services reach Payload only through lib/payload's gateway"

  it.each(['@payload-config', '@/payload.config', '@/collections/Copies', 'drizzle-orm'])(
    'a service may not import %s',
    async (source) => {
      await expectReport('lib/copies/sample.ts', importOf(source), BANS, GATEWAY)
    },
  )

  it('a service may not import getPayload', async () => {
    await expectReport(
      'lib/copies/sample.ts',
      "import { getPayload } from 'payload'\nexport const run = getPayload\n",
      BANS,
      GATEWAY,
    )
  })

  it('lib/metadata has no database access', async () => {
    await expectReport(
      'lib/metadata/sample.ts',
      importOf('drizzle-orm'),
      BANS,
      'Spine, Design Paradigm: lib/metadata has no database access.',
    )
  })

  it.each(['lib/copies/sample.ts', 'app/(frontend)/sample.ts', 'i18n/sample.ts'])(
    '%s may not reach through .payload',
    async (file) => {
      await expectReport(
        file,
        'export const run = (ctx) => ctx.req.payload.find({})\n',
        'no-restricted-syntax',
        GATEWAY,
      )
    },
  )
})

describe('frontend imports', () => {
  const file = 'app/(frontend)/sample.ts'

  it('refuses the gateway', async () => {
    await expectReport(
      file,
      importOf('@/lib/payload/gateway'),
      BANS,
      'src/app/(frontend) imports from lib/payload only',
    )
  })

  it('keeps requireUser from lib/payload', async () => {
    const hits = (
      await reports(file, "export { requireUser } from '@/lib/payload/context'\n")
    ).filter(({ ruleId }) => ruleId === BANS)
    expect(hits).toEqual([])
  })

  it('refuses Payload itself', async () => {
    await expectReport(
      file,
      importOf('@payload-config'),
      BANS,
      'src/app/(frontend) reaches Payload only through the services',
    )
  })

  it('refuses a value from lib/metadata', async () => {
    await expectReport(
      file,
      importOf('@/lib/metadata/lookup'),
      BANS,
      'src/app/(frontend) imports from lib/metadata only types',
    )
  })

  it.each([
    ['a metadata type', "import type { x } from '@/lib/metadata/source'\nexport type Y = x\n"],
    ['the fixture cover', importOf('@/lib/metadata/sources/fixture')],
  ])('keeps %s', async (_, code) => {
    const hits = (await reports(file, code)).filter(({ ruleId }) => ruleId === BANS)
    expect(hits).toEqual([])
  })

  it('refuses a literal interface string', async () => {
    const hits = (
      await reports('app/(frontend)/sample.tsx', 'export const Sample = () => <p>Hello</p>\n')
    ).filter(({ ruleId }) => ruleId === 'react/jsx-no-literals')
    expect(hits).toHaveLength(1)
  })
})

describe('bookeh rules', () => {
  it('mounts client-lib-imports', async () => {
    await expectReport(
      'app/(frontend)/sample.tsx',
      `'use client'\n${importOf('@/lib/copies/createCopy')}`,
      'bookeh/client-lib-imports',
      "a 'use client' component imports from src/lib only types",
    )
  })

  it('mounts system-privileges', async () => {
    await expectReport(
      'lib/copies/sample.ts',
      'export const options = { overrideAccess: true }\n',
      'bookeh/system-privileges',
      'Spine, AD-3: system privileges are allowed only in src/lib/catalogue',
    )
  })
})
