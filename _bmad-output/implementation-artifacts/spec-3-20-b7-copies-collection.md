---
title: 'Story 3.20: [B7] `copies` collection'
type: 'feature'
created: '2026-10-17'
baseline_revision: 'e3faa9087784494caec67bb1bf1de9e86085808c'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
deferred:
  - summary: >-
      The copies foreign keys owner_id and book_id are ON DELETE set null on NOT NULL columns, so deleting a user or a Book that has copies fails with a raw Postgres not-null violation.
    evidence: |-
      Payload's generator emits set null for every relationship FK; verified on a scratch database that DELETE FROM users / books with a referencing copy fails. No app path deletes users (FR-9, Phase 2) or Books with copies yet; AD-18 puts those deletes in the owning services, which must delete or move copies first, or the FK changes to restrict/cascade by hand in a later migration.
    location: >-
      src/migrations/20261018_162301_copies.ts:17-18
    severity: low
  - summary: >-
      tests/unit/scanScreen.unit.spec.ts ("pushes the Answer address on an ISBN barcode, once, and ignores other codes") fails intermittently with "Couldn't create canvas for visual element scan".
    evidence: |-
      Seen in 2 of 7 unit runs during this story's verification; the diff touches nothing under tests/unit, src/app or src/lib. Pre-existing jsdom/zxing timing flake from Story 3.1.
    location: >-
      tests/unit/scanScreen.unit.spec.ts
    severity: low
---

<intent-contract>

## Intent

**Problem:** Every physical book is a per-user row (PRD Glossary: a shared Book is one edition, a copy is one item), but no `copies` collection exists yet. Story 3.33's `createCopy()` and the shelf need it.

**Approach:** Add the `copies` collection with `ownerField()`, a `readableRelation('books')`, a two-value `status` and `notes`, under owner-scoped access that applies to the admin as well (AD-1). Ship its migration, regenerated types and the two-user access test with a foreign id (AD-17).

## Boundaries & Constraints

**Always:**
- `src/collections/Copies.ts`, slug `copies`, fields in this order: `ownerField()`; `readableRelation('books', { name: 'book', required: true })`; `status` select, `required`, options `['ordered', 'owned']`, `defaultValue: 'owned'`; `notes` textarea, optional, `maxLength: 2000`. Nothing else (no `location`: that is 3.21).
- Access from one new helper `ownerAccess` in `src/access/owner.ts`: `create` is any signed-in user; `read`, `update`, `delete` return `{ owner: { equals: user.id } }` for a signed-in user and `false` for none. No `isAdmin` branch anywhere in it (AD-1: admin included). Doc comment cites AD-1 and lists the collections it is for (`copies`, `user-books`, `locations`, …).
- Admin UI: `admin.group: 'Library'`, `defaultColumns: ['book', 'status', 'owner', 'updatedAt']`.
- Register `Copies` in `payload.config.ts` collections in alphabetical order. No `afterSchemaInit` entry: `copies` has no unique constraint.
- Migration created with `npm run payload -- migrate:create copies`; commit `.ts`, `.json` and the regenerated `index.ts`. Check `down()` drops the `payload_locked_documents_rels` constraint, index and column before `DROP TABLE "copies" CASCADE` and the enum last, as in the books migration.
- `npm run generate:types` committed.
- Test `tests/int/copies.int.spec.ts` through `gateway.*` with `contextFor(user)`; Books are made with `payload.create({ overrideAccess: true, req })` as in `books.int.spec.ts` (copy `randomIsbn` there, or extract it into `tests/helpers/` if cleaner; `books.int.spec.ts` keeps passing either way).
- This worktree runs on its own Postgres on port 5433 (`.env` already points there, not committed). Use it for the dev database, the test database and the scratch migration check.

**Never:**
- No `location` field, no default-location hook, no status-dependent clearing (3.21, 3.34).
- No `lib/copies` service, no `createCopy()` (3.33). The test writes through the gateway as a user; that is the only sanctioned path until 3.33.
- No `ownedRelation` for `book`: Books are catalogue rows read through `catalogueAccess`, so `readableRelation` is the right name (AD-17).
- No edits to `src/fields/owner.ts` or `src/fields/relation.ts`; no `payload-types.ts` hand edits.
- No `user-books` (3.19 runs in another worktree). Expect a merge-time rebase: regenerate the migration and types after it.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Owned copy of a shared Book | User A creates `{ book: shared.id, status: 'owned', notes: 'Signed' }` | Row with `owner = A`, A reads it back by id and in `find` | No error expected |
| Owner from input ignored | A creates with `owner: B.id` in data | Stored `owner` is A | No error expected |
| Own private Book | A creates a copy of A's private Book | Created | No error expected |
| Foreign private Book | B creates a copy of A's private Book | Rejected | `ValidationError`, path `book` |
| Other user reads | B `find` with `id in [A's copy]`, B `findByID(A's copy)` | `find` returns no docs; `findByID` throws | `NotFound` |
| Admin reads | Admin `find` / `findByID` on A's copy | Same as B: empty, then `NotFound` | `NotFound` |
| Other user writes | B `updateByID` / `deleteByID` on A's copy | Rejected, row unchanged | `NotFound` or `Forbidden` (assert the row is unchanged, not the class) |
| Owner edits | A sets `status: 'ordered'`, A deletes | Updated, then gone | No error expected |
| Signed out | `payload.create` with a req without a user, `overrideAccess: false` | Rejected | `Forbidden` |
| Bad status | A creates with `status: 'loaned'` | Rejected | `ValidationError`, path `status` |

</intent-contract>

## Code Map

- `src/fields/owner.ts` -- `ownerField()`: owner from `req.user` on create, kept on update, input ignored, throws without a user. Read-only.
- `src/fields/relation.ts` -- `readableRelation(slug, { name, required, hasMany })`; its `validate` counts readable targets through `asRequestUser(req)` and returns `validation:invalidSelection`. Read-only. `tests/int/fieldHelpers.int.spec.ts:26-29` has the `own`/`ownerAccess` shape to lift into `src/access/owner.ts` (it stays local there; the test's throwaway config is not the app's).
- `src/access/catalogue.ts` -- `Access` typing and the `satisfies Record<'read' | 'create' | 'update' | 'delete', Access>` pattern to mirror in `src/access/owner.ts`. `src/access/roles.ts` is not needed here.
- `src/collections/Books.ts`, `src/collections/Genres.ts` -- collection shape and doc-comment style. `books` is the relation target; `catalogueAccess.read` is what makes a foreign private Book unreadable.
- `src/payload.config.ts:7-13,27` -- imports and the alphabetical `collections` list.
- `src/migrations/20261013_123727_books.ts` -- latest migration; the `down()` order to match. `src/migrations/index.ts` is regenerated by `migrate:create`.
- `tests/int/books.int.spec.ts:17-25,53-66` -- `randomIsbn()` and `systemCreate` for Books with `visibility`. `tests/int/series.int.spec.ts:42-63` -- the two-user read assertions (`find` with `id in`, `findByID` → `NotFound`).
- `tests/helpers/harness.ts` -- `createUser()`, `contextFor(user)`. `src/lib/payload/gateway.ts` -- `find`, `findByID`, `count`, `create`, `updateByID`, `deleteByID`, all `overrideAccess: false`.
- `eslint.config.mjs:55-61` -- `src/collections` imports only `src/access`, `src/fields`, `payload-types.ts`.
- `README.md:95-111` -- the scratch migration check and the CI drift check (`migrate:create <name> --skip-empty`, `DATABASE_PUSH=false npm run test:int`).
- `_bmad-output/implementation-artifacts/sprint-status.yaml:92` -- `3-20-b7-copies-collection: backlog` → `done` at the end.

## Tasks & Acceptance

**Execution:**
- `src/access/owner.ts` -- new `ownerAccess` per Always -- AD-1 in one place for every private collection.
- `src/collections/Copies.ts` -- new collection per Always -- AD-1, AD-8, AD-17.
- `src/payload.config.ts` -- register `Copies` -- collection goes live.
- `src/payload-types.ts` -- `npm run generate:types` -- typed `Copy`.
- `src/migrations/*` -- `migrate:create copies`; fix `down()` order if needed -- schema from the first migration (AD-13).
- `tests/int/copies.int.spec.ts` -- new: the matrix rows, grouped into a few tests -- the two-user access test with a foreign id.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `3-20-b7-copies-collection: done` at finalisation.

**Acceptance Criteria:**
- Given `npm run lint`, `npm run typecheck`, `npm run test:unit` and `npm run test:int`, when they run, then all pass (lint: 0 errors).
- Given a scratch database built only by `payload migrate`, when `migrate:create check --skip-empty` runs, then no migration is written, and `migrate:down` then `migrate` both succeed.
- Given `src/payload-types.ts`, when inspected, then `Copy.status` is `'ordered' | 'owned'` and `Copy.book` is `number | Book`.

## Spec Change Log

## Review Triage Log

### 2026-10-17 — Review pass
- verdicts: 22 findings — high 0, medium 0, low 17, false 5, maybe-false 0
- findings:
  - `[false]` `[reject]` intent (a): the access proof runs only at the Local API/gateway surface, not REST or the admin panel. Payload applies one collection `access` object to every surface (AD-2); `series`/`books` specs prove theirs the same way.
  - `[low]` `[reject]` intent (b): the admin's update/delete refusal and the foreign-Book check on update are not asserted. The same `own` function serves read, update and delete, so an admin write regression cannot pass the read test; `readableRelation` runs `validate` on update and `fieldHelpers.int.spec.ts` proves it. Adding tests that restate a proven helper has no reason.
  - `[low]` `[patch]` intent (c): the foreign-write test used bare `rejects.toThrow()`. Patched: asserts `Forbidden` on `updateByID` and `deleteByID` (Payload 3.90 `updateByID.js:142`/`deleteByID.js:64` throw `Forbidden` when a `where` policy hides the row; `NotFound` is for reads), with a comment.
  - `[false]` `[reject]` intent (d): `location` missing versus the PRD Glossary. The story text and STORY-SLICING assign `copies.location` to F1/3.21; the intent itself excludes it.
  - `[false]` `[reject]` intent (e): `defaultValue`, `maxLength`, admin config and the `randomIsbn` extraction go beyond the AC. No harm named; none contradicts the AC.
  - `[low]` `[defer]` intent (f): FKs `ON DELETE set null` on NOT NULL `owner_id`/`book_id`. Payload's generator default; deletes of users (FR-9, Phase 2) and of Books with copies belong to the owning services (AD-18). Deferred (see frontmatter).
  - `[low]` `[defer]` edge: deleting a user who owns a copy fails with a raw not-null violation. Same root as intent (f); deferred with it.
  - `[low]` `[defer]` edge: deleting a Book with copies fails the same way. Same root; deferred with it.
  - `[low]` `[patch]` verification-gap: a signed-out read of `copies` was asserted nowhere, so dropping the `: false` branch of `own` passed every test. Patched: "lets a signed-out request read nothing" test, `payload.find` with `user: null`, `overrideAccess: false` → `Forbidden`.
  - `[low]` `[defer]` verification-gap (other): the FK `set null` on NOT NULL columns. Same root as intent (f); deferred with it.
  - `[low]` `[defer]` blind: FK `set null` on NOT NULL columns, first such FK in the schema. Same root; deferred with it.
  - `[low]` `[patch]` blind: no test has a non-creator take a copy of a shared Book. Patched: the private-Book test now opens with B copying `shared`, owner B.
  - `[low]` `[patch]` blind: bare `rejects.toThrow()` on foreign writes. Same root as intent (c); patched with it.
  - `[low]` `[reject]` blind: `signedIn` is defined in both `catalogue.ts` and `owner.ts`. A one-liner that `Media.ts` also defines locally already; private collections reuse `ownerAccess`, so no third copy follows. Fix is a refactor of unchanged files for no everyday harm.
  - `[low]` `[reject]` blind: `rejectedPaths`/`ownerId` duplicated from `fieldHelpers.int.spec.ts`. That spec's versions are typed to its throwaway `Row`; a shared helper adds surface for two callers and would collide with 3.19's parallel worktree.
  - `[false]` `[reject]` blind: spec `status: in-review` contradicts `sprint-status.yaml: done`. The spec status flips to `done` at finalisation by this workflow; the sprint file uses its own vocabulary.
  - `[false]` `[reject]` blind: `context: []` and `warnings: ['oversized']` are wrong. The spec file exceeds 1600 tokens, so the warning is correct; the Code Map replaces the context list. Fix would edit this build's spec.
  - `[low]` `[reject]` blind: `notes` `maxLength: 2000` has no stated source. A limit of a few paragraphs on a free-text note; no everyday harm, and the fix is a comment on a magic number the owner can change.
  - `[low]` `[reject]` blind: `defaultColumns` includes `owner`, constant for the admin, and no `useAsTitle`. Cosmetic in the back office, which is not the product surface (CLAUDE.md: effort goes to the frontend); the spec fixed the list.
  - `[low]` `[reject]` blind: owner kept on update is not tested on `copies`. `fieldHelpers.int.spec.ts` proves `ownerField()` keeps the stored owner on update; the hook is the same object.
  - `[low]` `[reject]` blind: the rebase step after 3.19 is missing from Tasks/Verification. Fix would edit this build's spec; the risk is recorded under Residual risks.
  - `[low]` `[patch]` blind: the `ownerAccess` doc comment enumerates all eight private collections. Patched: cites AD-1 with `copies`, `user-books`, … as examples.

## Design Notes

`ownerAccess` deliberately has no admin branch. PRD FR-48: the admin role does not read users' private data; the back office shows the admin only their own copies. Bulk fixes to copies are the owner's, through the app.

`status` defaults to `owned` because the primary flow saves an owned copy and the admin form needs a value; 3.33's `createCopy()` always passes `status` explicitly, so the default carries no business rule.

Foreign-Book rejection is `ValidationError`, not `Forbidden`: `readableRelation`'s `validate` returns a message, so Payload reports it on the `book` path. Reads of another user's copy are `NotFound`, because owner access is a `where` constraint, not a boolean.

## Verification

**Commands:**
- `npm run lint` -- expected: 0 errors.
- `npm run typecheck` -- expected: clean.
- `npm run test:unit` -- expected: all pass.
- `npm run test:int` -- expected: all pass, including `copies`, `books`, `fieldHelpers`, `migrationSchema`.
- Scratch check on the worktree's Postgres (port 5433): `docker exec bookeh-postgres-copies psql -U bookeh -c 'CREATE DATABASE bookeh_migcheck'`; `DATABASE_URL=postgres://bookeh:bookeh@localhost:5433/bookeh_migcheck npm run payload -- migrate`; same URL `npm run payload -- migrate:create check --skip-empty` -- expected: no file written; `migrate:down` then `migrate` -- expected: both succeed; drop the database.
- CI-style: reset `bookeh_test` on port 5433, `DATABASE_URL=…5433/bookeh_test npm run payload -- migrate`, then `DATABASE_PUSH=false npm run test:int` -- expected: all pass.

## Auto Run Result

**Summary.** `copies` is the per-user row for one physical book. Fields: `ownerField()`, `book` as `readableRelation('books')` (required), `status` select `ordered | owned` (default `owned`), `notes` textarea. Access is the new `ownerAccess` in `src/access/owner.ts`: any signed-in user creates; read, update and delete are `owner = current user` with no admin branch (AD-1, FR-48). `readableRelation` makes another user's private Book an invalid target (AD-17). The migration adds the table, its enum and the `payload_locked_documents_rels.copies_id` column; `down()` was reordered by hand to drop that constraint, index and column before the table, as in the books migration.

**Files changed.**
- `src/access/owner.ts` -- new `ownerAccess`.
- `src/collections/Copies.ts` -- new collection.
- `src/payload.config.ts` -- registers `Copies`.
- `src/payload-types.ts` -- regenerated (`Copy`, `CopiesSelect`).
- `src/migrations/20261018_162301_copies.{ts,json}`, `src/migrations/index.ts` -- the migration; `down()` reordered.
- `tests/helpers/isbn.ts` -- `randomIsbn()` extracted from the books spec.
- `tests/int/books.int.spec.ts` -- imports the helper.
- `tests/int/copies.int.spec.ts` -- new: 8 tests over the matrix rows plus the review additions.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 3.20 done.

**Review.** 22 findings (low 17, false 5). Patched 4 entries, all low: foreign writes assert `Forbidden`; a signed-out read test; a non-creator copies a shared Book; the `ownerAccess` doc comment no longer enumerates every private collection. Deferred 2: the `ON DELETE set null` FKs on NOT NULL `owner_id`/`book_id` (Payload's default; user and Book deletes belong to the owning services, AD-18), and the pre-existing intermittent failure of `scanScreen.unit.spec.ts`. Rejected (each refuted or weighed in the log): access proven at the gateway surface only; admin write refusal and foreign Book on update untested; `location` absent; additions beyond the AC; duplicated `signedIn` and test helpers; spec status and frontmatter nits; the `notes` limit; `defaultColumns`/`useAsTitle`; owner-on-update untested; the missing rebase step.

**Follow-up review:** not recommended. Patched entries: high 0, medium 0, low 4.

**Verification** (all on this worktree's own Postgres, port 5433, container `bookeh-postgres-copies`).
- `npm run lint`: 0 errors (28 warnings, all unused args in generated migrations).
- `npm run typecheck`: clean.
- `npm run test:unit`: 500 passed on 5 of 7 runs; the other 2 failed only on the pre-existing `scanScreen` flake (deferred).
- `npm run test:int` (push mode): 22 files passed, `migrationSchema` skipped as designed; `copies` 7/7 before the patches.
- CI-style after the patches: `bookeh_test` dropped, rebuilt with `payload migrate`, `DATABASE_PUSH=false npm run test:int`: 23 files, 175 tests passed, `copies` 8/8, `migrationSchema` passed.
- Scratch database `bookeh_migcheck` built by `payload migrate`: `migrate:create check --skip-empty` wrote nothing; `migrate:down` then `migrate` succeeded; `payload_locked_documents_rels.copies_id` present after re-apply; database dropped.
- Playwright not run (collection story, no UI).

**Residual risks.**
- Story 3.19 (`user-books`) is being built in parallel on the main checkout. Whichever merges second must delete its migration, re-run `migrate:create`, regenerate `payload-types.ts` and repeat the scratch check (AD-13); otherwise CI's drift check fails. If 3.19 also adds an owner-access helper, keep one.
- The two deferred items above.
- The worktree's `.env` points at port 5433 and is not committed; the extra container is the owner's to remove.
