---
title: '9.1 G1 Tags collection with kinds'
type: feature
created: '2026-11-04'
status: done
baseline_revision: ae29824464f209fc264e83bab23f3283c3b1a11e
review_loop_iteration: 0
followup_review_recommended: false
context:
  - /Users/mika/development/bookeh/CLAUDE.md
  - /Users/mika/development/bookeh/_bmad-output/implementation-artifacts/epic-9-context.md
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Personal tags, genres and themes have no private collection or relationship on user Book state.

**Approach:** Add one owner-scoped tags collection with required kind and normalized name uniqueness, and a validated has-many relationship from user-books, shipped with a migration and access tests.

## Boundaries & Constraints

**Always:** Apply owner-only access to every role, including admin. Use ownerField(), nameKeyField(), ownedRelation(), and the existing database foreign-key policy. Enforce uniqueness in Postgres on (owner, kind, nameKey). Generate Payload types and migration snapshots through project tooling. Keep the existing upsertUserBook sole-writer contract intact.

**Never:** Add tagging services, picker UI, filters, system-name collision logic, or genre mapping; these belong to later Epic 9 stories. Do not change the spine contract already specifying this model. Do not alter the development database through schema push.

</intent-contract>

## Code Map

- `src/collections/Locations.ts` — model for ownerAccess, ownerField, nameKeyField, required bounded name, compound unique index and private admin grouping.
- `src/fields/nameKey.ts` — NFC, whitespace and lowercase normalization; rejects blank names and ignores submitted nameKey.
- `src/fields/relation.ts` — ownedRelation validates every submitted target through authenticated reads, including has-many values.
- `src/collections/UserBooks.ts` — add optional tags relationship beside existing private state; existing (owner, book) uniqueness stays.
- `src/payload.config.ts` — collection registration and schema hooks.
- `src/collections/foreignKeys.ts` — ON_DELETE must list tags.owner_id as cascade; generated relationship-table keys remain cascade.
- `src/migrations/index.ts` and existing migration pairs — migrations registered for test and production; generated snapshot is drift authority.
- `tests/int/locations.int.spec.ts`, `tests/int/userBooks.int.spec.ts` — gateway access and ownership test patterns.
- `tests/helpers/harness.ts`, `tests/helpers/validation.ts` — authenticated contexts, users and rejectedPaths.
- `src/payload-types.ts` — generated collection and relationship types.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — synchronize 9.1 status.

## Tasks & Acceptance

**Execution:**
- [x] `src/collections/Tags.ts` — define owner-only collection with required name, normalized key, required kind (tag/genre/theme) and compound unique index.
- [x] `src/collections/UserBooks.ts`, `src/payload.config.ts`, `src/collections/foreignKeys.ts` — wire has-many owned tags relationship, collection and owner cascade.
- [x] `src/payload-types.ts`, `src/migrations/` — generate types and migration; inspect SQL for enum, unique index, ownership and relationship foreign keys, and reversible down migration.
- [x] `tests/int/tags.int.spec.ts`, `tests/int/userBooks.int.spec.ts` — test normalization and uniqueness dimensions, all-role privacy, and own/foreign relationship create and update validation.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` — update story progress and final status with run evidence in this spec.

**Acceptance Criteria:**
- Given authenticated users, when creating labels, then name and valid kind are required, nameKey is derived, duplicate normalized names within an owner/kind fail at the database constraint, and the same name in a different kind or owner succeeds.
- Given a private label, when its owner reads, updates or deletes it, then the action succeeds; when another user or admin does so, then read is hidden and writes are refused. Given an anonymous request, when accessing tags, then access is refused.
- Given an own user-books row, when assigning own tag IDs as a has-many list, then the relationship persists; when creating or updating with any foreign tag ID (including a mixed own/foreign list and an admin caller), then validation rejects tags and stored state stays unchanged.
- Given the migration-built test database, when the focused integration suite runs, then the model and relationship checks pass without schema push, and the generated schema includes owner cascade and database uniqueness.

## Spec Change Log

## Review Triage Log

### 2026-11-04 — Review pass
- verdicts: 14 findings — high 0, medium 2, low 0, false 12, maybe-false 0
- findings:
  - `[medium]` `[patch]` Blind hunter: rollback leaves targetless relationship rows — deleting both tables' rows with nonnull tags_id before dropping columns fixes the demonstrated residual rows; the populated down/up regression now checks cleanup and unrelated-row preservation.
  - `[false]` `[reject]` Blind hunter: missing kind-change uniqueness test — the same Postgres (owner, kind, nameKey) unique index guards creates and every update, independent of which indexed column changes; existing tests exercise uniqueness failures on both operations. No uncovered implementation failure was shown.
  - `[false]` `[reject]` Blind hunter: relationship fixtures only use tag kind — ownedRelation validates readable IDs without filtering kind; the required select permits all three kinds and tests successfully create genre and theme labels. No criterion requires a separate test of each equivalent relationship input.
  - `[false]` `[reject]` Blind hunter: missing nonexistent/deleted-ID cases — readableTargets counts every target and rejects whenever the count differs; Payload's built-in relationship validation runs first. The existing foreign-ID case proves the stricter ownership boundary; no new missing-ID behavior was introduced.
  - `[false]` `[reject]` Blind hunter: omitted tags and unrelated updates untested — the pre-existing user-books cases in this same passing suite create rows without tags and update other fields; the optional relationship has no default or mutation hook capable of clearing omitted assignments.
  - `[false]` `[reject]` Blind hunter: missing populated owner-cascade test — AD-19's declared schema hook and the generated migration both use cascade, confirmed against the database. The shared policy unit tests and schema-drift check cover the rule; no broken cascade or new application delete behavior was demonstrated.
  - `[false]` `[reject]` Blind hunter: missing assigned-label delete test — the relationship-table foreign key cascades on tags deletion while its parent key points to user_books; deleting a tag cannot cascade backwards to the parent or sibling label. Inspected SQL and schema match that direction.
  - `[false]` `[reject]` Blind hunter: serial uniqueness checks do not prove database enforcement — the migration creates an actual unique Postgres index, also confirmed by direct database inspection and migration schema comparison. Concurrency cannot bypass it; an additional concurrent call sequence would duplicate the same invariant.
  - `[false]` `[reject]` Blind hunter: absent accent-distinction case — shared toNameKey uses NFC, whitespace collapse and lowercase only, with no accent-folding operation. No implementation change to normalization exists here; existing decomposed-accent coverage exercises the relevant reuse.
  - `[false]` `[reject]` Blind hunter: in-review spec and done sprint disagree — the review snapshot necessarily precedes terminal finalization. Finalization synchronizes both and records this triage; a request solely to edit this build's spec is rejected by the workflow.
  - `[medium]` `[patch]` Verification-gap reviewer: migration rollback has no automated regression — added tagsMigration.int.spec.ts using the established transaction/rollback pattern, asserting removed table/columns/enum, removal of populated tag relations, preservation of unrelated relations, and successful reapplication. It ran and passed.
  - `[false]` `[reject]` Intent auditor: browser classification surfaces are absent under a broader reading — the numbered 9.1 acceptance criteria end at the collection boundary; stories 9.2–9.9 expressly supply services, filters, pickers and Settings. The collection-level reading matches the invoked story.
  - `[false]` `[reject]` Intent auditor: sole-writer service is unchanged — 9.1 adds the collection/relationship and requires a foreign-ID access test; the existing application service remains unchanged and the tests intentionally exercise Payload's access boundary. Service mutation work belongs to 9.2.
  - `[false]` `[reject]` Intent auditor: context refresh includes other Epic 9 guidance — step-01 mandates recompiling stale epic context from planning documents. These are distilled existing requirements for later stories, not untested executable changes or additions to 9.1 scope.

## Verification

**Commands:**
- `npm run generate:types` — generated types include Tag and UserBook.tags.
- `npm run test:int -- tests/int/tags.int.spec.ts tests/int/userBooks.int.spec.ts` — focused access, validation and uniqueness checks pass on migrated bookeh_test.
- `npm run typecheck` — no TypeScript errors.
- `npx eslint src/collections/Tags.ts src/collections/UserBooks.ts src/collections/foreignKeys.ts src/payload.config.ts tests/int/tags.int.spec.ts tests/int/userBooks.int.spec.ts` — no lint errors.

**Run evidence (2026-11-04):**
- `npm run generate:types` generated `Tag`, `UserBook.tags` and collection selectors.
- `DATABASE_PUSH=false npm run payload -- migrate:create tags` generated migration `20261104_151042_tags` and its snapshot. Inspected enum, owner cascade, relationship cascades and compound uniqueness. Corrected generated down ordering to remove referencing constraints before dropping `tags`.
- `npm run test:int -- tests/int/tags.int.spec.ts tests/int/userBooks.int.spec.ts`: 2 files, 13 tests passed against migration-built `bookeh_test`; no schema push. Initial sandbox attempt could not open tsx IPC; rerun with local process/database access passed.
- `npm run typecheck` and the scoped ESLint command above passed.
- `npm run test:unit -- tests/unit/foreignKeys.unit.spec.ts tests/unit/migrationsIndex.unit.spec.ts`: 2 files, 3 tests passed.
- Direct inspection of `bookeh_test` confirmed `tags_owner_id_users_id_fk` and `user_books_rels_tags_fk` cascade, and `owner_kind_nameKey_idx` is unique over `(owner_id, kind, name_key)`. Executed migration down then up within a rolled-back transaction successfully, preserving test data.

**Residual risks:** No known incomplete scope. Development database was not changed. Existing `upsertUserBook` implementation and spine contract are unchanged.


## Auto Run Result

Status: done

Implemented private `tags` for tag/genre/theme classification with normalized per-owner/per-kind uniqueness and validated `user-books.tags` ownership for every role, including admin.

Files changed:
- `src/collections/Tags.ts`: owner-only label model and compound unique index.
- `src/collections/UserBooks.ts`: has-many owned tags relationship.
- `src/collections/foreignKeys.ts`: owner cascade policy for tags.
- `src/payload.config.ts`, `src/payload-types.ts`: collection registration and generated types.
- `src/migrations/20261104_151042_tags.ts`, its JSON snapshot, and `src/migrations/index.ts`: registered schema migration and clean rollback.
- `tests/int/tags.int.spec.ts`, `tests/int/userBooks.int.spec.ts`: normalization, uniqueness, privacy and relationship ownership coverage.
- `tests/int/tagsMigration.int.spec.ts`: populated down/up rollback regression.
- `epic-9-context.md`, this spec, and `sprint-status.yaml`: refreshed required planning context, run evidence and completed story status.

Review: four layers completed. Two medium patch entries applied; zero deferrals; twelve findings rejected with individual evidence above. Patched counts: high 0, medium 2, low 0. Follow-up review recommended: false; populated rollback, schema comparison and access checks now verify the identified risks, with no specific unverified residual risk to name.

Final verification after review patches:
- `npm run generate:types`: passed.
- `npm run test:int -- tests/int/tags.int.spec.ts tests/int/userBooks.int.spec.ts tests/int/tagsMigration.int.spec.ts tests/int/migrationSchema.int.spec.ts`: 4 files, 15 tests passed on migrated bookeh_test with push disabled. Schema matches the Payload configuration.
- `npm run typecheck`: passed.
- Scoped ESLint including the migration regression test: passed.
- `git diff --check`: passed.
- Earlier schema-policy and migration-registry unit tests: 3 passed.

No product screen changed, so no Playwright walk applies. Development database unchanged; migration/application verification used bookeh_test. No known incomplete scope. No push performed.

Implementation revisions: `06aed5876ed97afaca7fc529bd58b0b4c50c43e8`; review patch revision: `b24438c9de0669b02cf1c3ce61c06e14dad3d937`.
