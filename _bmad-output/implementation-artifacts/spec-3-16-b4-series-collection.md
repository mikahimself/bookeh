---
title: 'Story 3.16: [B4] `series` collection'
type: 'feature'
created: '2026-10-12'
baseline_revision: '288417dfcb4c801fc4eac863a5ce48f0a288f9de'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '_bmad-output/implementation-artifacts/epic-3-context.md'
warnings: []
deferred:
  - summary: >-
      No automated check runs down() migrations; the series down() order is verified only by hand.
    evidence: |-
      CI applies migrations up only (ci.yml runs payload migrate). The series down() was hand-reordered like the authors one; a regression to the generator order (DROP TABLE CASCADE before dropping the rels constraint) would abort a rollback with every CI step green. Same gap as 3.15's deferral; a CI migrate:reset then migrate step on bookeh_test covers every collection migration at once.
    location: >-
      .github/workflows/ci.yml
    severity: low
---

<intent-contract>

## Intent

**Problem:** Lookup and save need series that match by name (C5 `findOrCreateByName`, B2/B6 relations), and a series name a user typed for a private Book must never show to another user. No `series` collection exists; `bookFields.ts` still casts its slug.

**Approach:** Add `series` built from the helpers 3.15 wrote for exactly this: `nameKeyField()`, `visibilityFields()`, `catalogueAccess`, `nameKeyIndexes('series')`. Same rules as `authors`, without `sortName`. Commit the migration and regenerated types; an int test covers access and the per-scope `nameKey` constraints.

## Boundaries & Constraints

**Always:**
- Fields in this order: `name` (text, required, `maxLength: 200`), `nameKeyField()`, `...visibilityFields()`.
- `access: catalogueAccess`; admin `group: 'Catalogue'`, `useAsTitle: 'name'`, `defaultColumns: ['name', 'visibility', 'createdBy']` — identical to `Authors.ts`.
- `afterSchemaInit` gains `nameKeyIndexes('series')`; the migration holds both partial unique indexes (`series_name_key_shared_idx`, `series_created_by_name_key_private_idx`) with their `WHERE`.
- The migration's `down()` is hand-ordered as in `20261012_173948_authors.ts`: drop the `payload_locked_documents_rels` constraint, index and column before `DROP TABLE ... CASCADE`.
- Shared test names carry a per-run random suffix (the shared index is global, rows are never cleaned up).

**Never:**
- No `sortName`, no `findOrCreateByName`, no `lib/catalogue` code, no `genres`/`books` collection (C5, B5, B2).
- No change to the shared helpers' behaviour; no new helper.
- No re-test of behaviour the shared helpers already prove through `authors` (the `createdBy` hook branches, signed-out read, the 200-char limit, admin writes).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Other user reads | B finds / findByIDs A's private series | Not in `find`; `findByID` throws `NotFound`; the shared series is returned | — |
| Creator and admin read | A findByIDs own private series; admin finds both | Returned | No error expected |
| User writes | A creates (shared or private), updates or deletes a series through the gateway | Nothing written | `Forbidden` |
| Duplicate shared | Shared "Muumit", then shared " muumit " | Second not saved | `ValidationError` |
| Same name across scopes | That shared name, plus private for A and private for B | All saved | No error expected |
| Duplicate private | Second private of the same name for A | Not saved | `ValidationError` |

</intent-contract>

## Code Map

- `src/collections/Authors.ts` -- the template; `Series.ts` is this minus `sortNameField()` and with series wording in the doc comment.
- `src/fields/visibility.ts`, `src/access/catalogue.ts` -- `visibilityFields()` / `catalogueAccess`; doc comments already list `series`. Read-only.
- `src/collections/catalogueIndexes.ts` -- `nameKeyIndexes(table)`, an `afterSchemaInit` hook. Read-only.
- `src/payload.config.ts:7-8,21,37` -- import `Series`, add to `collections` (alphabetical: `Authors, Media, Series, Users`), `afterSchemaInit: [nameKeyIndexes('authors'), nameKeyIndexes('series')]`.
- `src/migrations/20261012_173948_authors.ts` -- shape of the expected migration and the hand-reordered `down()`.
- `src/fields/bookFields.ts:5-7,47` -- drop the `SERIES` cast; keep `GENRES`; comment names only B5 (story 3.17).
- `tests/int/bookFields.int.spec.ts:21,26` -- drop the `series` cast; comment names only `genres` as not in the app yet.
- `tests/int/authors.int.spec.ts` -- pattern to follow: `systemCreate` with `overrideAccess` and `contextFor(user).req`, gateway calls, `rejects.toThrow(Forbidden|NotFound|ValidationError)`.
- `tests/helpers/harness.ts` -- `createUser`, `contextFor`.
- `tests/int/migrationSchema.int.spec.ts`, CI `migrate:create ci_drift_check --skip-empty` -- drift check on the migration-built schema.

## Tasks & Acceptance

**Execution:**
- `src/collections/Series.ts` -- new collection per the Always rules.
- `src/payload.config.ts` -- register `Series` and its index hook.
- `src/payload-types.ts` -- `npm run generate:types`.
- `src/migrations/*` -- `npx payload migrate:create series`; reorder `down()`; commit `.ts`, `.json`, `index.ts`. Confirm both `CREATE UNIQUE INDEX ... WHERE`.
- `src/fields/bookFields.ts`, `tests/int/bookFields.int.spec.ts` -- remove the `series` casts and stale comments.
- `tests/int/series.int.spec.ts` -- new; cover every matrix row in three `it`s (read scoping, refused user writes, constraints).

**Acceptance Criteria:**
- Given `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run test:int`, when they run, then all pass (lint: 0 errors).
- Given a scratch database built only by `payload migrate`, when `migrate:create check --skip-empty` runs, then no migration is written; when the series migration's `down()` then `up()` run on it, then both succeed.

## Spec Change Log

## Review Triage Log

### 2026-10-12 — Review pass
- verdicts: 14 findings — high 0, medium 0, low 8, false 6, maybe-false 0
- findings:
  - `[low]` `[patch]` blind: the `Series.ts` doc comment names only private Books as the origin of private series; AD-5/AD-6 also create one from an override name. Patched: "a private Book or an override" in `Series.ts`, and the same wording in `Authors.ts`.
  - `[false]` `[reject]` blind: admin read of private series made from override names conflicts with FR-48. FR-48 excludes overrides (the owner-only `user-books` rows), not catalogue records; FR-46 has the admin promote and merge, which needs the read; AD-4 settles it ("admin reads all", deliberately wider). Same refutation as 3.15's follow-up row.
  - `[low]` `[reject]` blind: `createdBy` `ON DELETE SET NULL` orphans a deleted user's private series (escapes the per-creator index, next updater becomes creator). User deletion is FR-9, Phase 2; in Phase 1 only the admin deletes a user in the back office; changing the FK needs custom schema work. Same reasoning as 3.15.
  - `[false]` `[reject]` blind: the refused creates never check that nothing was written. Payload's create runs the access check before any write and throws `Forbidden` there; a row cannot exist after that throw.
  - `[low]` `[patch]` blind: `sprint-status.yaml` still lists 3.16 as `backlog`; 3.15's commit updated it. Patched: set to `done` with the story commit.
  - `[false]` `[reject]` blind: nothing shows the scratch-database check ran. It ran (see Auto Run Result: no migration written, down/up succeeded, both partial indexes present); the fix is a spec edit.
  - `[false]` `[reject]` blind: two different series with the same name merge. AD-19 and the conventions decide matching by `nameKey` alone; the story asks for the rules of `authors`.
  - `[low]` `[reject]` blind: the new `migrations/index.ts` entry lacks a trailing comma. Generated file, rewritten by the next `migrate:create` (it added the comma on the authors entry); no harm.
  - `[false]` `[reject]` blind: the `bookFields.int.spec.ts` comment no longer explains why `authors`/`series` stay stand-ins. Its first sentence does (throwaway collections on a second instance in its own schema); the remaining clause explains only the `genres` cast.
  - `[low]` `[reject]` edge: `ON DELETE SET NULL` leaves orphaned private series outside the per-creator index. Same root and reasoning as the blind row.
  - `[low]` `[defer]` verification-gap: no automated check runs the series `down()`. Pre-existing CI gap (3.15 deferral); fix belongs in CI for every migration. Deferred.
  - `[low]` `[reject]` verification-gap: the series 200-character limit is unpinned (inline `maxLength`, not shared). A test would restate a config literal, which the owner's test policy rejects; an over-long name fails nowhere worse than a long name.
  - `[false]` `[reject]` intent: tests stop at the shared helpers rather than showing every `authors` behaviour on `series` (reading R2). The AC asks for an access test of another user's private series and a user write attempt, which the diff has, plus the constraints; the helpers' branches are proven once through `authors`.
  - `[low]` `[defer]` intent: the hand-ordered `down()` is checked only manually. Same root cause as the verification-gap `down()` row; deferred with it.

## Verification

**Commands:**
- `npm run lint` -- expected: 0 errors.
- `npm run typecheck` -- expected: clean.
- `npm run test:unit` -- expected: all pass.
- `npm run test:int` -- expected: all pass, including `series`, `authors`, `bookFields`.
- Scratch check: create DB `bookeh_migcheck`; `DATABASE_URL=…/bookeh_migcheck npx payload migrate`; `npx payload migrate:create check --skip-empty` -- expected: no file written; `migrate:down` then `migrate` -- expected: both succeed; drop the DB.

## Auto Run Result

**Summary.** `series` exists with `name` (required, max 200), `nameKey`, `visibility` and `createdBy`, built from the helpers 3.15 wrote: `nameKeyField()`, `visibilityFields()`, `catalogueAccess` and `nameKeyIndexes('series')`. Same rules as `authors`, no `sortName`: users read shared rows and their own private ones, the admin reads all, only the admin writes, and `nameKey` is unique among shared rows and per creator among private rows as partial unique indexes in the migration. `bookFields.ts` now uses the generated `series` slug.

**Files changed.**
- `src/collections/Series.ts` -- new collection.
- `src/collections/Authors.ts` -- doc comment: private rows also come from override names (review patch).
- `src/payload.config.ts` -- registers `Series` and `nameKeyIndexes('series')`.
- `src/migrations/20261012_184054_series.{ts,json}`, `src/migrations/index.ts` -- the migration; `down()` hand-ordered like the authors one.
- `src/payload-types.ts` -- regenerated.
- `src/fields/bookFields.ts`, `tests/int/bookFields.int.spec.ts` -- `series` slug casts removed.
- `tests/int/series.int.spec.ts` -- new: read scoping (another user, creator, admin), refused user writes, both `nameKey` constraints.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 3.16 done.

**Review.** 14 findings (low 8, false 6). Patched 2, both low: the doc comment now names override names as a source of private series (in `Authors.ts` too), and sprint-status is updated. Deferred 1: no CI step runs `down()` migrations (same gap 3.15 deferred). Rejected: admin read vs FR-48 (false: FR-48 excludes overrides, not catalogue records; AD-4, FR-46); `ON DELETE SET NULL` orphans (user deletion is Phase 2); refused creates not checked for writes (false: access throws before any write); scratch check unrecorded (false, ran; recorded here); same-name series merge (false: AD-19 by design); missing trailing comma in generated `index.ts` (no harm); `bookFields` stand-in comment (false: its first sentence explains it); the unpinned series 200-char limit (a test would restate config); R2 parity tests on `series` (false: the AC's access test and constraints are covered, helpers proven through `authors`).

**Follow-up review:** not recommended. Patched entries: high 0, medium 0, low 2.

**Verification.** `npm run lint`: 0 errors (16 warnings, unused args in generated migrations). `npm run typecheck`: clean. `npm run test:unit`: 494 passed. `npm run test:int`: 19 files passed, 1 skipped; 154 passed, 1 skipped (`migrationSchema`, CI-only). Scratch database `bookeh_migcheck` built by `payload migrate`: `migrate:create check --skip-empty` wrote nothing; `migrate:down` then `migrate` succeeded; `pg_indexes` shows both series partial indexes with their `WHERE`; database dropped.

**Residual risks.** Story 3.17 appears to be in progress in parallel (a `bookeh-pg-3-17` container is running); whichever merges second must regenerate its migration and types after rebase. The drift check stays blind to partial-index predicates; only the constraint tests catch a changed `WHERE`.
