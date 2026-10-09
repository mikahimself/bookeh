---
title: 'Story 1.9 [K7] CI migration check'
type: 'chore'
created: '2026-10-09'
status: 'done'
baseline_commit: '5e67a23a9031d03ba390917ea8c2cf48bd7f8907'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: [oversized]
deferred:
  - summary: >-
      Check src/migrations/index.ts against the migration files on disk once prodMigrations is wired (Epic 2).
    evidence: |-
      `payload migrate` reads every `*.ts` in src/migrations and never reads index.ts, and the drift step rewrites index.ts only on drift. A migration committed without its index.ts entry (e.g. after a rebase merge) therefore passes the drift, migrate and int steps. prodMigrations, which AD-13 says production applies at start, reads only index.ts and would skip that migration. No harm until prodMigrations exists, and the intent excludes it (Epic 2). Fix: regenerate the index with Payload's writeMigrationIndex in CI and fail on a diff.
    location: >-
      .github/workflows/ci.yml (Check for missing migrations)
    severity: medium
---

<intent-contract>

## Intent

**Problem:** CI builds `bookeh_test` by Payload push, so a schema change committed without its migration, or a migration that does not build the schema, passes CI and only breaks in production (AD-13).

**Approach:** In `.github/workflows/ci.yml`, fail when `payload migrate:create` would write a migration, apply the committed migrations to the empty `bookeh_test`, and run the integration tests against it with push turned off through a new `DATABASE_PUSH` env switch in the Postgres adapter config.

## Boundaries & Constraints

**Always:** Push stays the default everywhere (dev, local `npm run test:int`, the e2e dev server on `bookeh`); only CI's int run sets `DATABASE_PUSH=false`. The switch is read in `src/payload.config.ts` and listed in `.env.example` (config is env only). The drift check runs non-interactively and cannot hang on a prompt. Migrations are applied only to the CI `bookeh_test`, never to a dev database.

**Never:** No change to collections, migrations or `payload-types.ts`. No `prodMigrations` (Epic 2). No `payload-types.ts` drift check (not in the AC). No change to the e2e lane (it stays on push against `bookeh`; moving it is deferred to 3.52). Do not rely on `PAYLOAD_MIGRATING` to disable push: it is Payload's internal CLI flag.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| In sync | config matches latest `src/migrations/*.json` snapshot | drift step exits 0, no file written | N/A |
| Drift | a field added to a collection, no migration | drift step fails, lists the files it would add | non-zero exit, CI red |
| Migrations build schema | empty `bookeh_test`, `payload migrate` | all migrations applied; int tests pass with push off | N/A |
| Broken/missing migration SQL | snapshot current but `up` lacks a table | int tests fail (relation does not exist) | CI red |
| Push off honoured | `DATABASE_PUSH=false`, empty DB, no migrate | Payload starts without pushing; int tests fail | proves the switch |
| Default | `DATABASE_PUSH` unset or any value but `false` | push as before (outside production) | N/A |

</intent-contract>

## Code Map

- `.github/workflows/ci.yml` -- `check` job: Postgres service, `createdb bookeh_test`, then lint, typecheck, unit, int, e2e. Job env `DATABASE_URL` points at `bookeh`; `vitest.setup.ts` rewrites it to `bookeh_test` for the int lane only.
- `src/payload.config.ts` -- `postgresAdapter({ pool })`; add `push`.
- `node_modules/@payloadcms/db-postgres/dist/connect.js:110` -- pushes only when `NODE_ENV !== 'production' && PAYLOAD_MIGRATING !== 'true' && this.push !== false`. So `push: true` explicitly is the same as unset.
- `node_modules/payload/dist/bin/migrate.js:30-41` -- `--skip-empty` → `skipEmpty`; `migrate:create` runs with `disableDBConnect` (no database needed), every command sets `PAYLOAD_MIGRATING`.
- `node_modules/@payloadcms/drizzle/dist/utilities/buildCreateMigration.js` -- diffs the config schema against the newest `src/migrations/*.json` snapshot; with no changes and `skipEmpty` it `process.exit(0)` without writing; with changes it writes `<ts>_<name>.ts`, `.json` and rewrites `index.ts`. Exit code is 0 either way, so the check must inspect the tree.
- `node_modules/@payloadcms/drizzle/dist/migrate.js:30` -- `payload migrate` prompts only if a dev-push row (batch -1) exists; an empty `bookeh_test` has none.
- `src/migrations/` -- one migration `20261009_092900_users` (+ `.json`, `index.ts`). Read-only.
- `.env.example` -- `DATABASE_URL`, `PAYLOAD_SECRET`; add `DATABASE_PUSH`.
- `README.md:95-98` -- "Resetting the test database"; a local reproduction of the CI check needs an empty `bookeh_test`.

## Tasks & Acceptance

**Execution:**
- [x] `src/payload.config.ts` -- `push: process.env.DATABASE_PUSH !== 'false'` in `postgresAdapter`, with a one-line comment (CI turns it off to test the migrations) -- the push-off switch.
- [x] `.env.example` -- `DATABASE_PUSH` commented out with a note: dev keeps the default; `false` only for CI's migration-built test database -- env is the config surface.
- [x] `.github/workflows/ci.yml` -- after typecheck: (1) drift step: `npm run payload -- migrate:create ci_drift_check --skip-empty </dev/null`, then fail with the `git status --porcelain -- src/migrations` output if it is non-empty; (2) migrate step: `npm run payload -- migrate` with step env `DATABASE_URL` = the `bookeh_test` URL; (3) the `test:int` step gets step env `DATABASE_PUSH: "false"`. Unit and e2e unchanged -- the AC.
- [x] `README.md` -- under the test-database paragraph, one short paragraph: what CI checks (drift, migrations on empty `bookeh_test`, int with `DATABASE_PUSH=false`) and the local reproduction (reset `bookeh_test`, migrate it, run int with push off) -- so a red CI run is reproducible.

**Acceptance Criteria:**
- Given the CI workflow, when it runs on the current tree, then the drift step passes, `payload migrate` applies `20261009_092900_users` to the empty `bookeh_test`, and `test:int` passes with `DATABASE_PUSH=false`.
- Given a config that differs from the newest committed snapshot (a collection change without its migration), when the drift step runs (non-TTY, stdin closed), then it exits non-zero and names the files it would write, without waiting on input.
- Given an empty `bookeh_test` and `DATABASE_PUSH=false`, when `npm run test:int` runs without migrating, then it fails, proving the int run no longer builds the schema itself.
- Given the repository, when lint, typecheck, unit and int run locally with the default env, then all pass.

## Spec Change Log

## Review Triage Log

### 2026-10-09 — Review pass
- verdicts: 16 findings — high 3, medium 3, low 6, false 4, maybe-false 0
- findings:
  - `[false]` `[reject]` Sprint status and the commit are not in the diff (intent-alignment) — the commit is made at finalisation; sprint status is closed out separately, as in `5e67a23`.
  - `[false]` `[reject]` No CI path has run (intent-alignment) — every path ran locally with the CI step scripts: clean drift, additive and rename drift, migrate plus int with push off, and the push-off negative; GitHub runs it on push.
  - `[false]` `[reject]` e2e still runs on push (intent-alignment, reading R3) — the AC names the integration tests; moving e2e off the dev DB is the existing 3.52 deferral (deferred-work, Story 1.4).
  - `[low]` `[reject]` `payload-types.ts` drift unchecked (intent-alignment) — not in the AC; typecheck catches code that uses fields the types lack; the fix adds a type-generation step to CI.
  - `[medium]` `[patch]` Nothing proves push stayed off in the int run (blind) — grouped with the verification-gap finding below. Patched: CI step "Check push stayed off" fails unless `bookeh_test` has no batch -1 row; verified passing on a migrated DB and failing on a pushed one.
  - `[low]` `[patch]` Drift failure lists file names, not the SQL (blind) — patched: the step prints `*_ci_drift_check.ts`.
  - `[low]` `[patch]` README has no local reproduction or fix for the drift check (blind) — patched: the command, plus "commit the generated files under a real name".
  - `[high]` `[patch]` The claim that a prompt "cannot wait for input" is unverified (blind) — grouped with the edge-case rename finding. Patched as described there.
  - `[false]` `[reject]` `payload migrate` with stdin closed could exit 0 on a batch -1 prompt (blind) — unreachable in CI: `bookeh_test` is created two steps earlier, and the drift step does not connect (`disableDBConnect`). An unapplied migration would also fail the push-off int run.
  - `[low]` `[reject]` `bookeh_test` URL hard-coded a second time (blind) — the same credentials are hard-coded beside it in the service block; deriving the URL in YAML adds more than it saves.
  - `[low]` `[reject]` `DATABASE_PUSH` accepts only the literal `false` (blind) — CI sets exactly that, and the new push-stayed-off step catches a misspelling.
  - `[medium]` `[patch]` Push-off not verified in the normal CI path (verification-gap) — same root and fix as the blind push-off row.
  - `[medium]` `[patch]` Migration SQL is checked only on tables the int tests touch; `media` is never queried (verification-gap) — patched: `tests/int/migrationSchema.int.spec.ts` (runs when `DATABASE_PUSH=false`) diffs the whole DB with drizzle-kit `pushSchema` without `apply()`; it passes on a migrated DB and fails after `drop column alt`. Its filter skips drizzle-kit's no-op `SET DEFAULT` re-emission (`users.login_attempts`) when the live default already matches.
  - `[low]` `[reject]` No automated self-test of the drift guard (verification-gap, filed as defer) — the "DOWN statements generation complete" guard now fails the step if a Payload upgrade stops the diff from finishing; a CI self-test of the guard costs more than it saves.
  - `[high]` `[patch]` A rename-ambiguous drift makes drizzle-kit's prompt read EOF and exit 0, writing nothing, so the check passes (edge-case) — reproduced (snapshot `alt` → `alt2`: exit 0, no files). Patched: the step fails unless the output has "Migration DOWN statements generation complete"; re-run: rename exit 1, clean exit 0.
  - `[high]` `[patch]` The spec's claim "fails ... without waiting on input" is false for renames (edge-case, claim) — same root and fix.

### 2026-10-09 — Review pass (follow-up)
- verdicts: 18 findings — high 0, medium 1, low 11, false 5, maybe-false 1
- findings:
  - `[false]` `[reject]` "Push off honoured" (empty DB, no migrate) never runs as a negative in CI (intent-alignment) — the "Check push stayed off" step asserts the property on every run; the negative was proved locally.
  - `[false]` `[reject]` Broken-SQL detection moved into a structural diff that is skipped with the default env (intent-alignment) — intended: it runs where push is off (CI), and the other int specs still fail on missing relations.
  - `[low]` `[reject]` No test for the "Default" row (intent-alignment) — `!== 'false'` keeps Payload's own default, and every local int run and the e2e dev server exercise it; a dedicated test adds a config-loading spec for one comparison.
  - `[low]` `[patch]` The drift grep depends on Payload's log wording (intent-alignment) — grouped with the blind "Payload internals" row. Patched: the comment names `buildCreateMigration.js` (3.90.2) and says to recheck on a bump.
  - `[false]` `[reject]` carried: No CI path has run (intent-alignment) — same claim as the first pass; every path ran locally with the extracted step scripts.
  - `[false]` `[reject]` The README migrates the local `bookeh_test`, against "never to a dev database" (intent-alignment) — the dev database is `bookeh`; `bookeh_test` is the test database the README already resets.
  - `[false]` `[reject]` The new spec and the push-stayed-off step go beyond the Approach (intent-alignment) — they come from first-pass review patches, and no Never clause excludes them.
  - `[medium]` `[defer]` `index.ts` is never checked, so a migration missing from it passes CI and `prodMigrations` would skip it (blind) — real: `payload migrate` reads `*.ts` from disk. prodMigrations is Epic 2 and excluded by the intent; added to `deferred`.
  - `[low]` `[reject]` The schema spec passes vacuously on a push-built `bookeh_test` (blind) — only when the README's reset step is skipped locally; in CI the push-stayed-off step catches it.
  - `[low]` `[patch]` The spec's `pushSchema` can prompt on an ambiguous rename and time out with no hint (blind) — grouped with edge-case row 1. Patched: explicit 30 s timeout, plus a comment that a timeout means a name mismatch between the migration and the config.
  - `[low]` `[patch]` The README does not cover the "did not finish" red state (blind) — patched: one sentence on running `migrate:create <name>` interactively and answering the prompt.
  - `[low]` `[patch]` Checks that depend on Payload internals don't say where to look after an upgrade (blind) — patched: both comments name the source file and Payload 3.90.2.
  - `[low]` `[reject]` `down` migrations are never run (blind) — not in the AC; production never runs `down`, and a reset round trip adds a CI step for an unused path.
  - `[low]` `[patch]` `pushSchema` prompt shows up as a timeout with no statements (edge-case) — same root and fix as the blind prompt row.
  - `[maybe-false]` `[reject]` The 5 s default timeout could fail a slow runner (edge-case) — locally 234 ms; settled by CI timings. If true it is only low, and the explicit 30 s timeout covers it anyway.
  - `[low]` `[reject]` carried: `DATABASE_PUSH` accepts only the literal `false` (edge-case) — same claim as the first pass; the push-stayed-off step catches a misspelling in CI.
  - `[low]` `[reject]` A local run with a misspelled value skips the spec while push runs (edge-case) — the README gives the exact `DATABASE_PUSH=false`; CI is authoritative.
  - `[low]` `[patch]` Rename drift fails with a generic error, naming no files or SQL (edge-case, claim) — by design the step fails safe; patched through the README sentence on resolving the prompt locally.

## Design Notes

- The drift check needs no database: `migrate:create` compares the config with the committed snapshot. Applying migrations then int tests with push off proves the `.ts` SQL actually builds what the snapshot claims. Together they cover AD-13's two failure modes.
- `DATABASE_PUSH` over `PAYLOAD_MIGRATING`: the adapter's `push` option is the documented API; the env var only feeds it.
- drizzle-kit can prompt on ambiguous renames; with stdin from `/dev/null` and the job's 20-minute timeout a prompt cannot stall CI indefinitely. Verify the non-TTY behaviour once with a deliberate rename-free drift.

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm run test:unit && npm run test:int` -- expected: green with default env (push on).
- Drift negative: temporarily remove the `alt` column from the `media` table in `src/migrations/20261009_092900_users.json` (config now differs from the snapshot), run the drift step exactly as in `ci.yml` (stdin closed); expected: new files under `src/migrations`, check fails, no hang. Restore with `git checkout -- src/migrations` and delete the generated files. Do not edit a collection file for this: a running `next dev` would push it to `bookeh` (1.8 lesson).
- Drift positive: same command on the clean tree; expected: exit 0, `git status --porcelain -- src/migrations` empty.
- Migrations path: reset `bookeh_test` (README), `DATABASE_URL=…/bookeh_test npm run payload -- migrate`, then `DATABASE_PUSH=false npm run test:int`; expected: green.
- Push-off negative: reset `bookeh_test` again, `DATABASE_PUSH=false npm run test:int` without migrating; expected: fails on missing relations. Then reset and leave `bookeh_test` usable (migrate it or let the next default int run push).
- `actionlint` if installed, else YAML parse of `ci.yml`; expected: valid.

## Auto Run Result

**Summary:** CI now checks for a missing migration (the run fails if `migrate:create --skip-empty` writes a file or does not finish), applies the committed migrations to the empty `bookeh_test`, runs `test:int` with push off (`DATABASE_PUSH=false` feeds the adapter's `push` option), and then checks that no dev push happened. A new int spec diffs the whole migration-built schema against the config.

**Files changed:**
- `.github/workflows/ci.yml` -- drift step, migrate step, `DATABASE_PUSH: 'false'` on `test:int`, push-stayed-off step.
- `src/payload.config.ts` -- `push: process.env.DATABASE_PUSH !== 'false'`.
- `.env.example` -- documents `DATABASE_PUSH`.
- `README.md` -- what CI checks, local reproduction, and how to fix a red drift check.
- `tests/int/migrationSchema.int.spec.ts` -- whole-schema diff on a migration-built DB (push off only).

**Review:** 16 findings. Patched 5 entries: 1 high (rename prompt passes the drift check), 2 medium (push-off unverified; schema checked only as far as the tests reach), 2 low (drift SQL not printed; README reproduction). Deferred: none. Rejected: 4 false and 5 low, each with its reason in the triage log.

**Follow-up review:** recommended (a high entry was patched on a first pass). The unverified risk: none of the new steps has run on GitHub Actions yet. Bash `<<<` under the runner's default shell, `docker exec` with `job.services.postgres.id` for the push-off step, and the no-op `SET DEFAULT` filter on a fresh runner were verified only locally. The first CI run on `main` settles it.

**Verification:** lint 0 errors (7 existing warnings); typecheck clean; unit 89/89; int 19/19 with the default env (implementation run); migrate plus `DATABASE_PUSH=false` int green; push-off negative fails on missing relations; the drift step extracted from `ci.yml` passes on the clean tree, fails on additive drift with SQL printed, and fails on rename drift; the schema spec passes on a migrated DB and fails after `drop column alt`.

**Residual risks:** The story 1.10 session works in the same tree and pushed `bookeh_test` during testing (one schema-spec run falsely passed; repeated back to back, it fails correctly). Its uncommitted hunks in `src/payload.config.ts` and `.env.example` were left out of this commit. After 1.10 lands, its `onInit` seed runs in the CI int lane on the migration-built schema.

### Follow-up pass (2026-10-09)

- **Patched (all low):** the schema spec gets a 30 s timeout and a comment on rename prompts; the drift-step and spec comments name the Payload 3.90.2 source files to recheck on a bump; the README covers the "did not finish" state. No logic change.
- **Deferred:** checking `index.ts` against the migration files, to Epic 2 with `prodMigrations` (medium; see `deferred`).
- **Rejected:** 5 false and 7 low or maybe-false, with reasons in the triage log.
- **Follow-up review:** not recommended. This pass patched no high finding, so the work has converged. Patched counts: high 0, medium 0, low 5 rows in 3 entries.
- **Verification:** lint 0 errors (7 existing warnings); typecheck clean; unit 89/89; schema spec 1/1 with `DATABASE_PUSH=false` on the migrated `bookeh_test`; the drift step extracted from `ci.yml` exits 0 on a clean tree.
- **Residual risk:** unchanged. The new steps still have to prove themselves on the first GitHub Actions run.
