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
