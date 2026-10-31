---
title: '7.21 [K27] Checks that guard the spine'
type: 'chore'
created: '2026-10-30'
status: 'done'
baseline_revision: '9d0f7ade1e4aa7f2f2ff824b1e95bd02ebd722be'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Spine rules rest on checks nobody checks: a migration missing from `src/migrations/index.ts` only shows at production start, a dead lint rule passes silently, and several layer edges (`src/lib`, `src/fields`, `src/i18n` and the frontend to the rest of `src`) have no zone at all (retro A3; triage A16, B4, B12, B19, B28, C23). AD-20's skip of rows that are gone and `deleteMediaRow()`'s keep-the-file contract have no test.

**Approach:** One unit spec compares the migration index with the disk. One unit spec runs sample sources through the real ESLint config. Allowlist zones are added, so the edges the code keeps are the only ones that pass, and the spine's table names them. Two integration cases pin the save's Undo after `removeCopies` and a rolled-back cover replacement.

## Boundaries & Constraints

**Always:** the samples go through the real `eslint.config.mjs` (`ESLint` class, `lintText`), not a copy of the rule options. Each sample asserts the rule id and the zone's own message. The spine's import table changes in the same commit. `npm run lint` stays at 0 errors.

**Never:** no behaviour change in `src`, except a bug either integration case exposes; no moving of imports to satisfy a zone, since the zones follow the code the epic names; no new test helpers; no Playwright; no migration.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Migration file not indexed | A `.ts` on disk with no `index.ts` entry | Unit lane fails | Names differ in the assertion |
| Index entry without a file | An entry with no `.ts` | Unit lane fails | Same |
| Kept edge | `src/fields/isbn.ts` imports `lib/errors` | No zone report | none |
| New forbidden edge | `src/fields` imports `lib/copies` | The zone reports | none |
| Copy removed before Undo | Save, `removeCopies`, Undo | Undo succeeds; created rows nothing references go | No `UNDO_FAILED` |
| Promote fails after the cover swap | Uploaded cover replaced, copy insert fails | Old row and its file both remain | Save rejects on `location` |

</intent-contract>

## Code Map

- `eslint.config.mjs:20-70` -- `serviceImports`, `importZones`; `src/lib` -> `src/app` is the only zone on `src/lib` as a whole, and `src/fields`, `src/i18n` and the frontend have none. The `import/no-restricted-paths` rule (2.32) has no type-import option, so "metadata types" belongs in the frontend's `@typescript-eslint/no-restricted-imports` block (`:430`), which has `allowTypeImports`. It also has a stale "stay silent until Story 1.7" comment (`:17`).
- `src/app/(frontend)/data/fixture-cover/[isbn13]/route.ts:2` -- the one value import from `lib/metadata`, `fixtureCover`. It stays (fixture mode only), so the ban's regex excepts `sources/fixture`.
- Edges measured: `src/lib` imports `@/fields/*`, `@/access/roles`, `@/i18n/locale`, `@/payload-types`, `@/payload.config` (`lib/payload` only). `src/fields` imports `@/access/*`, `@/lib/errors`. `src/i18n/request.ts:4` imports `lib/payload/context`. The frontend imports `lib`, `fields`, `i18n`, `access/roles`, `payload-types`. Importing `access/roles` is AD-2's sanctioned path.
- `tests/unit/clientLibImports.unit.spec.ts` -- harness style; its `RuleTester` proves the custom rules, not that the config mounts them.
- `src/migrations/index.ts` -- `migrations[].name` matches the `.ts` basename, in date order.
- `src/lib/copies/createCopy.ts:41` -- the save's restore, `deleteCopy`; `src/lib/copies/removeCopies.ts`.
- `tests/int/saveCopy.int.spec.ts:704,819` -- the Undo describe to join.
- `src/lib/catalogue/covers.ts:259` -- `deleteMediaRow`; `src/lib/catalogue/sharePrivateBook.ts:314` -- the caller.
- `tests/int/sharePrivateBook.int.spec.ts:293,709` -- replaced-cover case and the broken-default-location failure to reuse (`upload`, `promoteSetup`, `rejectedPaths`).
- `ARCHITECTURE-SPINE.md:56-63` -- the import table.

## Tasks & Acceptance

**Execution:**
- `tests/unit/migrationsIndex.unit.spec.ts` -- new; `migrations` names equal the sorted `.ts` basenames on disk, `index.ts` excluded -- AD-13.
- `eslint.config.mjs` -- replace the `src/lib` -> `src/app` zone with an allowlist zone on `src/lib`; add allowlist zones for `src/fields`, `src/i18n`, `src/app/(frontend)`; add the `lib/metadata` value ban to the frontend block; drop the stale comment -- the kept edges become the only ones.
- `tests/unit/spineLint.unit.spec.ts` -- new; samples through the real config for the gateway ban, `.payload` ban, frontend import ban, `react/jsx-no-literals`, both `bookeh/` rules mounted, every zone direction including one forbidden edge per service, and the kept edges silent.
- `tests/int/saveCopy.int.spec.ts` -- save, `removeCopies`, Undo -- AD-20.
- `tests/int/sharePrivateBook.int.spec.ts` -- promote replaces an uploaded cover, the copy fails, the old row and file stay -- pins `deleteMediaRow()`.
- `ARCHITECTURE-SPINE.md` -- name the new edges and the enforcing rule.

**Acceptance Criteria:**
- Given a migration file with no entry in `src/migrations/index.ts`, or an entry with no file, when the unit lane runs, then it fails.
- Given the lint rules for the layer table, AD-2 and AD-3, when the unit lane runs, then samples through the real config show the gateway ban, the `.payload` ban, the frontend import ban, `react/jsx-no-literals` and each direction of the zones reporting.
- Given the kept edges (services to `src/fields`, `fields/isbn` to `lib/errors`, the frontend to `src/fields` and `lib/metadata` types, `src/i18n` to `lib/payload`), when lint runs, then they pass, an edge outside them reports, and the spine's import table names them.
- Given a save's Undo after the copy was removed with `removeCopies`, when Undo runs, then it succeeds and skips the rows that are gone.
- Given a promote that replaces a cover and then fails, when the transaction rolls back, then the old cover's file is still on disk.

## Spec Change Log

## Review Triage Log

### 2026-10-31 — Review pass
- verdicts: 33 findings — high 0, medium 6, low 24, false 3, maybe-false 0
- findings:
  - `[low]` `[reject]` Intent: the rollback case covers promote, B28 names merge — The story's criterion says "promote or merge"; both reach `removeOrphans` and `deleteMediaRow`, and a second case would pin the same helper.
  - `[low]` `[patch]` Intent: C23's Book-gone branch is untested — Case added: save, `removeCopies`, Book deleted, Undo.
  - `[false]` `[reject]` Intent: the migration check does not exercise production start — The criterion is the unit lane failing; `prodMigrations` takes this same array, so a name-level check is the guard asked for.
  - `[low]` `[reject]` Intent: one representative forbidden edge per service — Each zone is generated from one list, so one edge proves the zone is live; every pair would restate the config (CLAUDE.md, Tests).
  - `[low]` `[reject]` Intent: `react/jsx-no-literals` asserts only the rule id — The rule has no message of ours; the id is the whole signal.
  - `[false]` `[reject]` Intent: the frontend zone excepts all of `./lib` — It matches the spine's table; `lib/payload` and `lib/metadata` are narrowed by the bans, which the samples cover.
  - `[low]` `[reject]` Intent: `epic-7-context.md` rewritten outside the tasks — The file is generated; step-01 recompiled it because planning docs were newer, and 7.26 recompiles it again.
  - `[false]` `[reject]` Intent: finding A3 does not resolve — It does: `epic-3-retro-2026-10-20.md:51`, unzoned layer edges, which this story closes.
  - `[medium]` `[patch]` Blind: `payload.config` open to `lib/catalogue`, `lib/shelf` — New zone from `src/payload.config.ts` on every service but `payload`, with samples; Design Notes' AD-2 reasoning does not hold for the exempt directories.
  - `[low]` `[patch]` Blind: fixture exception wider than the spine says — Spine reworded: the module exists for that route and lint does not hold it to the file.
  - `[medium]` `[patch]` Blind: `lib/backup` has no zone — `backup: []` in `serviceImports`, a sample, named in the spine.
  - `[low]` `[reject]` Blind: `src/access` and `src/app/(payload)` have no zone — Nothing imports wrongly there today, and the story names neither; two more zones are new surface.
  - `[low]` `[patch]` Blind: "Arrows are the only allowed import directions" contradicts the bullets — Reworded: the diagram shows the main directions, the bullets are the table.
  - `[low]` `[patch]` Blind: the `src/collections` clause omits `payload-types` — Added.
  - `[low]` `[patch]` Blind: kept-edge cases pass on an unresolvable import — The `it.each` asserts the source exists on disk.
  - `[low]` `[reject]` Blind: no relative-import sample — Probed: relative forms report. A sample would only retest the resolver.
  - `[low]` `[reject]` Blind: `migrationsIndex` compares names only — A mispaired `up` or a lost `.json` needs a hand-botched generated file; merges go one at a time (AD-13), and the criterion is file against entry.
  - `[low]` `[reject]` Blind: context rewrite drops working detail — As the Intent row; the details stay in the spine and EXPERIENCE.md.
  - `[low]` `[reject]` Blind: the context's Layers bullet omits the allowlists — As the Intent row; lint reports a breach with its own message, and the next build recompiles from the changed spine.
  - `[medium]` `[patch]` Edge: `payload.config` open to three exempt services — As the Blind row.
  - `[medium]` `[patch]` Edge: `lib/backup` and new lib directories unzoned — `backup` as the Blind row; a default zone for directories that do not exist yet is not added.
  - `[low]` `[reject]` Edge: dynamic `import()` passes the `lib/metadata` ban — Real, but nobody in the frontend does it and a fix adds selectors to a block that replaces others.
  - `[low]` `[patch]` Edge: fixture exception — As the Blind row.
  - `[low]` `[reject]` Edge: `import('...')` type expressions pass the zones — Real; no code uses the form, and the fix is a selector per zone.
  - `[low]` `[patch]` Edge: `beforeAll` budget covers a no-op — Awaits `calculateConfigForFile`.
  - `[low]` `[patch]` Edge: kept-edge cases vacuous — As the Blind row.
  - `[low]` `[reject]` Edge: `up`/`down` not compared — As the Blind row.
  - `[low]` `[patch]` Verification: save's Undo with the Book gone unpinned — As the Intent row; the case fails with `deleteRow` by id.
  - `[low]` `[patch]` Verification: bans sampled on one target — `.payload` for the frontend and `src/i18n`, `getPayload` from a service, `drizzle-orm` from `lib/metadata`.
  - `[medium]` `[patch]` Verification: `payload.config` not limited to `lib/payload` — As the Blind row.
  - `[low]` `[patch]` Verification: fixture exception — As the Blind row.
  - `[low]` `[reject]` Verification: dynamic imports — As the Edge row.
  - `[medium]` `[patch]` Verification: `lib/backup` unzoned — As the Blind row.

## Design Notes

A zone is an allowlist: `from: 'src'` with `except`, the shape `src/collections` already uses. A restricted-import ban on `@/collections` already covers services, but the zone also catches a relative path. `lib/payload` needs `@/payload.config`, so the `src/lib` zone excepts it and the existing AD-2 ban still holds it to the gateway.

`src/lib` -> `src/i18n` and the frontend's `access/roles` are not in the epic's list but are kept edges: without them the allowlists would fail on working code, and the spine names them too.

## Verification

**Commands:**
- `npm run lint`, `npm run typecheck`, `npm run test:unit` -- expected: pass.
- `npm run test:int` -- expected: pass, apart from this machine's known `collation` and `shelfTiming` failures.
- Mutations: drop an index entry; disable a zone; swap `deleteMediaRow` for `payload.delete` -- expected: the matching test fails, then revert.

## Auto Run Result

Summary: `migrationsIndex.unit.spec.ts` compares the index with the disk. `spineLint.unit.spec.ts` runs samples through the real ESLint config. Allowlist zones now hold `src/lib`, `src/fields`, `src/i18n` and the frontend to the edges the code keeps, `payload.config` to `lib/payload`, and `lib/backup` to itself; the frontend takes only types from `lib/metadata`, apart from `sources/fixture`. Three integration cases: Undo after `removeCopies`, Undo with the Book gone too, and a rolled-back promote keeping the old cover file. `src` is unchanged: no case exposed a bug.

Files: `eslint.config.mjs` (zones, metadata ban), `ARCHITECTURE-SPINE.md` (import table), `tests/unit/migrationsIndex.unit.spec.ts`, `tests/unit/spineLint.unit.spec.ts` (new), `tests/int/saveCopy.int.spec.ts`, `tests/int/sharePrivateBook.int.spec.ts`, `epic-7-context.md` (recompiled, it was stale), `sprint-status.yaml`.

Review: patched 2 medium entries (`payload.config`, `lib/backup`) and 7 low entries, 0 high. Deferred 0. Rejected 12 rows: 3 false, 9 low, each with its reason in the Review Triage Log.

Follow-up review: not recommended (`false`). Two medium entries were patched, but both are lint config pinned by samples that were seen to fail, so no unverified risk can be named.

Verification: lint 0 errors, typecheck clean, unit 1111 passed, integration 687 passed, `collation` and `shelfTiming` included. No screen changed, so no walk. Mutations, all failing the matching test and all reverted: index entry dropped, stray migration file, `fields` zone off, frontend zone off, `deleteMediaRow` swapped for `payload.delete`, the gone-copy skip removed, the `payload.config` zone retargeted, `deleteRow` by id.

Residual risks: dynamic `import()` and inline `import('...')` types pass the zones and bans; `src/access` and `src/app/(payload)` have no zone; a new `src/lib` directory has no zone until it is listed in `serviceImports`; only the promote side of the rollback is pinned, the merge shares its helper. Design Notes' line that the AD-2 ban holds `payload.config` is superseded by the zone in the Triage Log.
