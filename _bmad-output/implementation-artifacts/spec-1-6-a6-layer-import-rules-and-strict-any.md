---
title: 'Story 1.6 [A6] Layer import rules and strict `any`'
type: 'chore'
created: '2026-10-09'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context: []
baseline_commit: '171076371ac87e29a31a88e2a1cf63eabb1cfd23'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The spine's import directions (Design Paradigm, lines 56-64) and its Types and Logging conventions are prose only. `no-explicit-any` is still a warning (a named scaffold gap) and nothing bans `console.*`, so every story from 1.7 on could erode the layering unnoticed.

**Approach:** Extend `eslint.config.mjs` so lint rejects every import direction the spine forbids, makes `@typescript-eslint/no-explicit-any` an error with one file override for `rawMetadata`, and makes `no-console` an error. Prove each rule once with throwaway fixture files that fail lint, then delete them and record the output.

**Decisions:**
- A client component is a file whose directive prologue contains `'use client'`; a small inline rule in `eslint.config.mjs` checks it (no new dependency, no file-naming convention).
- The `any` override applies to `src/fields/rawMetadata.ts` only (the field definition's home per the spine's `src/fields` convention). The story that adds the field may move the glob.
- `no-console` is an error everywhere lint runs, tests and helpers included: the spine says "no `console.*` in committed code".
- The `@base-ui/react` ban (spine, UI primitives) waits for Story 3.40, which creates the wrappers.
- Mechanism (Mika, 2026-10-09): the directory-level rules use `import/no-restricted-paths` zones from the already-installed `eslint-plugin-import`, which resolves `../payload` and `@/lib/payload` alike; `@typescript-eslint/no-restricted-imports` carries only the two name-level rules. The AC's "`no-restricted-imports`" is read as ESLint's import restrictions. Spec kept at full size: one goal, the Code Map is the overage.

## Boundaries & Constraints

**Always:** Keep `eslint-config-next` and its plugins as the base. Every rule is `error`. Rules target directories that exist later (`src/lib/*`, `src/access`, `src/fields`) and stay silent until code appears there. `npm run lint` stays green on the current tree (three pre-existing warnings allowed). CI runs `npm run lint` already; no workflow change.

**Never:** No new npm dependency. No fixture left in the tree. No source-file changes beyond the config. No `src/lib`, `src/access` or `src/fields` modules created (Stories 1.7 onward). No `tsconfig` changes. No rule for `@base-ui/react`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Layer rule | `src/lib/x.ts` imports `@/app/(frontend)/page` or `../app/(frontend)/page` | lint error naming the restricted zone | N/A |
| Collection rule | `src/collections/X.ts` imports `@/payload.config` | lint error; `@/access/*`, `@/fields/*` and `@/payload-types` pass | N/A |
| Service one-way | `src/lib/copies/x.ts` imports `@/lib/catalogue/y` | lint error; `catalogue` importing `copies` passes | N/A |
| Metadata isolation | `src/lib/metadata/x.ts` imports `@/lib/payload` or `@/lib/undo` | lint error; `@/lib/errors` passes | N/A |
| Frontend gateway | `src/app/(frontend)/x.ts` imports `{ gateway }` from `@/lib/payload` | lint error; `{ requireUser, requireUserOrThrow }` and `import type` pass | N/A |
| Client component | file with `'use client'` imports a value from `@/lib/copies` | lint error; `import type` and `@/lib/shelf/query` pass; same file without the directive passes | N/A |
| Strict any | `const x: any` in `src/collections/Users.ts` | error; the same line in `src/fields/rawMetadata.ts` passes | N/A |
| Console | `console.log()` in `tests/helpers/seedUser.ts` | error | N/A |

</frozen-after-approval>

## Code Map

- `eslint.config.mjs` -- flat config: `nextVitals`, `nextTs`, one rules block, `globalIgnores`. Add: a `bookeh` inline plugin with `client-lib-imports`; a block for `src/**` with `import/no-restricted-paths` zones; a block for `src/app/(frontend)/**` with `@typescript-eslint/no-restricted-imports` patterns (`regex: '/lib/payload(/|$)'`, `allowImportNames: ['requireUser', 'requireUserOrThrow']`, `allowTypeImports: true`); `no-explicit-any: 'error'` and `no-console: 'error'` in the shared block; a `files: ['src/fields/rawMetadata.ts']` block turning `no-explicit-any` off.
- `node_modules/eslint-config-next/dist/index.js:115-165` -- registers `import` (eslint-plugin-import 2.32) with `import/resolver` `typescript` + `node`, and `@typescript-eslint` (typescript-eslint 8.69). Reuse both; do not re-register.
- `node_modules/eslint-plugin-import/lib/rules/no-restricted-paths.js:11-22,160-185` -- `zones[].target` is the importing directory, `from` the forbidden one, `except` paths relative to `from` (files allowed: `containsPath` accepts `relative === ''`). Imports the resolver cannot resolve are skipped, so fixtures must import existing files.
- `node_modules/@typescript-eslint/eslint-plugin/dist/rules/no-restricted-imports.js:176-200` -- `allowTypeImports` works with `regex` patterns; `import type` and all-`type` specifier lists pass.
- `tsconfig.json` -- `@/*` → `./src/*`; the resolver follows it.
- `tests/helpers/seedUser.ts:15` -- the only `any` mention today is a comment; no `console.*` anywhere in `src` or `tests`.
- Zones (allowed imports from `src/lib` besides the module itself, `errors.ts` and `processState.ts`): `catalogue` → `copies`, `wishlists`, `books`, `metadata`, `payload`, `undo`; `wishlists`, `loans` → `copies`, `people`, `payload`, `undo`; `shelf` → `books`, `payload`, `undo`; `tags` → `books`, `shelf`, `payload`, `undo`; `copies`, `people`, `books`, `account` → `payload`, `undo`; `undo` → `payload`; `metadata` and `payload` → nothing else. Plus `src/lib` ✗ `src/app`; `src/collections` ✗ `src` except `access`, `fields`, `payload-types.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `eslint.config.mjs` -- `no-explicit-any` and `no-console` to `error`; `rawMetadata` override -- Types and Logging conventions.
- [x] `eslint.config.mjs` -- directory zones per the Code Map, one `message` naming the spine rule -- Design Paradigm lines 58-62.
- [x] `eslint.config.mjs` -- `@typescript-eslint/no-restricted-imports` block for `src/app/(frontend)/**` -- line 63.
- [x] `eslint.config.mjs` -- inline `bookeh/client-lib-imports`: on files with a `'use client'` directive, report non-type imports that resolve under `src/lib` except `src/lib/shelf/query` -- line 64.
- [x] temporary fixtures under `src/` -- one file per matrix row (plus the stub targets the resolver needs); run `npm run lint`; paste the error list into Implementation Notes; delete them all -- AC 4.

**Acceptance Criteria:**
- Given the fixtures, when lint runs, then every matrix row's failing input is reported as an error and every passing input is clean.
- Given the fixtures removed, when `npm run lint` and `git status` run, then lint exits 0 with only the three pre-existing warnings and only `eslint.config.mjs` is modified.

## Implementation Notes

**Config shape (`eslint.config.mjs`):** shared rules block now has `no-explicit-any: 'error'` and `no-console: 'error'`; a `files: ['src/fields/rawMetadata.ts']` block turns `no-explicit-any` off. A `files: ['src/**']` block registers the inline `bookeh` plugin and runs `import/no-restricted-paths` (with `basePath` set to the repo root so zones do not depend on cwd) plus `bookeh/client-lib-imports`. A `files: ['src/app/(frontend)/**']` block carries `@typescript-eslint/no-restricted-imports` with the `/lib/payload(/|$)` regex pattern, `allowImportNames` and `allowTypeImports`. No plugin re-registered; `import` and `@typescript-eslint` come from `eslint-config-next`.

**Zones:** `src/lib` from `src/app`; `src/collections` from `src` except `./access`, `./fields`, `./payload-types.ts`; one zone per `src/lib/<service>` (`catalogue`, `wishlists`, `loans`, `shelf`, `tags`, `copies`, `people`, `books`, `account`, `undo`, `metadata`, `payload`) from `src/lib`, except itself, `errors`, `processState` and the Code Map's allowed list. Each `except` name is emitted twice, `./name` and `./name.ts`, so the rule holds whether a module lands as a directory (`lib/undo/index.ts`) or a file (`lib/undo.ts`); `no-restricted-paths` compares resolved absolute file paths, and `lib/undo.ts` is not "under" `lib/undo`. Verified both forms with fixtures.

**Client rule:** `bookeh/client-lib-imports` looks for an `ExpressionStatement` with `directive === 'use client'` in `Program.body`, then reports every `ImportDeclaration` that is not `import type` / all-`type` specifiers whose source resolves under `src/lib`. Resolution is path-only (`@/` -> `src/`, `./` and `../` against the file's directory); bare package specifiers are ignored. Exception: resolved path minus extension equals `src/lib/shelf/query`. Dynamic `import()` and `export ... from` are not checked.

**Fixture run (all fixtures deleted afterwards).** Stubs: `src/lib/errors.ts`, `src/lib/payload/index.ts` (exports `gateway`, `requireUser`, `requireUserOrThrow`, `type Ctx`), `src/lib/undo/index.ts`, `src/lib/catalogue/y.ts`, `src/lib/copies/index.ts`, `src/lib/shelf/query.ts`, `src/access/isAdmin.ts`, `src/fields/ownerField.ts`. Failing/passing inputs per matrix row in `src/lib/x.ts`, `src/collections/Fixture.ts`, `src/lib/copies/x.ts` + `src/lib/catalogue/x.ts`, `src/lib/metadata/x.ts`, `src/app/(frontend)/fx/x.ts`, `src/app/(frontend)/fx/Client.tsx` + `Server.tsx` (same imports without the directive), `src/fields/rawMetadata.ts` + a `const x: any` line in `src/collections/Users.ts`, `console.log()` in `tests/helpers/seedUser.ts`. `npm run lint` output (paths relative to repo root):

```
src/app/(frontend)/fx/Client.tsx
  2:28  error  Spine, Design Paradigm: a 'use client' component imports from src/lib only types and lib/shelf/query. Remove the import, or make it `import type`  bookeh/client-lib-imports

src/app/(frontend)/fx/x.ts
  1:10  error  'gateway' import from '@/lib/payload' is restricted because only 'requireUser,requireUserOrThrow' import(s) is/are allowed. Spine, Design Paradigm: src/app/(frontend) imports from lib/payload only requireUser, requireUserOrThrow and types  @typescript-eslint/no-restricted-imports

src/collections/Fixture.ts
  1:20  error  Unexpected path "@/payload.config" imported in restricted zone. Spine, Design Paradigm: src/collections imports only from src/access and src/fields  import/no-restricted-paths

src/collections/Users.ts
  16:10  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

src/fields/rawMetadata.ts
  1:1  warning  Unused eslint-disable directive (no problems were reported from '@typescript-eslint/no-unused-vars')

src/lib/copies/x.ts
  1:31  error  Unexpected path "@/lib/catalogue/y" imported in restricted zone. Spine, Design Paradigm: lib/copies may import from src/lib only errors, processState, payload, undo  import/no-restricted-paths

src/lib/metadata/x.ts
  1:25  error  Unexpected path "@/lib/payload" imported in restricted zone. Spine, Design Paradigm: lib/metadata may import from src/lib only errors, processState  import/no-restricted-paths
  2:26  error  Unexpected path "@/lib/undo" imported in restricted zone. Spine, Design Paradigm: lib/metadata may import from src/lib only errors, processState     import/no-restricted-paths

src/lib/x.ts
  1:15  error  Unexpected path "@/app/(frontend)/page" imported in restricted zone. Spine, Design Paradigm: src/lib never imports from src/app   import/no-restricted-paths
  2:15  error  Unexpected path "../app/(frontend)/page" imported in restricted zone. Spine, Design Paradigm: src/lib never imports from src/app  import/no-restricted-paths

tests/helpers/seedUser.ts
  48:1  error  Unexpected console statement  no-console

✖ 14 problems (10 errors, 4 warnings)
```

(The other three warnings are the pre-existing `no-unused-vars` ones in `tests/e2e`; the `rawMetadata.ts` warning is the fixture's own unused disable directive, which confirms `any` passed there.) Every passing input was clean: `@/access/*`, `@/fields/*`, `@/payload-types` in the collection; `catalogue` -> `copies`; `metadata` -> `errors`; `requireUser`, `requireUserOrThrow` and `import type` from `lib/payload`; `import type` and `lib/shelf/query` in the client component; `Server.tsx` entirely.

A second run checked relative specifiers (`../../../lib/copies`, `../../../lib/payload` from a client component: both reported) and `lib/undo` as a file (`src/lib/undo.ts` imported from `lib/copies` via `@/lib/undo` and `../undo`: clean).

**Review fixes (2026-10-09):**
- `bookeh/client-lib-imports` now uses node visitors: `Program` sets `isClient`; `ImportDeclaration` (skip `importKind === 'type'` / all-type specifiers), `ExportNamedDeclaration` with `source` (skip `exportKind === 'type'` / all-type specifiers), `ExportAllDeclaration` with `source` (skip `exportKind === 'type'`) and `ImportExpression` with a string `Literal` source are all checked.
- `resolveSource` also handles the tsconfig `baseUrl` form (`'src/lib/...'`).
- `isRestricted` treats `resolved === libDir` (`@/lib` itself) as under `src/lib`.
- New zone: `src/lib/errors.ts` and `src/lib/processState.ts` from `src`, no exceptions.
- New `files: ['src/lib/metadata/**']` block with `@typescript-eslint/no-restricted-imports`: `paths` `payload`, `@payload-config`, `@/payload.config`, `drizzle-orm`, `@payloadcms/db-postgres` and `patterns` regex `(^@/|/)collections(/|$)`, all `allowTypeImports: true`.
- Fixture run for the fixes (deleted afterwards): a `'use client'` file with `export { copiesStub } from '@/lib/copies'`, `export * from '@/lib/copies'`, `import { libIndex } from '@/lib'`, `import ... from 'src/lib/copies'` and `await import('@/lib/catalogue')` reported 5 errors; `export type { Copy } from '@/lib/copies'` and `export * from '@/lib/shelf/query'` passed; the same file without the directive was clean. `src/lib/errors.ts` importing `@/lib/processState` and `../collections/Users` reported 2 errors. `src/lib/metadata/x.ts` importing the five names plus `@/collections/Users` and `../../collections/Media` reported 7 errors; `import type` from `payload` passed.
- `eslint.config.mjs` formatted with the project's Prettier config.

**After teardown:** `npm run lint` exit 0, 3 warnings, 0 errors; `tsc --noEmit` exit 0; `git status --short` shows `eslint.config.mjs` modified plus this spec and the pre-existing `sprint-status.yaml` change.

## Spec Change Log

## Review Triage Log

- No repeatable check that a forbidden input fails lint; a dead config (typo'd zone key, resolver change, parser no longer exposing `directive`, severities back to `warn`) passes CI identically (verification-gap, pre-verified; blind: RuleTester spec for the inline rule) -- medium, real. Route: defer, the frozen intent chose throwaway fixtures and bars fixtures in the tree; a `RuleTester` unit spec for the inline rule alone needs no on-disk fixtures and is the cheap half.
- Zone `target` side does not accept a single-file module (`src/lib/undo.ts`) the way `libExcept` does on the import side (verification-gap other) -- low, rejected: the spine's source tree (line 557-560) declares `payload/`, `undo/` and every service as directories.
- `no-console` and `no-explicit-any` apply to config files too (verification-gap other) -- false: no bad outcome; the frozen decision says everywhere lint runs.
- `src/collections` zone forbids a collection importing a sibling collection (blind) -- low, rejected: the spine says collections import only `src/access` and `src/fields`; Payload relations take slugs, so no story needs a sibling import.
- `sprint-status.yaml` says `in-progress` while the spec says `in-review` (blind) -- false: the sync step writes the sprint file at implement and close-out by design (same ruling as Story 1.5).
- Direct Payload access is not banned: any service, `lib/metadata` or a frontend page may import `getPayload` from `payload`, `@payload-config`, `@/payload.config`, `@/collections/*` or `drizzle-orm`, and the frontend may import `lib/metadata` directly, so the diagram's SVC → GW → PL and FE → SVC arrows hold only by convention (blind; edge-case x3 and the "every import direction" claim) -- medium, real: the zones police `src/lib` ↔ `src/lib` and `src/app` only. Route: the `lib/metadata` part is patched (no exceptions needed); the rest is deferred to the gateway story, because the exception set (`catalogue` system privileges under AD-3, `shelf` Drizzle under AD-7, which `payload` type imports services need) is decided there, and the epics AC enumerates only lines 58-64.
- Inline client rule misses `export … from`, `export *` and `import()` (blind, edge-case; verified silent) -- medium, real: the other two mechanisms cover re-exports, so this was the one hole. Route: patch.
- Zones report `import type` across a forbidden direction while the frontend block and client rule allow it (blind) -- low, rejected: the spine's one-way rule has no type exception and says each type is imported from the module that declares it; no bad outcome named.
- Spine contradicts its own allowlist: AD-5 (line 116) has `editBook()` in `lib/catalogue` writing personal tags "through their own writers", which is `changeTags()` in `lib/tags` (line 249), but `catalogue` may not import `tags`; AD-18 (line 247) has `lib/copies` resolving `location: undefined` to the profile's default location, which only `lib/account` reads (line 251), while `copies` imports no service (blind) -- medium for tags, verified in the spine; maybe-false for copies, since the gateway's context user may already carry `defaultLocation`. Pre-existing planning-document conflict. Route: defer.
- `import/no-unresolved` is off, so a typo'd forbidden import passes lint (blind) -- false: CI runs `npm run typecheck` after lint, and `tsc` rejects every unresolved import.
- Client rule skips the tsconfig `baseUrl` form `from 'src/lib/copies'` (edge-case, verified silent) -- low, real: `baseUrl: "."` makes it resolve. Route: patch (one line).
- `@/lib/shelf/query/index` would be reported although allowed (edge-case) -- false: the spine names `lib/shelf/query.ts`, a file, so `query/index` cannot exist.
- `@/lib` directory index bypasses the client rule because `resolved === libDir` is not "under" it (edge-case, verified silent) -- low, real. Route: patch (one condition).
- `src/lib/errors.ts` and `src/lib/processState.ts` "import nothing from the project" (spine line 62) is unenforced (edge-case, verified silent) -- low, real: one more zone with file targets, which `containsPath` accepts. Route: patch.
- Frontend `import('@/lib/payload')` bypasses `no-restricted-imports`, which checks static declarations only (edge-case, verified silent) -- low, rejected: a dynamic import of the gateway from a page is not everyday code, and the fix adds a second mechanism for the same rule.
- The `any` override glob may miss if `rawMetadata` lands in `src/fields/bookFields.ts` (edge-case) -- low, rejected: the frozen decision names `src/fields/rawMetadata.ts` and says the field story may move the glob; the source tree names no file for it.

## Verification

**Commands:**
- `npm run lint` -- expected: exit 0, 3 warnings, 0 errors, after fixtures are removed.
- `npm run typecheck` -- expected: exit 0 (config is `.mjs`; no TS impact).
- `git status --short` -- expected: only `eslint.config.mjs` and this spec.
