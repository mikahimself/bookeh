---
title: '4.25 [K18] Checks that test themselves'
type: 'chore'
created: '2026-10-21'
status: 'done'
baseline_revision: 'b42c2fc87019d1471630990c5befdd5fd5164ab6'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
warnings: []
deferred:
  - summary: >-
      bookeh/system-privileges, the import zones and the gateway lint blocks still have no RuleTester or ESLint-API check.
    evidence: |-
      4.21's deferred item and deferred-work.md (spec-1-6) routed these to "the same spec" as 4.25, but story 4.25's acceptance criteria name only bookeh/client-lib-imports. tests/unit/clientLibImports.unit.spec.ts covers that rule alone; npm run lint passes on the clean tree whether the other rules fire or not.
    location: >-
      eslint.config.mjs
    severity: low
---

<intent-contract>

## Intent

**Problem:** CI's missing-migration step passes only if Payload logs "Migration DOWN statements generation complete" (retro R5). If a Payload bump rewords that line, the gate fails on every run or silently passes everything. `bookeh/client-lib-imports` has no test, and it misses a re-export barrel under `src/app` that passes `src/lib` values into a client component (R14).

**Approach:** The CI step runs `migrate:create ci_drift_check --force-accept-warning` with stdin closed. When that flag is set, a finished run always writes a migration, even a blank one. If no file was written, the command stopped at a prompt or failed. If the snapshot it wrote differs from the newest committed snapshot (ignoring `id` and `prevId`), the schema has drifted. The rule also reports a value re-export of `src/lib` from any module under `src/app`. A `RuleTester` unit spec covers the rule.

## Boundaries & Constraints

**Always:** Neither failure case reads Payload's log output. Type-only re-exports, re-exports of `lib/shelf/query`, and a non-`src/lib` source stay allowed. A re-export is `export … from`, `export * from`, or `export { x }` / `export default x` where `x` was value-imported from `src/lib`. The README's drift-check paragraph describes the new step.

**Never:** No wrapper detection (`export const y = libFn`): not a barrel. The rule reads no other files. No tests beyond the `RuleTester` spec. No change to other lint blocks or zones.

## I/O & Edge-Case Matrix

| Scenario | State | Behavior |
|----------|-------|----------|
| No drift | config matches newest snapshot | step passes |
| Drift | e.g. a new column | step fails, prints the would-be migration `.ts` |
| Prompt | e.g. ambiguous rename; exits 0 at EOF | no `*_ci_drift_check.json` → step fails, names the prompt |
| Barrel | `export { x } from '@/lib/…'` in `src/app/**` | `bookeh/client-lib-imports` error on the source |

</intent-contract>

## Code Map

- `.github/workflows/ci.yml:57-78` -- "Check for missing migrations" step and its comment. The GHA default shell is `bash -e`; `jq` is on the runner.
- `@payloadcms/drizzle/dist/utilities/buildCreateMigration.js` (read-only) -- with `forceAcceptWarning` an empty diff still writes `.json` + `.ts`. The rename prompt exits 0 at EOF before writing. No DB connection is needed.
- `src/migrations/*.json` -- snapshots. Apart from `id` and `prevId`, a clean tree's run matched the newest one exactly (checked while planning).
- `eslint.config.mjs:73-138` -- `resolveSource`, `isTypeOnly` and the inline `clientLibImports` (paths from the config's location). Registered for `src/**` at lines 266-277.
- `tests/unit/` -- node environment, vitest without globals. `typescript-eslint@8.69.0` is present only through `eslint-config-next`.
- `README.md:117-128` -- the drift-check paragraph (mentions `--skip-empty` and `migrate:create did not finish`).

## Tasks & Acceptance

**Execution:**
- `.github/workflows/ci.yml` -- rewrite the step and its comment. Run `npm run payload -- migrate:create ci_drift_check --force-accept-warning </dev/null`. If no `*_ci_drift_check.json` was written, `::error::` naming a prompt (e.g. an ambiguous rename) and exit 1. Otherwise `diff` the `jq -S 'del(.id, .prevId)'` output of the newest `git ls-files 'src/migrations/*.json'` against the written snapshot. On a difference, `::error::` (schema change without a migration, or a new snapshot format), `cat` the written `.ts`, and exit 1.
- `eslint.config.mjs` -- `export` `clientLibImports`. In a module under `src/app`, report value re-exports whose source passes `isRestricted`. These are the `ExportNamedDeclaration`/`ExportAllDeclaration` with a source that the rule already visits, plus `export { x }` / `export default x` of a binding value-imported from a restricted source. Add a second message that says a module under `src/app` may not re-export `src/lib` values, because a client component could import it.
- `tests/unit/clientLibImports.unit.spec.ts` (new) -- `RuleTester` with the `typescript-eslint` parser, wired to vitest's `describe`/`it`. Filenames are under `src/app/(frontend)/` in the real root. Valid: a client component with `import type` from `@/lib/…` and a value import of `@/lib/shelf/query`; a server module under `src/app` with a type-only re-export. Invalid: a client component's value import from `@/lib/books`; a non-client module under `src/app` with `export { x } from '@/lib/books'`, with `export * from`, and with an import-then-`export { x }`.
- `package.json`, `package-lock.json` -- `typescript-eslint` as a devDependency at the installed version.
- `README.md` -- the drift-check paragraph: the new mechanism, with the same steps to fix.

**Acceptance Criteria:**
- Given a collection change without a migration (a new `text` field), when the step's script runs locally, then it exits 1 and prints the would-be migration. Checked by hand and recorded in this spec.
- Given an ambiguous rename (`Books.source` → `origin`), when the step's script runs locally, then it exits 1 with the prompt error. Checked by hand and recorded.
- Given the committed tree, when the step's script runs, then it exits 0.
- Given `npm run test:unit`, when the new spec runs, then the allowed import passes, the `src/lib` import from a client component fails, and the barrel forms fail.
- Given the tree, when `npm run lint` runs, then it reports no new errors.

## Spec Change Log

## Review Triage Log

### 2026-10-21 — Review pass
- verdicts: 21 findings — high 0, medium 0, low 17, false 4, maybe-false 0
- findings:
  - `[low]` `[patch]` Blind: `jq` inside `<( … )` ignores its exit status, so a broken `jq` makes `diff` compare two empty streams and the step passes — the two `jq` outputs are now variable assignments, so `bash -e` stops the step on a `jq` failure (checked: `a="$(jq … /nonexistent)"` exits 2).
  - `[low]` `[patch]` Blind: the step still relies on Payload's blank-migration branch, and the "recheck on a Payload bump" note was gone — the comment names `buildCreateMigration.js` (3.90.2) again, and the no-file error also names "Payload no longer writes a blank one".
  - `[low]` `[patch]` Blind: `git ls-files 'src/migrations/*.json' | sort` can match nested files and sort by locale, unlike Payload's top-level code-unit sort — now `':(glob)…'` and `LC_ALL=C sort`.
  - `[low]` `[patch]` Blind: README's fix for a format-only failure says "answer the prompt", but that prompt is the blank-migration question — README now says to answer yes.
  - `[low]` `[patch]` Blind: the `reexport` message suggested importing from `src/lib` where the value is used, which `restricted` forbids in a client component — now "in server code", and the message states the spine rule it enforces.
  - `[false]` `[reject]` Blind: `'use server'` modules should be exempt — a lib function re-exported from a `'use server'` file becomes a server action outside `runAction()`, which the spine's Surface rule forbids, so reporting it is right.
  - `[low]` `[patch]` Blind: the message cites "Spine, Design Paradigm", which states no barrel rule — the message now quotes the spine rule (client components import only types and `lib/shelf/query`) and gives the barrel ban as how that rule is kept. The rule itself is unchanged, so the spine is not edited.
  - `[low]` `[patch]` Blind: there is no case for `export default x` or for a module outside `src/app` (AC "the barrel forms fail"; Always) — added an invalid `export default saveBook` case and a valid re-export in a `src/lib` file. Valid cases for `lib/shelf/query` and for a non-lib source were not added: the existing client case already covers that `isRestricted` path.
  - `[low]` `[reject]` Blind: the spec imports the whole ESLint config and casts the rule — the unit lane runs the spec in about 40 ms, and moving the rule into its own module adds a file for a cast.
  - `[low]` `[reject]` Edge: `export const save = saveBook` / `export default { saveBook }` are not reported — the intent's Never excludes wrapper detection.
  - `[low]` `[reject]` Edge: modules outside `src/app` that clients import (`src/i18n`, `src/fields`) are not checked — the intent scopes the barrel to `src/app` (epics AC and Approach).
  - `[low]` `[patch]` Edge: `jq` failure inside the process substitutions — same root cause and fix as the first Blind row.
  - `[low]` `[patch]` Edge: nested pathspec matches or no committed snapshot — same fix as the third Blind row. An empty `$newest` now fails in `jq`, and the step stops.
  - `[low]` `[patch]` Gap: `export default x` has no test — same as the eighth Blind row.
  - `[low]` `[patch]` Gap: nothing pins the `inApp` scope or the allowed sources — same as the eighth Blind row (the `src/lib` file case added).
  - `[low]` `[reject]` Gap: the failure branches of the drift step only ran by hand — the intent asks for exactly that ("checked once by hand and recorded").
  - `[low]` `[patch]` Gap (other): a passing run left the blank `ci_drift_check` migration and the rewritten `index.ts` for the int and e2e lanes — the passing path now deletes them and restores `index.ts` (checked: clean tree, nothing left behind).
  - `[false]` `[reject]` Intent (a): the rule reports at the barrel, not at the client's import — the AC's scenario fails lint, and Design Notes record the one-file choice.
  - `[false]` `[reject]` Intent (b): the postcondition is inverted from the retro's wording — the AC's two failure cases fail and the clean tree passes, and none of it reads Payload's log.
  - `[low]` `[defer]` Intent (c): `bookeh/system-privileges`, the zones and the gateway blocks are still untested, though 4.21 and deferred-work routed them here — this gap predates the story, and 4.25's AC names only `client-lib-imports`. Recorded in `deferred`.
  - `[false]` `[reject]` Intent (d): uncommitted, and sprint-status not updated — finalization commits the story and sets sprint-status.

## Design Notes

Barrel: the rule reports at the barrel, not at the client component's import. One-file analysis keeps the rule free of file resolution and keeps `RuleTester` free of fixtures on disk. Nothing under `src/app` re-exports today. The spine's rule and AD-13 are unchanged, so the spine needs no update. A drizzle snapshot format bump fails the drift check loudly, never silently.

## Verification

**Commands:**
- `npm run typecheck`, `npm run lint` -- clean (warnings as before)
- `npm run test:unit` -- passes, including the new spec
- The step's `run:` block as a scratch script, in the three AC states. Restore `src` and delete `*_ci_drift_check.*` after each run.

**Results (2026-10-21, step's `run:` block as a scratch script under `bash -e`):**
- Committed tree: exit 0. The written snapshot equals `20261021_072731_lean_finna_raw.json` apart from `id` and `prevId`.
- New field (`{ name: 'driftProbe', type: 'text' }` on Books): exit 1. The `diff` shows the `drift_probe` column, then `::error::The config differs from src/migrations/20261021_072731_lean_finna_raw.json …` and the would-be migration (`ALTER TABLE "books" ADD COLUMN "drift_probe" varchar;`).
- Ambiguous rename (`Books.source` → `origin`): the create-or-rename prompt reads EOF, no `*_ci_drift_check.json` is written, exit 1 with `::error::migrate:create wrote no migration: it stopped at a prompt …`. The prompt leaves its line open, so the step echoes a newline first; without it the annotation does not start a line and GHA would not pick it up.
- `src`, `src/payload-types.ts` (regenerated on config load) and `*_ci_drift_check.*` restored after each run.
- `npm run typecheck` clean; `npm run lint` 0 errors, 36 warnings, all in `src/migrations` as before; `npm run test:unit` 43 files, 677 tests pass. With the `src/app` check switched off, the three barrel cases in the new spec fail.

## Auto Run Result

Status: done

**Summary.** CI's missing-migration check no longer reads Payload's log. It runs `migrate:create ci_drift_check --force-accept-warning` with stdin closed, so a finished run always writes a migration. If no snapshot was written, the command stopped at a prompt and the step fails. A written snapshot that differs from the newest committed one (top-level, `LC_ALL=C` order, as Payload picks it), apart from `id` and `prevId`, means drift; the step fails and prints the would-be migration. A passing run removes its files and restores `index.ts`. `bookeh/client-lib-imports` now also reports a value re-export of `src/lib` from any module under `src/app`, and a new `RuleTester` spec covers the rule.

**Files changed**
- `.github/workflows/ci.yml`: the new drift step and its comment.
- `eslint.config.mjs`: `clientLibImports` exported; the `reexport` check and message.
- `tests/unit/clientLibImports.unit.spec.ts` (new): `RuleTester` with 3 valid and 5 invalid cases.
- `package.json`, `package-lock.json`: `typescript-eslint` 8.69.0 as a devDependency (the parser for the spec).
- `README.md`: the drift-check paragraph.

**Review findings.** 21 findings: 17 low, 4 false.
- **Patched (low, 12 rows):**
  - `jq` failure can no longer pass silently
  - Payload recheck note and error text
  - snapshot pick matches Payload
  - README yes-to-blank
  - `reexport` message advice and spine citation
  - `export default` and `src/lib` cases
  - clean-up after a passing run
- **Deferred:** tests for `bookeh/system-privileges`, the zones and the gateway blocks (predates the story, routed here by 4.21; not in 4.25's AC).
- **Rejected:**
  - whole-config import in the spec
  - wrapper forms (the intent's Never)
  - modules outside `src/app` (the intent's scope)
  - hand-only failure branches (the intent asks for that)
  - four false (`'use server'` exemption, barrel-side reporting, the inverted postcondition, lifecycle)

**Follow-up review:** not recommended. 0 high and 0 medium were patched.

**Verification** (worktree, after the patches)
- `npm run typecheck` clean; `npm run lint` 0 errors, 36 warnings as before; `npm run test:unit` 43 files, 679 tests.
- The step's `run:` block as a scratch script under `bash -e`:
  - clean tree: exit 0, nothing left in `src`
  - `driftProbe` field: exit 1, diff and `ALTER TABLE "books" ADD COLUMN "drift_probe" varchar;`
  - `Books.source` → `origin`: exit 1, "wrote no migration … prompt"
- `bash -e -c 'a="$(jq . /nonexistent)"; echo reached'` exits 2 without printing.

**Residual risks**
- The step has not yet run on GitHub Actions; the newline before `::error::` is reasoned, not observed.
- A drizzle snapshot format bump fails every run until a blank migration with the new format is committed (README says how).
