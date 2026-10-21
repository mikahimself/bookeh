import path from 'node:path'

import { RuleTester, type Rule } from 'eslint'
import { parser } from 'typescript-eslint'
import { describe, it } from 'vitest'

import { clientLibImports } from '../../eslint.config.mjs'

RuleTester.describe = describe
RuleTester.it = it

const frontend = path.resolve(import.meta.dirname, '../../src/app/(frontend)')
const client = path.join(frontend, 'scan', 'Scanner.tsx')
const server = path.join(frontend, 'scan', 'barrel.ts')

const ruleTester = new RuleTester({
  languageOptions: { parser, ecmaVersion: 'latest', sourceType: 'module' },
})

ruleTester.run('bookeh/client-lib-imports', clientLibImports as unknown as Rule.RuleModule, {
  valid: [
    {
      filename: client,
      code: [
        "'use client'",
        "import type { Book } from '@/lib/books'",
        "import { shelfQuery } from '@/lib/shelf/query'",
      ].join('\n'),
    },
    {
      filename: client,
      code: ["'use client'", "import { checkCorners } from '@/lib/catalogue/corners'"].join('\n'),
    },
    { filename: server, code: "export type { Book } from '@/lib/books'" },
    {
      filename: path.resolve(import.meta.dirname, '../../src/lib/books/index.ts'),
      code: "export { saveBook } from '@/lib/books/save'",
    },
  ],
  invalid: [
    {
      filename: client,
      code: ["'use client'", "import { saveBook } from '@/lib/books'"].join('\n'),
      errors: [{ messageId: 'restricted' }],
    },
    {
      filename: server,
      code: "export { saveBook } from '@/lib/books'",
      errors: [{ messageId: 'reexport' }],
    },
    {
      filename: server,
      code: "export * from '@/lib/books'",
      errors: [{ messageId: 'reexport' }],
    },
    {
      filename: server,
      code: ["import { saveBook } from '@/lib/books'", 'export { saveBook }'].join('\n'),
      errors: [{ messageId: 'reexport' }],
    },
    {
      filename: server,
      code: ["import { saveBook } from '@/lib/books'", 'export default saveBook'].join('\n'),
      errors: [{ messageId: 'reexport' }],
    },
  ],
})
