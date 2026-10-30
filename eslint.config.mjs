import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const srcDir = path.join(rootDir, 'src')
const libDir = path.join(srcDir, 'lib')
const appDir = path.join(srcDir, 'app')

/**
 * Import directions from the architecture spine (Design Paradigm).
 * Zones for `import/no-restricted-paths`: `target` is the importing directory,
 * `from` the forbidden one, `except` the allowed paths relative to `from`.
 * The directories exist only from Story 1.7 on; the rules stay silent until then.
 */

// Allowed imports from `src/lib` per service, besides the service itself,
// `errors.ts` and `processState.ts`.
const serviceImports = {
  catalogue: ['copies', 'wishlists', 'books', 'metadata', 'payload', 'undo'],
  wishlists: ['copies', 'people', 'payload', 'undo'],
  loans: ['copies', 'people', 'payload', 'undo'],
  shelf: ['books', 'payload', 'undo'],
  tags: ['books', 'shelf', 'payload', 'undo'],
  copies: ['account', 'payload', 'undo'],
  people: ['payload', 'undo'],
  books: ['payload', 'undo'],
  account: ['payload', 'undo'],
  undo: ['payload'],
  metadata: [],
  payload: [],
}

// Each name may be a directory (`lib/undo/`) or a file (`lib/errors.ts`).
const libExcept = (names) => names.flatMap((name) => [`./${name}`, `./${name}.ts`])

const serviceZones = Object.entries(serviceImports).map(([service, allowed]) => ({
  target: `src/lib/${service}`,
  from: 'src/lib',
  except: libExcept([service, 'errors', 'processState', ...allowed]),
  message: `Spine, Design Paradigm: lib/${service} may import from src/lib only ${[
    'errors',
    'processState',
    ...allowed,
  ].join(', ')}.`,
}))

const importZones = [
  {
    target: 'src/lib',
    from: 'src/app',
    message: 'Spine, Design Paradigm: src/lib never imports from src/app.',
  },
  {
    target: 'src/collections',
    from: 'src',
    except: ['./access', './fields', './payload-types.ts'],
    message: 'Spine, Design Paradigm: src/collections imports only from src/access and src/fields.',
  },
  {
    target: ['src/lib/errors.ts', 'src/lib/processState.ts'],
    from: 'src',
    message:
      'Spine, Design Paradigm: lib/errors.ts and lib/processState.ts import nothing from the project.',
  },
  ...serviceZones,
]

// The absolute path an `@/`, `src/` or relative import source names, or null.
const resolveSource = (source, fileDir) => {
  if (source.startsWith('@/')) return path.join(srcDir, source.slice(2))
  if (source.startsWith('src/')) return path.join(rootDir, source)
  if (source.startsWith('./') || source.startsWith('../')) return path.resolve(fileDir, source)
  return null
}

const isTypeOnly = (node, kind) =>
  node[kind] === 'type' ||
  (node.specifiers?.length > 0 && node.specifiers.every((s) => s[kind] === 'type'))

/**
 * Spine, Design Paradigm: client components import from `src/lib` only types,
 * `lib/shelf/query.ts`, `lib/catalogue/corners.ts` and
 * `lib/books/languageName.ts`, all pure. A client component is a file whose
 * directive prologue contains 'use client'. A module under `src/app` may not
 * re-export `src/lib` values either, since a client component could import
 * it: the rule reads one file at a time, so it reports the barrel, not the
 * importer.
 */
export const clientLibImports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Client components import from src/lib only types, lib/shelf/query, lib/catalogue/corners, lib/books/languageName and lib/loans/dates.',
    },
    schema: [],
    messages: {
      restricted:
        "Spine, Design Paradigm: a 'use client' component imports from src/lib only types, lib/shelf/query, lib/catalogue/corners, lib/books/languageName and lib/loans/dates. Remove the import, or make it `import type`.",
      reexport:
        'Spine, Design Paradigm: client components import from src/lib only types, lib/shelf/query, lib/catalogue/corners, lib/books/languageName and lib/loans/dates, so a module under src/app may not re-export src/lib values: a client component could import it. Import the value from src/lib in server code, or make it `export type`.',
    },
  },
  create(context) {
    const filename = context.physicalFilename ?? context.filename
    const fileDir = path.dirname(filename)
    const pure = new Set([
      path.join(libDir, 'shelf', 'query'),
      path.join(libDir, 'catalogue', 'corners'),
      path.join(libDir, 'books', 'languageName'),
      path.join(libDir, 'loans', 'dates'),
    ])
    const inApp = filename.startsWith(appDir + path.sep)

    const isRestricted = (source) => {
      const resolved = resolveSource(source, fileDir)
      if (!resolved || (resolved !== libDir && !resolved.startsWith(libDir + path.sep)))
        return false
      const withoutExt = resolved.replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, '')
      return !pure.has(withoutExt)
    }

    let isClient = false
    // Local names value-imported from a restricted source (src/app only).
    const libBindings = new Set()

    const check = (node) => {
      if (isClient && isRestricted(node.source.value)) {
        context.report({ node: node.source, messageId: 'restricted' })
      }
    }
    // `export … from` and `export * from`: a client component's own rule wins.
    const checkReexport = (node) => {
      if (isClient) check(node)
      else if (inApp && isRestricted(node.source.value)) {
        context.report({ node: node.source, messageId: 'reexport' })
      }
    }
    // `export { x }` / `export default x` of a binding imported from src/lib.
    // In a client component the import itself is already reported.
    const checkLocal = (node) => {
      if (!isClient && node.type === 'Identifier' && libBindings.has(node.name)) {
        context.report({ node, messageId: 'reexport' })
      }
    }

    return {
      Program(program) {
        isClient = program.body.some(
          (statement) =>
            statement.type === 'ExpressionStatement' && statement.directive === 'use client',
        )
        if (!inApp) return
        for (const statement of program.body) {
          if (
            statement.type !== 'ImportDeclaration' ||
            statement.importKind === 'type' ||
            !isRestricted(statement.source.value)
          )
            continue
          for (const specifier of statement.specifiers) {
            if (specifier.importKind !== 'type') libBindings.add(specifier.local.name)
          }
        }
      },
      ImportDeclaration(node) {
        if (!isTypeOnly(node, 'importKind')) check(node)
      },
      ExportNamedDeclaration(node) {
        if (node.source) {
          if (!isTypeOnly(node, 'exportKind')) checkReexport(node)
        } else if (node.exportKind !== 'type') {
          for (const specifier of node.specifiers) {
            if (specifier.exportKind !== 'type') checkLocal(specifier.local)
          }
        }
      },
      ExportAllDeclaration(node) {
        if (node.exportKind !== 'type') checkReexport(node)
      },
      ExportDefaultDeclaration(node) {
        checkLocal(node.declaration)
      },
      ImportExpression(node) {
        if (node.source.type === 'Literal' && typeof node.source.value === 'string') check(node)
      },
    }
  },
}

/**
 * Spine, AD-3: system privileges come only from `system()` in
 * src/lib/catalogue/system.ts, and only src/lib/catalogue imports it. Reports
 * every non-computed `overrideAccess` property (identifier or string key,
 * shorthand included) whose value is not the literal `false`, and a value
 * import of the helper from outside src/lib/catalogue.
 */
export const systemPrivileges = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'overrideAccess other than false only in system(), imported only from src/lib/catalogue.',
    },
    schema: [],
    messages: {
      restricted:
        'Spine, AD-3: system privileges are allowed only in src/lib/catalogue, through system() from ./system. Elsewhere use the gateway or asRequestUser(req).',
      importOutside:
        'Spine, AD-3: only src/lib/catalogue may import system() from src/lib/catalogue/system.ts.',
    },
  },
  create(context) {
    const filename = context.physicalFilename ?? context.filename
    const fileDir = path.dirname(filename)
    const catalogueDir = path.join(libDir, 'catalogue')
    const helper = path.join(catalogueDir, 'system')
    const inCatalogue = filename.startsWith(catalogueDir + path.sep)

    const isOverrideKey = (key) =>
      (key.type === 'Identifier' && key.name === 'overrideAccess') ||
      (key.type === 'Literal' && key.value === 'overrideAccess')

    const check = (node) => {
      if (inCatalogue) return
      const resolved = resolveSource(node.source.value, fileDir)
      if (resolved?.replace(/\.(ts|js)$/, '') === helper) {
        context.report({ node: node.source, messageId: 'importOutside' })
      }
    }

    return {
      Property(node) {
        // A destructuring pattern reads the option; it grants nothing.
        if (node.parent.type === 'ObjectPattern') return
        if (node.computed || !isOverrideKey(node.key)) return
        if (node.value.type === 'Literal' && node.value.value === false) return
        context.report({ node, messageId: 'restricted' })
      },
      ImportDeclaration(node) {
        if (!isTypeOnly(node, 'importKind')) check(node)
      },
      ExportNamedDeclaration(node) {
        if (node.source && !isTypeOnly(node, 'exportKind')) check(node)
      },
      ExportAllDeclaration(node) {
        if (node.source && node.exportKind !== 'type') check(node)
      },
      ImportExpression(node) {
        if (node.source.type === 'Literal' && typeof node.source.value === 'string') check(node)
      },
    }
  },
}

const noDatabaseAccess = 'Spine, Design Paradigm: lib/metadata has no database access.'

const rolesSyntax = [
  "MemberExpression[property.name='roles'][computed=false]",
  "MemberExpression[property.value='roles']",
  "ObjectPattern > Property[key.name='roles']",
].map((selector) => ({
  selector,
  message:
    'Spine, AD-2: test roles only through the helpers in src/access/roles.ts (isAdmin, canEditShared).',
}))

// Spine, AD-2 and AD-3: the gateway itself, the system-privilege allowlist
// (catalogue, shelf) and lib/metadata, which has its own stricter block.
const gatewayExempt = [
  'src/lib/payload/**',
  'src/lib/catalogue/**',
  'src/lib/shelf/**',
  'src/lib/metadata/**',
]

const throughGateway =
  "Spine, AD-2: services reach Payload only through lib/payload's gateway (import * as gateway from '@/lib/payload/gateway')."

const frontendThroughServices =
  'Spine, Design Paradigm: src/app/(frontend) reaches Payload only through the services in src/lib (and requireUser / requireUserOrThrow).'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          args: 'after-used',
          ignoreRestSiblings: false,
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^(_|ignore)',
        },
      ],
      'no-console': 'error',
    },
  },
  {
    // Spine, Types convention: `any` only for rawMetadata.
    files: ['src/fields/rawMetadata.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    files: ['src/**'],
    plugins: {
      bookeh: {
        rules: {
          'client-lib-imports': clientLibImports,
          'system-privileges': systemPrivileges,
        },
      },
    },
    rules: {
      'import/no-restricted-paths': ['error', { basePath: rootDir, zones: importZones }],
      'bookeh/client-lib-imports': 'error',
      'bookeh/system-privileges': 'error',
    },
  },
  {
    // Spine, AD-3: the helper itself and the first-user seed.
    files: ['src/lib/catalogue/system.ts', 'src/lib/account/seedFirstUser.ts'],
    rules: {
      'bookeh/system-privileges': 'off',
    },
  },
  {
    // Spine, AD-2: roles are tested only through the helpers in src/access/roles.ts.
    // Tests may assert on `roles`. A later block that sets no-restricted-syntax
    // for these files replaces these selectors, so it must include them.
    files: ['src/**'],
    ignores: ['src/access/roles.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...rolesSyntax],
    },
  },
  {
    // Spine, AD-2: services reach Payload only through the gateway in lib/payload.
    // src/i18n renders every frontend page, so it is held to the same rule.
    files: ['src/lib/**', 'src/i18n/**'],
    ignores: gatewayExempt,
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            { name: '@payload-config', allowTypeImports: true, message: throughGateway },
            {
              name: 'payload',
              importNames: [
                'default',
                'getPayload',
                'createLocalReq',
                'BasePayload',
                'createPayloadRequest',
                'reload',
              ],
              allowTypeImports: true,
              message: throughGateway,
            },
          ],
          patterns: [
            // `@/payload.config` and relative paths to it.
            '(^@/|/)payload\\.config(\\.[jt]s)?$',
            '(^@/|/)collections(/|$)',
            '^(drizzle-orm|@payloadcms/(db-postgres|drizzle)|pg)(/|$)',
          ].map((regex) => ({ regex, allowTypeImports: true, message: throughGateway })),
        },
      ],
    },
  },
  {
    // Spine, AD-2: no `ctx.req.payload.*` around the gateway. Replaces the
    // roles block's selectors for these files, so it repeats them.
    files: ['src/lib/**', 'src/i18n/**', 'src/app/(frontend)/**'],
    ignores: gatewayExempt,
    rules: {
      'no-restricted-syntax': [
        'error',
        ...rolesSyntax,
        ...[
          "MemberExpression[property.name='payload'][computed=false]",
          "MemberExpression[property.value='payload']",
          "ObjectPattern > Property[key.name='payload']",
        ].map((selector) => ({
          selector,
          message: `${throughGateway} Do not call \`req.payload\` directly.`,
        })),
      ],
    },
  },
  {
    // Spine, Design Paradigm: lib/metadata has no database access.
    files: ['src/lib/metadata/**'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            'payload',
            '@payload-config',
            '@/payload.config',
            'drizzle-orm',
            '@payloadcms/db-postgres',
          ].map((name) => ({ name, allowTypeImports: true, message: noDatabaseAccess })),
          patterns: [
            { regex: '(^@/|/)collections(/|$)', allowTypeImports: true, message: noDatabaseAccess },
          ],
        },
      ],
    },
  },
  {
    // Spine, Design Paradigm: src/app/(frontend) imports from lib/payload only
    // requireUser, requireUserOrThrow, isRowId and types. It never calls the gateway,
    // and never touches Payload, its config, its collections or the database.
    files: ['src/app/(frontend)/**'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            { name: '@payload-config', allowTypeImports: true, message: frontendThroughServices },
          ],
          patterns: [
            {
              regex: '/lib/payload(/|$)',
              allowImportNames: ['requireUser', 'requireUserOrThrow', 'isRowId'],
              allowTypeImports: true,
              message:
                'Spine, Design Paradigm: src/app/(frontend) imports from lib/payload only requireUser, requireUserOrThrow, isRowId and types.',
            },
            ...[
              '^payload(/|$)',
              '(^@/|/)payload\\.config(\\.[jt]s)?$',
              '(^@/|/)collections(/|$)',
              '^(drizzle-orm|pg)(/|$)',
              '^@payloadcms/',
            ].map((regex) => ({ regex, allowTypeImports: true, message: frontendThroughServices })),
          ],
        },
      ],
      // Every interface string comes from messages/*.json (spine, i18n).
      'react/jsx-no-literals': ['error', { noStrings: true, ignoreProps: true }],
    },
  },
  {
    // Spine, UI primitives: Base UI is wrapped once in components/ui. Core
    // no-restricted-imports, as a later block's options for the typescript
    // rule would replace the (frontend) block's above.
    files: ['src/**'],
    ignores: ['src/app/(frontend)/components/ui/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@base-ui/react', '@base-ui/react/*'],
              message:
                'Spine, UI primitives: import the wrappers in src/app/(frontend)/components/ui, never @base-ui/react.',
            },
          ],
        },
      ],
    },
  },
  globalIgnores([
    '.claude/**',
    '.next/**',
    '.next-e2e/**',
    'media/**',
    'test-results/**',
    'playwright-report/**',
    'blob-report/**',
    'src/payload-types.ts',
    'src/payload-generated-schema.ts',
  ]),
])

export default eslintConfig
