---
title: '4.22 [K17] Test lanes that pass on their own'
type: 'chore'
created: '2026-10-21'
status: 'done'
baseline_revision: '0aa89e2ceb32fa94c249cb5f0200186dbc51a5a0'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** `npm test` cannot pass locally (retro P8). The int lane pushes to `bookeh_test` unless `DATABASE_PUSH=false` is set by hand. Playwright's web server then hangs in `payload migrate </dev/null` at Payload's "dev mode … (y/N)" prompt, which was reproduced here, until the 180 s timeout. `scanScreen.unit.spec.ts` fails about one full unit run in 30 (P6). The real `@zxing/browser` loads through ScanScreen's dynamic `import()` despite the spec's `vi.mock`, and its `scan()` rejects with "Couldn't create canvas".

**Approach:** A new `scripts/test-db.ts` refuses a pushed `bookeh_test` at once, naming `npm run test:reset`, and otherwise migrates it with push off. `test:int` and Playwright's web server run it first, and the int lane defaults `DATABASE_PUSH` to `false`. ScanScreen loads zxing through a local module, `scan/zxing.ts`, which the spec mocks statically.

## Boundaries & Constraints

**Always:** "Pushed" means `payload_migrations` has a `batch = -1` row, the same marker CI's "Check push stayed off" step reads. The refusal goes to stderr and exits 1 before migrate starts. zxing stays lazily loaded. README, `.env.example`, `ci.yml` and spine AD-13 state the same defaults.

**Never:** No change to the dev database's push. No auto-reset. No canvas polyfill. No new tests.

## I/O & Edge-Case Matrix

| Scenario | State | Behavior |
|----------|-------|----------|
| Fresh / migrated | no `batch = -1` row (or no table) | migrate (no-op if current), lane runs with push off |
| Pushed | `batch = -1` row | exit 1 in seconds, before migrate; stderr names `npm run test:reset` |
| Opt-in push | `DATABASE_PUSH=true npm run test:int` | script skips check and migrate; next default run is refused until reset |
| Reset | `npm run test:reset` | `assertTestDatabase`, then drop and recreate schema `public` |

</intent-contract>

## Code Map

- `package.json` -- `test` = unit && int && e2e. `tsx` and `pg` are direct dependencies.
- `tests/helpers/testDatabase.ts` -- `testDatabaseUrl()` (idempotent) and `assertTestDatabase()`. Reuse both.
- `vitest.setup.ts` -- int setup; loads `dotenv/config` and rewrites `DATABASE_URL`.
- `src/payload.config.ts:41-42` -- `push: DATABASE_PUSH !== 'false'`. Its comment says only CI sets it.
- `playwright.config.ts` -- webServer `command` starts with `npm run payload -- migrate </dev/null`. Env already sets the test URL and `DATABASE_PUSH: 'false'`.
- `.github/workflows/ci.yml` -- the "Apply migrations to bookeh_test" step and `DATABASE_PUSH: 'false'` on `test:int` become redundant.
- `README.md:48-62,106-117` -- these lines document the trap and the hand-run workaround.
- `.env.example` `DATABASE_PUSH` -- stays commented out, because `.env` also drives `npm run dev`.
- `ARCHITECTURE-SPINE.md:208-210` -- the AD-13 rule.
- `src/app/(frontend)/scan/ScanScreen.tsx:89-92` -- the dynamic imports. Lines 95 and 108 use `BarcodeFormat`/`DecodeHintType`.
- `tests/unit/scanScreen.unit.spec.ts:21-32` -- the two package mocks.

## Tasks & Acceptance

**Execution:**
- `scripts/test-db.ts` (new) -- builds the test URL from `.env`. With `--reset`, it drops and recreates the schema. With `DATABASE_PUSH` set to anything but `false`, it exits 0. If a pushed row exists, it prints the refusal and exits 1. Otherwise it runs `npm run payload -- migrate` with stdin ignored, the test URL and `DATABASE_PUSH=false`, and exits with migrate's status.
- `package.json` -- `test:int` runs the script before vitest. Add `test:reset`.
- `vitest.setup.ts` -- `DATABASE_PUSH ??= 'false'`.
- `playwright.config.ts` -- the script replaces the migrate step. Update the doc comment.
- `ci.yml` -- drop the redundant migrate step and env.
- `scan/zxing.ts` (new) -- `loadZxing()` holds the two dynamic imports. ScanScreen uses it, and the spec mocks it.
- README, `.env.example`, the `payload.config.ts` comment, spine AD-13 -- the local lanes migrate `bookeh_test` and run with push off; a pushed `bookeh_test` is refused, and `npm run test:reset` resets it.

**Acceptance Criteria:**
- Given a pushed `bookeh_test`, when `npm run test:e2e` runs, then it fails within seconds and its output names `npm run test:reset`.
- Given `npm run test:reset`, when `npm test` runs, then all three lanes pass and `bookeh_test` has no `batch = -1` row afterwards.
- Given the unit lane, when the scanScreen spec runs 20 times in a row and the full unit lane 60 times, then every run passes with no "Couldn't create canvas" or "getContext" output.
- Given README, `.env.example`, `ci.yml` and AD-13, when read together, then they state the same push and migration defaults for `bookeh_test`.

## Spec Change Log

## Review Triage Log

### 2026-10-21 — Review pass
- verdicts: 27 findings — high 0, medium 0, low 22, false 5, maybe-false 0
- findings:
  - `[low]` `[reject]` Blind: `assertTestDatabase(url)` in `--reset` can never fail, because `testDatabaseUrl()` always sets `/bookeh_test` — it is a harmless extra check that the intent's matrix names. Removing it gains nothing.
  - `[low]` `[reject]` Blind: a missing `bookeh_test` (3D000), a server that is down, or a `spawnSync` error gives a raw stack trace — pg's own message already names the problem ("database … does not exist", ECONNREFUSED). npm is always present, because the script runs from npm. Handling these would add branches for rare cases.
  - `[low]` `[reject]` Blind: migrate's exit code is trusted, and an unknown future prompt could exit 0 — the only known prompt (dev push) is checked first. A hypothetical prompt would show up as loud int failures, and a check after migrate would be extra machinery.
  - `[low]` `[patch]` Blind: `pg` sits in `dependencies` though only the test script uses it — moved to `devDependencies`.
  - `[low]` `[patch]` Blind: the `vitest.config.mts` comment still says every int file pushes — reworded: push is off by default, and the race applies with `DATABASE_PUSH=true` and to the specs that push their own schema.
  - `[low]` `[reject]` Blind: the `notFoundForm` change is not recorded in the spec — the fix would be a spec edit. It is recorded under Auto Run Result instead.
  - `[low]` `[reject]` Blind: the scanScreen mock is not typed against `loadZxing` — typing the fake reader class needs casts for a drift that is unlikely in a three-export loader.
  - `[low]` `[patch]` Blind: an empty `DATABASE_PUSH=` turns push on in the int lane — `||=` / `||` now make an empty value mean the default `'false'`.
  - `[low]` `[patch]` Blind: AD-13 says "CI runs them on an empty database", but e2e reuses the database the int lane migrated — now reads "CI starts them from an empty `bookeh_test`".
  - `[false]` `[reject]` Blind: `test:reset` leaves the per-spec schemas — README and the script say exactly that only `public` is reset, and each spec drops its own schema in `beforeAll`.
  - `[low]` `[patch]` Edge: a `bookeh_test` migrated under a since-regenerated migration name fails in migrate with "already exists" and no next step — a failed migrate now prints a stderr line naming `npm run test:reset`.
  - `[low]` `[patch]` Edge: tables without a `batch = -1` row (an interrupted push or migrate) fail mid-migrate — same root cause and fix as the row above.
  - `[low]` `[reject]` Edge: the database does not exist or the server is unreachable — same as the second Blind row.
  - `[low]` `[patch]` Edge: `--reset` fails when schema `public` is absent — now `drop schema if exists public cascade`.
  - `[low]` `[reject]` Edge: a `spawnSync` start error exits 1 with no message — npm runs the script, so npm exists. Rare.
  - `[low]` `[reject]` Edge: running vitest directly (IDE) skips `test-db.ts` — that works on an already-migrated `bookeh_test`, and only a newly added migration needs `npm run test:int`. A globalSetup would change the design for a rare case.
  - `[low]` `[reject]` Edge: `DATABASE_PUSH=true npm test` pushes in int, then e2e is refused — this is the documented opt-in. README names `test:int` only, and says the next default run needs the reset.
  - `[low]` `[patch]` Edge (claim): `.env.example` says the lanes "set" push off, but the int lane only defaults it — the wording now says "default".
  - `[low]` `[reject]` Edge (deletion): the removed README note on push prompts exiting a worker — this applies only to the opt-in path, which already says to reset afterwards.
  - `[low]` `[reject]` Verification gap: the refusal and `--reset` are checked only by hand — the script runs at the start of every int and e2e lane. A broken refusal brings back the pre-story hang, which a developer notices at once. An automated guard would need a child-process harness against a shared `bookeh_test` that CI checks for push rows.
  - `[low]` `[reject]` Intent (a): the int lane also refuses a pushed `bookeh_test`, so the owner's existing pushed database needs one `npm run test:reset` — intended, because both lanes then share one path. README says so, and Auto Run Result flags it for the main checkout.
  - `[false]` `[reject]` Intent (b): the pushed state was simulated by a hand-inserted row — re-checked with a real push: `DATABASE_PUSH=true npm run test:int` wrote the `batch = -1` row, and the next default lane was refused in seconds, naming the reset.
  - `[false]` `[reject]` Intent (c): `DATABASE_PUSH=false` is not uncommented in `.env.example` — uncommenting it would turn off the dev push, because `.env` drives `npm run dev`. The epic AC asks for matching descriptions, and those match.
  - `[false]` `[reject]` Intent (d): the flake fix adds a production seam, and 20 solo runs cannot tell fixed from unfixed — runtime behaviour is unchanged and zxing is still lazy. The 60× full-lane check is the discriminating one.
  - `[low]` `[reject]` Intent (e): the unrequested `notFoundForm` change — the story's "with no flaky unit test" covers it. It was found failing 2/60 in the full lane and is a test-only wait.
  - `[low]` `[patch]` Intent (f): `pg` in runtime dependencies — same as the fourth Blind row, moved.
  - `[false]` `[reject]` Intent (g): CI and the spine changed beyond the epic ACs — CI now follows the same path as local runs, which is the story's aim ("the way CI runs it"). The spine update is required by convention for a contract change.

## Design Notes

The flake shows up only in the full unit lane: 1 failure in 30 runs there, none in 48 runs of the spec alone. Its stack goes through the real `cjs/readers/BrowserCodeReader.js`, reached from ScanScreen's dynamic import. A static mock of a local module takes that path out of the test. A canvas stub would only change the error, because the `scan` spy would still never be called.

## Verification

**Commands:**
- `npm run typecheck`, `npm run lint` -- clean
- 20 × scanScreen spec, 60 × `npm run test:unit` -- all pass
- Insert `('dev', -1)` into `payload_migrations`, then `time npm run test:e2e` -- fails in seconds and names the reset
- `npm run test:reset && npm test` -- passes, with no `batch = -1` row afterwards (worktree Postgres on port 5436)

## Auto Run Result

Status: done

**Summary.** `npm test` now passes locally the way CI runs it. A new `scripts/test-db.ts` runs first in the int lane and in Playwright's web server. It refuses a schema-pushed `bookeh_test` (a `batch = -1` row) in about a second and names `npm run test:reset`. Otherwise it applies the committed migrations with push off. The int lane defaults `DATABASE_PUSH` to `false`, and `DATABASE_PUSH=true` opts in. CI drops its separate migrate step and env and takes the same path. The scanScreen flake is gone: ScanScreen loads zxing through `scan/zxing.ts`, which the spec mocks statically, so the real reader never runs in jsdom. The 60-run check found a second unit flake in `notFoundForm.unit.spec.ts` (2/60, a click on the still-disabled Add button, from 4.16). It is fixed with a wait in the test, under the story's "with no flaky unit test".

**Files changed**
- `scripts/test-db.ts` (new): refuse a pushed `bookeh_test`, migrate it, or `--reset` it. A failed migrate also names the reset.
- `package.json`, `package-lock.json`: `test:int` runs the script first; new `test:reset`; `pg` and `@types/pg` added as devDependencies.
- `vitest.setup.ts`: `DATABASE_PUSH ||= 'false'`. `vitest.config.mts`: comment.
- `playwright.config.ts`: the web server runs the script in place of `payload migrate`.
- `.github/workflows/ci.yml`: the migrate step and the `DATABASE_PUSH` env on `test:int` are removed.
- `src/app/(frontend)/scan/zxing.ts` (new), `ScanScreen.tsx`, `tests/unit/scanScreen.unit.spec.ts`: the lazy zxing loader and the spec's static mock.
- `tests/unit/notFoundForm.unit.spec.ts`: waits for Add to re-enable before the second click.
- README, `.env.example`, `src/payload.config.ts` and three int-spec comments, spine AD-13: the same defaults.
- `epic-4-context.md`: regenerated (it predated b38db51's tests row).

**Review findings.** 27 findings: 22 low, 5 false.
- **Patched (low, 7 entries):**
  - `pg` moved to devDependencies
  - stale vitest comment
  - empty `DATABASE_PUSH` treated as unset
  - AD-13 wording
  - reset hint on a failed migrate
  - `drop schema if exists`
  - `.env.example` "default"
- **Deferred:** none.
- **Rejected (reasons in the Review Triage Log):**
  - the never-failing `assertTestDatabase`
  - raw pg errors for a missing database or a server that is down
  - trusting migrate's exit code
  - the spec not naming the notFoundForm fix
  - the untyped zxing mock
  - running vitest directly skips the script
  - `DATABASE_PUSH=true npm test`
  - the removed README prompt note
  - no automated guard for the refusal
  - the int lane also refusing
  - five false (per-spec schemas, simulated push, `.env.example` not uncommented, the production seam, CI and spine changes)

**Follow-up review:** not recommended. Only low entries were patched.

**Verification** (worktree Postgres on port 5436)
- `npm run typecheck` clean; `npm run lint` 0 errors (36 warnings, all there before).
- scanScreen spec: 20/20. Full unit lane: 60/60 before the patches and 60/60 after, with no "Couldn't create canvas" or "getContext" output. Before the fix, the lane failed 1 in 30.
- A real push (`DATABASE_PUSH=true` int run) wrote the `batch = -1` row. `npm run test:e2e` was then refused in 1.3 s and `npm run test:int` in 0.2 s, both naming `npm run test:reset`.
- `npm run test:reset && npm test`: unit, int (41 files, 397 tests) and e2e (1/1) passed, with no `batch = -1` row afterwards.

**Residual risks**
- The main checkout's `bookeh_test` on 5432 was pushed by earlier int runs. The first `npm test` there after this merges is refused until `npm run test:reset`.
- A schema story must now create its migration (or use `DATABASE_PUSH=true` and reset afterwards) before int tests see new columns.
- Parallel worktrees' Playwright runs still share port 3100.

**After rebasing onto 4.17–4.21 (0c34c77).** The rebase had only the usual conflicts: sprint-status (every story kept as done) and the regenerated epic-4 context (main's sections kept, plus the Schema changes bullet with the 4.22 lanes). On the rebased branch, `covers.int.spec.ts` "sweeps only orphaned app files older than an hour" swept 7 files instead of 1. `test:reset` had dropped the media rows but left their files in `media-test`, and those files were now over an hour old. `--reset` now also empties `media-test`, and README says so. Re-checked: typecheck and lint clean, and `npm run test:reset && npm test` passed (unit; int 42 files, 414 tests; e2e 1/1; no `batch = -1` row).
