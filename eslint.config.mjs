import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const srcDir = path.join(rootDir, 'src')
const libDir = path.join(srcDir, 'lib')

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
  copies: ['payload', 'undo'],
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

/**
 * Spine, Design Paradigm: client components import from `src/lib` only types
 * and `lib/shelf/query.ts`. A client component is a file whose directive
 * prologue contains 'use client'.
 */
const clientLibImports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Client components import from src/lib only types and lib/shelf/query.',
    },
    schema: [],
    messages: {
      restricted:
        "Spine, Design Paradigm: a 'use client' component imports from src/lib only types and lib/shelf/query. Remove the import, or make it `import type`.",
    },
  },
  create(context) {
    const filename = context.physicalFilename ?? context.filename
    const fileDir = path.dirname(filename)
    const shelfQuery = path.join(libDir, 'shelf', 'query')

    const resolveSource = (source) => {
      if (source.startsWith('@/')) return path.join(srcDir, source.slice(2))
      if (source.startsWith('src/')) return path.join(rootDir, source)
      if (source.startsWith('./') || source.startsWith('../')) return path.resolve(fileDir, source)
      return null
    }

    const isRestricted = (source) => {
      const resolved = resolveSource(source)
      if (!resolved || (resolved !== libDir && !resolved.startsWith(libDir + path.sep)))
        return false
      const withoutExt = resolved.replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, '')
      return withoutExt !== shelfQuery
    }

    const isTypeOnly = (node, kind) =>
      node[kind] === 'type' ||
      (node.specifiers?.length > 0 && node.specifiers.every((s) => s[kind] === 'type'))

    let isClient = false
    const check = (node) => {
      if (isClient && isRestricted(node.source.value)) {
        context.report({ node: node.source, messageId: 'restricted' })
      }
    }

    return {
      Program(program) {
        isClient = program.body.some(
          (statement) =>
            statement.type === 'ExpressionStatement' && statement.directive === 'use client',
        )
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
      bookeh: { rules: { 'client-lib-imports': clientLibImports } },
    },
    rules: {
      'import/no-restricted-paths': ['error', { basePath: rootDir, zones: importZones }],
      'bookeh/client-lib-imports': 'error',
    },
  },
  {
    // Spine, AD-2: roles are tested only through the helpers in src/access/roles.ts.
    // Tests may assert on `roles`. A later block that sets no-restricted-syntax
    // for these files replaces these selectors, so it must include them.
    files: ['src/**'],
    ignores: ['src/access/roles.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...[
          "MemberExpression[property.name='roles'][computed=false]",
          "MemberExpression[property.value='roles']",
          "ObjectPattern > Property[key.name='roles']",
        ].map((selector) => ({
          selector,
          message:
            'Spine, AD-2: test roles only through the helpers in src/access/roles.ts (isAdmin, canEditShared).',
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
    // requireUser, requireUserOrThrow and types. It never calls the gateway.
    files: ['src/app/(frontend)/**'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '/lib/payload(/|$)',
              allowImportNames: ['requireUser', 'requireUserOrThrow'],
              allowTypeImports: true,
              message:
                'Spine, Design Paradigm: src/app/(frontend) imports from lib/payload only requireUser, requireUserOrThrow and types.',
            },
          ],
        },
      ],
    },
  },
  globalIgnores([
    '.next/**',
    'media/**',
    'test-results/**',
    'playwright-report/**',
    'blob-report/**',
    'src/payload-types.ts',
    'src/payload-generated-schema.ts',
  ]),
])

export default eslintConfig
