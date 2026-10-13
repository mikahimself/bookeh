---
title: 'Story 3.18: [B2] `books` collection'
type: 'feature'
created: '2026-10-13'
baseline_revision: '4e126fcfcf222bc45a79c32261c1795963e4dbec'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '_bmad-output/implementation-artifacts/epic-3-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      No automated check runs down() migrations.
    evidence: |-
      CI applies migrations up only; nothing runs migrate:down. The books down() was reordered by hand (the generator drops the table CASCADE before the payload_locked_documents_rels constraint) and checked on a scratch database. Same gap as deferred in 3.15 and 3.17; one CI step (migrate:down then migrate) would close it for every migration.
    location: >-
      .github/workflows/ci.yml
    severity: low
  - summary: >-
      Deleting a user leaves their private Books orphaned (createdBy set null).
    evidence: |-
      visibilityFields() createdBy is ON DELETE SET NULL (books_created_by_id_users_id_fk, as on authors and series). An orphaned private Book is readable only by the admin, escapes books_created_by_isbn13_private_idx (NULLs distinct), and a later private update by the admin gives it to the admin through the createdBy hook. Pre-existing in visibilityFields(); user deletion is a walk over createdBy in Phase 2 (spine Deferred, FR-6 to FR-9).
    location: >-
      src/fields/visibility.ts
    severity: low
---

<intent-contract>

## Intent

**Problem:** Copies, `user-books`, wishlist entries, the save and lookup all point at a Book, and no `books` collection exists. `bookFields()` (3.14) declares the Book field set, and `authors`, `series` and `genres` (3.15–3.17) are its relation targets, but nothing assembles them into one collection that holds both shared and private Books.

**Approach:** Add `books` built from `isbnField()`, `bookFields()`, `source`, an admin-only `rawMetadata` and `visibilityFields()`, with `catalogueAccess`. Its two partial unique ISBN indexes come from the same `afterSchemaInit` mechanism as `nameKeyIndexes`. Commit the migration and regenerated types, and add a two-user access and constraint test.

## Boundaries & Constraints

**Always:**
- Fields in this order: `isbnField()` (optional, because a manual Book may have no ISBN, D26), `...bookFields()`, `source` (text, optional: the id of the first source that answered, empty for a manual Book), `rawMetadataField()`, `...visibilityFields()`.
- `rawMetadataField()` lives in `src/fields/rawMetadata.ts`, the file ESLint already exempts from `no-explicit-any`. It is a `json` field named `rawMetadata` with field `access.read` admin only (`isAdmin(req.user)`). Its `typescriptSchema` emits the spine's `RawMetadata` shape (`v: 1`, `fetchedAt`, `sources` as an object of unknown, `subjects` as an object of string arrays, `coverUrl` string or null, all required, no extra keys), so `payload-types.ts` types it. Use `any` only if the schema typing cannot be done without it.
- Access is `catalogueAccess` unchanged: users read `visibility = shared OR createdBy = me`, the admin reads all, and only the admin creates, updates or deletes.
- AD-19 partial unique indexes from the first migration: `books_isbn13_shared_idx` on `(isbn13)` where `visibility = 'shared'`, and `books_created_by_isbn13_private_idx` on `(created_by_id, isbn13)` where `visibility = 'private'`. Generalise `nameKeyIndexes` in `catalogueIndexes.ts` to a column-parameterised helper. `nameKeyIndexes(table)` keeps its exact index names, so authors and series migrate to nothing new. Export `isbnIndexes` for `books`.
- Admin: `group: 'Catalogue'`, `useAsTitle: 'title'`, `defaultColumns: ['title', 'isbn13', 'visibility', 'createdBy']`.
- Test ISBNs are random valid ISBN-13s per run, because the shared index is global and test rows are never cleaned up.

**Never:**
- No `lib/catalogue` service, `mapSubjectsToGenres`, `editBook`, save or lookup changes (D1, G5, D5, C6).
- No `user-books`, `copies` or media visibility (B6, B7, D28).
- No database CHECK that a shared Book has an ISBN, and no plain `unique` on `isbn13`: AD-19 names only the two partial indexes.
- No change to `bookFields()` or `visibilityFields()` behaviour.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Read scope | A has a private Book; a shared Book exists | B finds only the shared one, and findByID on A's gives `NotFound`. A and the admin read both. Private `createdBy` = A, shared `createdBy` null | — |
| rawMetadata hidden | A shared Book and A's private Book carry `rawMetadata` | A and B read them without `rawMetadata`; the admin reads it | — |
| User writes | A creates (shared or private), updates or deletes a Book through the gateway | Nothing written; row unchanged | `Forbidden` |
| Shared ISBN taken | Second shared Book with the same ISBN (given as ISBN-10 or hyphenated) | Not saved | `ValidationError` |
| Private ISBN per creator | A and B each make a private Book, and a shared one exists, all with the same ISBN | All saved | — |
| Own private duplicate | A's second private Book with the same ISBN | Not saved | `ValidationError` |
| No ISBN | A makes two private Books with no ISBN | Both saved (NULLs are distinct) | — |

</intent-contract>

## Code Map

- `src/fields/bookFields.ts` -- `bookFields()`: the overridable set, then `cover` (upload → `media`), `genres` (hasMany → `genres`) and `themes` (text hasMany). Already plain relations for `books`. Read-only.
- `src/fields/isbn.ts` -- `isbnField()`: `isbn13` text, normalises in `beforeValidate`, rejects invalid. `toIsbn13()` is useful in the test to build a valid random ISBN.
- `src/fields/visibility.ts` -- `visibilityFields()`: required `visibility` select with no default, and `createdBy` set by hook (null for shared, `req.user` for private).
- `src/access/catalogue.ts` -- `catalogueAccess`, whose doc comment already names `books`. `src/access/roles.ts` -- `isAdmin`.
- `src/collections/Series.ts` -- collection shape to mirror (doc comment citing the spine, `admin`, access import).
- `src/collections/catalogueIndexes.ts` -- `nameKeyIndexes(table)`: `extendTable` + `uniqueIndex(...).on(...).where(sql...)`. Generalise this here.
- `src/payload.config.ts:26,39` -- add `Books` to `collections` in alphabetical order (Authors, Books, Genres, Media, Series, Users) and `isbnIndexes` to `afterSchemaInit`.
- `src/lib/metadata/source.ts:35` -- `RawMetadata` type, the shape the JSON schema mirrors. `src/fields` must not import it: the spine puts `lib/metadata` behind services. Duplicate the shape in the JSON schema.
- `eslint.config.mjs:193` -- `src/fields/rawMetadata.ts` `no-explicit-any` exemption. `eslint.config.mjs:57` -- collections import only `src/access`, `src/fields` and `payload-types.ts`.
- `node_modules/payload/dist/fields/config/types.d.ts:343` -- `typescriptSchema` on the json field.
- `tests/int/series.int.spec.ts` -- test pattern to copy: `systemCreate` with `overrideAccess` + `contextFor(user).req`, gateway calls, `rejects.toThrow(Forbidden|NotFound|ValidationError)`.
- `tests/int/migrationSchema.int.spec.ts` -- under `DATABASE_PUSH=false` (CI) proves the migration-built schema matches the config. Covers "generating a migration produces no changes".
- `src/migrations/20261013_122124_genres.ts` -- previous migration. Check that the new `down()` drops the `payload_locked_documents_rels` constraint, index and column before `DROP TABLE … CASCADE`, and that it also drops `books_rels` and `books_texts` (hasMany authors/genres/themes) and the enum. Reorder by hand if the generator gets it wrong (as in 3.15/3.17).

## Tasks & Acceptance

**Execution:**
- `src/collections/catalogueIndexes.ts` -- extract a column-parameterised partial-index helper. `nameKeyIndexes` keeps its names. Add `isbnIndexes` for `books` with the names in Always. -- AD-19 in one mechanism.
- `src/fields/rawMetadata.ts` -- new `rawMetadataField()` per Always.
- `src/collections/Books.ts` -- new collection per Always.
- `src/payload.config.ts` -- register `Books` and `isbnIndexes`.
- `src/payload-types.ts` -- `npm run generate:types`.
- `src/migrations/*` -- `npx payload migrate:create books`. Commit `.ts`, `.json` and the regenerated `index.ts`. Confirm the SQL creates both partial unique indexes with their `WHERE`. Fix `down()` ordering if needed.
- `tests/int/books.int.spec.ts` -- new: the matrix rows.

**Acceptance Criteria:**
- Given `npm run lint`, `npm run typecheck`, `npm run test:unit` and `npm run test:int`, when they run, then all pass (lint: 0 errors).
- Given a scratch database built only by `payload migrate`, when `migrate:create check --skip-empty` runs, then no migration is written, both `books` partial unique indexes exist with their `WHERE` clauses, and `migrate:down` then `migrate` succeed.
- Given `src/payload-types.ts`, when inspected, then `Book.rawMetadata` is typed with the `RawMetadata` keys, not as a bare JSON union.

## Spec Change Log

## Review Triage Log

### 2026-10-13 — Review pass
- verdicts: 22 findings — high 0, medium 0, low 14, false 8, maybe-false 0
- findings:
  - `[low]` `[defer]` verification-gap: the books `down()` is checked only by hand; no CI step runs `migrate:down`. Pre-existing repo-wide gap (deferred in 3.15, 3.17); this run checked up, down, up on a scratch database. Deferred.
  - `[false]` `[reject]` intent: `genres` "written only by `mapSubjectsToGenres()` and admin edits" has no field-level rule. Users have no write access on `books` at all; the single-writer rule is `lib/catalogue`'s (G5), which does not exist yet and the intent excludes.
  - `[false]` `[reject]` intent: `rawMetadata` hiding is tested only through `findByID`. Field `access.read` is applied by Payload to every read (find, REST, populated relations) through the same `afterRead` pass; no read path bypasses it without `overrideAccess`.
  - `[false]` `[reject]` intent: the migration-built constraints are proven only in push mode. CI runs `migrationSchema.int.spec.ts` on the migration-built schema; the scratch database built by `payload migrate` showed both indexes with `WHERE` in `pg_indexes`, and `migrate:create --skip-empty` wrote nothing.
  - `[false]` `[reject]` intent: no raw SQL insert tests the constraint. The `ValidationError` comes from Postgres 23505 through `handleUpsertError`; there is no app-level check to confuse it with.
  - `[false]` `[reject]` intent: admin gateway writes are untested. `catalogueAccess` is shared with authors, whose spec covers the admin branch; nothing in `books` changes it.
  - `[low]` `[reject]` intent: no CHECK that a shared Book has an ISBN. Same root as the blind/edge rows below; rejected with them.
  - `[false]` `[reject]` intent: the index refactor, typed `rawMetadata` and type churn go beyond the epic AC. No harm named; the refactor keeps the authors/series index names (no migration change) and the type churn is generated ordering only.
  - `[false]` `[reject]` intent: no commit or sprint-status update in the diff. Done at finalisation, outside the reviewed diff.
  - `[low]` `[patch]` blind: `rawMetadata`'s shape is typed but not validated; the admin can overwrite it in the back office's JSON editor. Patched: `admin: { readOnly: true }` on the field. System writes are typed by the generated `Book` type.
  - `[low]` `[reject]` blind: no hook keeps a shared Book's ISBN set and unchanged. Only a deliberate admin edit in the back office reaches it (`lib/catalogue` creates shared Books from a source outcome, AD-5), and the fix adds a validation branch the spec did not ask for.
  - `[low]` `[reject]` blind: a duplicate private ISBN reports the path `"created_by_id, isbn13"`. Confirmed in `handleUpsertError` (falls back to the detail's key list). It still fails loudly; `lib/catalogue` checks first with a `DomainError` (AD-19), and wiring `adapter.fieldConstraints` is adapter internals. Same verdict as 3.15's `nameKey` path.
  - `[low]` `[defer]` blind: deleting a user orphans their private Books (`ON DELETE SET NULL`). Pre-existing in `visibilityFields()`; user deletion is Phase 2. Deferred.
  - `[low]` `[reject]` blind: `scopedUniqueIndexes` takes a redundant `column` and guards only `field`. Two internal callers with fixed arguments; a wrong call fails at schema init. No everyday harm, and the guard adds code.
  - `[low]` `[patch]` blind: the admin list cannot search by ISBN. Patched: `listSearchableFields: ['title', 'isbn13']`.
  - `[false]` `[reject]` blind: the `.json` snapshot was not reviewed. `migrate:create check --skip-empty` diffs against it and wrote nothing on the migration-built scratch database, so it records both partial indexes.
  - `[low]` `[patch]` edge: system writes can store a malformed `rawMetadata`. Same root as the blind row; patched with it (system writes are type-checked; the back office is now read-only).
  - `[low]` `[reject]` edge: a shared Book with no ISBN escapes the shared index. Same root as the blind hook row; rejected with it.
  - `[low]` `[defer]` edge: a deleted user's private Books are orphaned and reassigned on a later admin edit. Same root as the blind row; deferred with it.
  - `[low]` `[reject]` edge: the private duplicate's error path is not a field. Same root as the blind row; rejected with it.
  - `[low]` `[reject]` edge: deleting an author or genre cascades out of `books_rels`. Payload's default for hasMany relations; only a deliberate admin delete reaches it, and delete and merge semantics belong to `lib/catalogue` (AD-18, C5, G11). A refusal hook adds guards the spec does not settle.
  - `[low]` `[reject]` edge: `scopedUniqueIndexes` does not guard `visibility`/`createdBy`. Same root as the blind row; rejected with it.

## Design Notes

`isbn13` stays optional with no plain `unique`. A manual private Book has no ISBN until `editBook()` adds one (AD-5). Postgres treats NULLs as distinct in a unique index, so ISBN-less private Books never collide. A shared Book always has an ISBN because only `lib/catalogue` creates one from a source outcome.

`rawMetadata` is hidden by field read access, not by `EffectiveBook` alone. The gateway runs with `overrideAccess: false`, so any user read drops it. `lib/catalogue` reads it with system privileges for `mapSubjectsToGenres()`.

## Verification

**Commands:**
- `npm run lint` -- expected: 0 errors.
- `npm run typecheck` -- expected: clean.
- `npm run test:unit` -- expected: all pass.
- `npm run test:int` -- expected: all pass, including `books`, `series`, `authors`, `bookFields`.
- Scratch check: create DB `bookeh_migcheck`; `DATABASE_URL=…/bookeh_migcheck npx payload migrate`; `npx payload migrate:create check --skip-empty` -- expected: no file written; `\d books` shows both partial unique indexes; `migrate:down` then `migrate` -- expected: both succeed; drop the DB.

## Auto Run Result

**Summary.** `books` holds shared and private Books in one collection. Its fields are `isbn13` (optional, normalised), the `bookFields()` set (including the `genres` has-many), `source`, an admin-only `rawMetadata` typed as `RawMetadata` and read-only in the back office, and `visibility`/`createdBy`. Access is `catalogueAccess`: users read shared Books and their own private ones, the admin reads all, and only the admin writes. AD-19's partial unique indexes come from the first migration: `books_isbn13_shared_idx` and `books_created_by_isbn13_private_idx`. They are built by `isbnIndexes`, which shares a column-parameterised helper with `nameKeyIndexes` (authors and series index names are unchanged). The admin list searches title and ISBN.

**Files changed.**
- `src/collections/Books.ts` -- new collection.
- `src/fields/rawMetadata.ts` -- `rawMetadataField()`: admin-only read, read-only in admin, typed schema.
- `src/collections/catalogueIndexes.ts` -- `scopedUniqueIndexes` helper; `nameKeyIndexes` unchanged in output; new `isbnIndexes`.
- `src/payload.config.ts` -- registers `Books` and `isbnIndexes`.
- `src/migrations/20261013_123727_books.{ts,json}`, `src/migrations/index.ts` -- the migration; `down()` reordered by hand.
- `src/payload-types.ts` -- regenerated.
- `tests/int/books.int.spec.ts` -- new: 6 tests over the 7 matrix rows.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 3.18 done.

**Review.** 22 findings (low 14, false 8). Patched 2 entries, both low: `rawMetadata` is read-only in the back office, and the admin list searches `isbn13`. Deferred 2: no CI step runs `down()` migrations, and deleting a user orphans their private Books (pre-existing in `visibilityFields()`, Phase 2). Rejected:
- No hook or CHECK keeping a shared Book's ISBN set and fixed: admin-only path, `lib/catalogue` sets it.
- The private-duplicate error path `"created_by_id, isbn13"`: loud, and `lib/catalogue` checks first, as in 3.15.
- Author/genre deletes cascading out of `books_rels`: owned by `lib/catalogue` delete and merge.
- `scopedUniqueIndexes` parameter and guard nits: two fixed callers.
- 8 false findings, each refuted in the log.

**Follow-up review:** not recommended. Patched entries: high 0, medium 0, low 2.

**Verification.**
- `npm run lint`: 0 errors (24 warnings, all unused args in generated migrations).
- `npm run typecheck`: clean.
- `npm run test:unit`: 500 passed.
- `npm run test:int`: 21 files passed, 1 skipped; 166 tests passed, 1 skipped (`books` 6). The implementer also rebuilt `bookeh_test` from migrations and ran `DATABASE_PUSH=false npm run test:int`: 167 passed, including `migrationSchema`.
- Scratch database `bookeh_migcheck` built by `payload migrate`:
  - `migrate:create check --skip-empty` wrote nothing.
  - `pg_indexes` shows both `books` partial unique indexes with their `WHERE` clauses.
  - `migrate:down` then `migrate` succeeded.
  - Repeated after the patches; the database is dropped.
- Playwright not run (collection story, no UI).

**Residual risks.** The two deferred items. A shared Book without an ISBN is prevented only by `lib/catalogue` (D1), not by the schema.

