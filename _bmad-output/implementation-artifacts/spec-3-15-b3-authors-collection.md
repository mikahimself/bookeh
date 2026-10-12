---
title: 'Story 3.15: [B3] `authors` collection'
type: 'feature'
created: '2026-10-12'
baseline_revision: 'b3ce7a8ee06221be14fbf3a88c1f15ead048dec1'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '_bmad-output/implementation-artifacts/epic-3-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      Deleting a shared author silently removes it from every Book once B2 adds books.authors.
    evidence: |-
      Payload rels foreign keys are ON DELETE cascade; isUnreferenced() covers only Undo. No books exist in 3.15, so the admin's back-office delete has nothing to cascade yet. B2 or a back-office delete rule decides.
    location: >-
      src/collections/Authors.ts
    severity: low
  - summary: >-
      No automated check runs down() migrations; Payload's generator drops the table before the rels constraint it cascaded away.
    evidence: |-
      CI applies migrations up only; nothing runs migrate:down or migrate:reset. 3.15's down() needed a hand reorder, found by review. Collection migrations in B4, B5 and B2 will repeat the generator's order. A CI step (migrate:reset then migrate on bookeh_test) would also run the older migrations' down() for the first time.
    location: >-
      .github/workflows/ci.yml
    severity: low
---

<intent-contract>

## Intent

**Problem:** Lookup and save need authors that match by name across Books (C5 `findOrCreateByName`, B2/B6 relations), and a name a user typed for a private Book must never show to another user. No `authors` collection exists; `bookFields.ts` still casts its slug.

**Approach:** Add `authors` with `name`, `nameKey`, `sortName`, `visibility`, `createdBy`. The AD-4 pieces every catalogue collection shares (visibility + hook-set `createdBy`, the read/write access, and the partial unique `nameKey` indexes) are written once, because `series` (B4) and `books` (B2) take the same rules next. Commit the migration and regenerated types; an int test covers access, `createdBy` and the constraints.

## Boundaries & Constraints

**Always:**
- Fields in this order: `name` (text, required, `maxLength: 200`), `nameKeyField()`, `sortNameField()`, `visibility` (select `shared | private`, required, **no default** so no caller gets a shared row by omission), `createdBy` (relationship to `users`, admin read-only).
- `createdBy` is set only by its `beforeValidate` hook; any input value is ignored. Effective visibility is the input's, else the stored row's. `shared` → `null`. `private` → the stored `createdBy` when the stored row was private and had one, else `req.user.id`; a private create without `req.user` throws (as `ownerField` does). So promotion (private → shared on the same row) clears it (AD-4).
- Access (AD-4, AD-5): read — admin `true`; signed-in user `{ or: [{ visibility: { equals: 'shared' } }, { createdBy: { equals: user.id } }] }`; signed-out `false`. Create, update, delete — admin only. `lib/catalogue` writes later with `overrideAccess`.
- Database constraints (AD-19), added through the Postgres adapter's `afterSchemaInit` + `extendTable`, present in this story's migration: unique `name_key` where `visibility = 'shared'`; unique `(created_by_id, name_key)` where `visibility = 'private'`.
- Admin: `group: 'Catalogue'`, `useAsTitle: 'name'`.
- Tests use names with a per-run random suffix: the shared index is global and test rows are never cleaned up.

**Never:**
- No `findOrCreateByName`, no `lib/catalogue` code, no `series`/`genres`/`books` collection (C5, B4, B5, B2).
- No `sortName` `maxLength`, no CHECK constraint tying `createdBy` to `visibility`: the AC sets neither.
- No list/search restriction beyond access (AD-7's no-browsing rule is enforced in services, not here).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Private create | System write as user A, `visibility: 'private'`, `createdBy: B.id` in data | Row with `createdBy = A`, `sortName` derived ("Jansson, Tove") | No error expected |
| Shared create | System write, `visibility: 'shared'`, `createdBy` in data | `createdBy` null | No error expected |
| Promotion | Update A's private row to `shared` | Same id, `createdBy` null | No error expected |
| Other user reads | B finds / findByIDs A's private author | Not in `find`; `findByID` throws `NotFound` | — |
| Shared read | B finds a shared author | Returned | No error expected |
| Admin read | Admin finds A's private author | Returned | No error expected |
| User writes | A creates (shared or private), updates or deletes any author through the gateway | Nothing written | `Forbidden` |
| Duplicate shared | Shared "Tove Jansson", then shared " tove  jansson " | Second not saved | Unique violation surfaces as Payload `ValidationError` |
| Same name across scopes | That shared name, plus private for A and private for B | All three saved | No error expected |
| Duplicate private | Second private of the same name for A | Not saved | `ValidationError` |
| Promotion onto shared name | A's private "X" promoted while shared "X" exists | Not saved; row stays private | `ValidationError` |
| Name too long | 201-char name (admin, through `runAction`) | Not saved | `{ ok: false, code: 'VALIDATION', fields: { name: 'VALIDATION' } }` |

</intent-contract>

## Code Map

- `src/collections/Media.ts`, `src/collections/Users.ts` -- collection style: local `Access` consts, doc comment citing the spine rule, `admin.group`.
- `src/fields/owner.ts` -- the hook shape to mirror for `createdBy` (`FieldHook`, `operation`, `previousValue`, throw without `req.user`).
- `src/fields/nameKey.ts`, `src/fields/sortName.ts` -- `nameKeyField()` / `sortNameField()`, both "spread after the collection's own `name`". `previousSiblingDoc` pattern for partial updates.
- `src/access/roles.ts` -- `isAdmin`; the only reader of roles (AD-2).
- `src/payload.config.ts:21,29-37` -- add `Authors` to `collections`; add `afterSchemaInit` to `postgresAdapter`.
- `node_modules/@payloadcms/drizzle/dist/postgres/types.d.ts:77-82` -- `PostgresSchemaHook({ schema, extendTable })`; `extendTable({ table: schema.tables.authors, extraConfig: (t) => ({ ... }) })`. Drizzle builders from `@payloadcms/db-postgres/drizzle/pg-core` (`uniqueIndex`) and `@payloadcms/db-postgres/drizzle` (`sql`); `drizzle-orm` is not a direct dependency. Collection `indexes` cannot express a `where`.
- `eslint.config.mjs:56-61` -- `src/collections` may import only `src/access`, `src/fields`, `payload-types.ts`: files in `src/collections` cannot import each other; `payload.config.ts` wires the index hook.
- `node_modules/@payloadcms/drizzle/dist/upsertRow/handleUpsertError.js:12-34` -- a 23505 becomes a `ValidationError`.
- `src/fields/bookFields.ts:5-6,47` -- drop the `AUTHORS` cast once the slug is generated; keep `SERIES`/`GENRES` and update the comment to B4–B5.
- `src/lib/payload/gateway.ts` -- `find`, `findByID`, `create`, `updateByID`, `deleteByID` take a `Context`; access applies.
- `tests/int/media.int.spec.ts` -- access-test pattern: `contextFor(user)`, gateway calls, `rejects.toThrow(Forbidden)`, `overrideAccess: true` for system writes.
- `tests/helpers/harness.ts` -- `createUser`, `contextFor`. A system write with a user is `payload.create({ ..., overrideAccess: true, req: (await contextFor(a)).req })`.
- `src/lib/errors.ts:55-61` -- `runAction` maps `ValidationError` to `VALIDATION`.
- `tests/int/migrationSchema.int.spec.ts` -- CI's drift check (`DATABASE_PUSH=false`); partial-index `where` text must round-trip without drift.
- `.github/workflows/*.yml:57-78` -- CI `migrate:create ci_drift_check --skip-empty` must write nothing.

## Tasks & Acceptance

**Execution:**
- `src/fields/visibility.ts` -- new. `visibilityFields()` returns `[visibility, createdBy]` per the Always rules, with the `createdBy` hook. -- AD-4's pair, reused by B4 and B2.
- `src/access/catalogue.ts` -- new. `catalogueAccess` (`read`, `create`, `update`, `delete`) per the Always rules. -- AD-4/AD-5 access in one home.
- `src/collections/catalogueIndexes.ts` -- new. `nameKeyIndexes(table)` returns a `PostgresSchemaHook` adding the two partial unique indexes (`<table>_name_key_shared_idx`, `<table>_created_by_name_key_private_idx`). -- AD-19.
- `src/collections/Authors.ts` -- new collection per the Always rules.
- `src/payload.config.ts` -- register `Authors`; `afterSchemaInit: [nameKeyIndexes('authors')]`.
- `src/payload-types.ts` -- `npm run generate:types`.
- `src/migrations/*` -- `npx payload migrate:create authors`; commit `.ts`, `.json`, regenerated `index.ts`. Confirm the SQL holds both `CREATE UNIQUE INDEX ... WHERE`.
- `src/fields/bookFields.ts` -- remove the `AUTHORS` cast.
- `tests/int/authors.int.spec.ts` -- new. Cover every matrix row.

**Acceptance Criteria:**
- Given `npm run test:unit`, `npm run test:int`, `npm run lint`, `npm run typecheck`, when they run, then all pass (lint: 0 errors).
- Given a scratch database built only by `payload migrate`, when `migrate:create` runs and `migrationSchema.int.spec.ts` runs with `DATABASE_PUSH=false` against it, then no migration is written and the spec passes.

## Spec Change Log

## Review Triage Log

### 2026-10-12 — Review pass
- verdicts: 17 findings — high 0, medium 4, low 10, false 3, maybe-false 0
- findings:
  - `[medium]` `[patch]` blind: `down()` drops `authors` CASCADE first, which already removes `payload_locked_documents_rels_authors_fk`, so the next `DROP CONSTRAINT` errors and migrate:down aborts. Reproduced by two reviewers. Patched: down() drops the rels constraint, index and column before the table; up → down → up checked on a scratch database.
  - `[low]` `[reject]` blind: nothing stops an admin demoting a shared author to private in the back office. Admin-only back-office action; AD-4 describes promotion only and no `books` exist yet to reference it; the fix adds a new rule and branch for a rare path.
  - `[low]` `[reject]` blind: a unique violation reports path `name_key` (or `created_by_id, name_key`), not `name`. Real (`handleUpsertError` falls back to the detail), but the app path matches first in `findOrCreateByName` (AD-19: the service check raises the `DomainError`), so only an admin duplicating a name in the back office sees it, and it still fails loudly; the fix wires adapter internals.
  - `[low]` `[reject]` blind: admin update/delete reach private rows and use `isAdmin`, not `canEditShared`. AD-4 gives the admin every row; AD-5 has the admin edit in the back office; `media` uses the same admin-only writes; the moderator role is beyond Phase 1. Restricting adds a row constraint for no Phase 1 harm.
  - `[low]` `[reject]` blind: `createdBy` FK is `ON DELETE SET NULL`, so deleting a user orphans their private authors. User deletion is FR-9, Phase 2 ("a walk over `createdBy`"); in Phase 1 only the admin can delete a user in the back office, a rare act; choosing cascade needs custom schema work.
  - `[low]` `[defer]` blind: deleting a shared author silently drops it from Books once B2 adds `books.authors` (rels cascade). No reference exists yet; the decision belongs to B2 / back-office deletes. Deferred.
  - `[low]` `[reject]` blind: no test that a private create without `req.user` throws. Every write path builds a context with a user (AD-16); the throw is loud; test-only finding without a reachable failure.
  - `[false]` `[reject]` blind: `nameKeyIndexes` does not check its columns. A collection missing the fields fails loudly at schema init, before anything runs; loud failure on misconfiguration is correct behaviour.
  - `[medium]` `[patch]` edge: down migration fails (same root cause as the first row). Patched with it.
  - `[low]` `[reject]` edge: unique violation path is a column. Same evidence as the blind row.
  - `[low]` `[reject]` edge: `ON DELETE SET NULL` orphans private rows. Same evidence as the blind row.
  - `[low]` `[reject]` edge: the admin's Duplicate on an author always hits the unique index. Duplicating an author has no use; it fails with a `ValidationError` and writes nothing.
  - `[medium]` `[patch]` verification-gap: signed-out read of `authors` is not pinned; a "shared means public" slip in `catalogueAccess.read` (reused by `series`, `books`) would pass every test. Patched: an `it` reads a shared author with `user: null` and expects `Forbidden`.
  - `[medium]` `[patch]` verification-gap (other): down migration fails. Same root cause as the first row; patched with it.
  - `[false]` `[reject]` intent: the constraint tests run against the push-built schema, not the migration. CI runs the int lane with `DATABASE_PUSH=false` on a `bookeh_test` built by `payload migrate`, so `authors.int.spec.ts` exercises the migration's indexes there; locally the scratch check showed both `WHERE` indexes in the migrated database.
  - `[false]` `[reject]` intent: "users never write" is admin-only access, not "only `lib/catalogue`". AD-5 says the admin edits shared records in the back office; the AC asks that users never write, which the test pins.
  - `[low]` `[reject]` intent: the private-create-without-user branch is untested. Same evidence as the blind row.

### 2026-10-12 — Review pass (follow-up)
- verdicts: 23 findings — high 0, medium 0, low 17, false 6, maybe-false 0
- findings:
  - `[false]` `[reject]` blind: admin read of every private author conflicts with FR-48. FR-48's excluded list is copies, People, loans, wishlists, overrides and personal tags, not catalogue records; FR-46 has the admin promote private Books and merge authors, which needs that read; AD-4 settles it ("admin reads all", deliberately wider).
  - `[low]` `[reject]` blind: nothing ties `nameKeyIndexes` to the collections that need it; B4/B2 could forget it. Each collection story's AC requires its own constraint test, which fails without the index; auto-deriving hooks from fields is a new mechanism.
  - `[low]` `[reject]` blind: no test pins the index predicates (drift check ignores `WHERE`). A predicate change is a code change in one reviewed helper; CI runs the constraint tests on the migration-built schema, so a predicate the migration lacks shows up there; a `pg_indexes` text test restates config.
  - `[low]` `[patch]` blind: the admin list cannot tell a shared author from a private one of the same name. Patched: `defaultColumns: ['name', 'visibility', 'createdBy']`.
  - `[low]` `[reject]` blind: `catalogueIndexes.ts` is not a collection but sits in `src/collections/`. It extends the collections' Drizzle tables and is wired only from `payload.config.ts`; a new top-level directory is a spine-level layout choice for no named harm.
  - `[low]` `[patch]` blind: `bookFields.int.spec.ts` still casts `authors` and says none of the targets exists in the app. Patched: cast dropped, comment covers only `series` and `genres`.
  - `[low]` `[patch]` blind: `media` missing from the doc comments listing catalogue collections (AD-14 gives it the same pair and writes). Patched both comments.
  - `[low]` `[patch]` blind: the test header claims every name is unique per run, but the first private name is unsuffixed. Patched the comment (private names are safe because each run creates fresh users).
  - `[false]` `[reject]` blind: the deferral is not handed to B2 through `deferred-work.md`. Epic 3 specs record deferrals in their `deferred` frontmatter (3.1, 3.6, 3.7, 3.9, 3.10, 3.12 and others), none in `deferred-work.md`; this one is recorded there.
  - `[low]` `[reject]` edge: an orphaned private row's next updater becomes its creator. carried — same claim as the first pass's `ON DELETE SET NULL` row; code unchanged.
  - `[low]` `[reject]` edge: orphaned private rows escape the per-creator index (NULLs distinct). carried — same root and claim as the first pass's `ON DELETE SET NULL` row.
  - `[low]` `[reject]` edge: unique violation path is `name_key`, not `name`. carried — first pass row.
  - `[low]` `[reject]` edge: admin Duplicate always hits the unique index. carried — first pass row.
  - `[false]` `[reject]` edge: `nameKeyIndexes` does not check its columns. carried — first pass row (loud failure at schema init).
  - `[false]` `[reject]` edge: the admin reads private names, against FR-48. Same refutation as the first row of this pass (FR-46, AD-4).
  - `[low]` `[patch]` verification-gap: the admin's update and delete through access are not pinned; `() => false` passes every test. Patched: an `it` renames and deletes a private author through the gateway as the admin.
  - `[low]` `[defer]` verification-gap: no automated check runs `down()`; a CI `migrate:reset` + `migrate` step would catch Payload's generator order. Pre-existing gap in CI, and it would also run the older migrations' `down()` for the first time; B4/B2 migrations will repeat the generator pattern. Deferred.
  - `[low]` `[patch]` verification-gap (other): the `catalogueAccess` comment says other writes come only from `lib/catalogue`, while the admin writes through access. Patched the comment.
  - `[low]` `[reject]` intent: the `createdBy` hook also throws on an update without a user (not only on create). Every write path carries a user (AD-16); the throw is loud and writes nothing.
  - `[low]` `[reject]` intent: no test covers any no-user throw path. carried — first pass row.
  - `[low]` `[patch]` intent: the first test's private name is unsuffixed against the literal suffix rule. Same root cause as the test-header row; patched with it.
  - `[false]` `[reject]` intent: `nameKeyIndexes` does not cover `books`. `books` has no `nameKey`; its ISBN partial indexes are B2's (AD-19 lists them separately).
  - `[false]` `[reject]` intent: constraints are tested on the push-built schema locally. carried — first pass row (CI runs them on the migration-built schema).

## Design Notes

The `createdBy` hook, the whole rule:

```ts
const createdByFromRequest: FieldHook = ({ originalDoc, previousValue, req, siblingData }) => {
  const visibility = siblingData.visibility ?? originalDoc?.visibility
  if (visibility !== 'private') return null
  if (originalDoc?.visibility === 'private' && previousValue != null) return previousValue
  if (!req.user) throw new Error('createdBy: no req.user on a private create')
  return req.user.id
}
```

Shared helpers rather than an authors-only file: the spine fixes identical rules for `authors`, `series`, `books` (AD-4, AD-19) and B4/B2 follow immediately; writing them twice would put one rule in two homes (AD-18).

## Verification

**Commands:**
- `npm run lint` -- expected: 0 errors.
- `npm run typecheck` -- expected: clean.
- `npm run test:unit` -- expected: all pass.
- `npm run test:int` -- expected: all pass, including `authors`, `bookFields`.
- Scratch check: create DB `bookeh_migcheck`; `DATABASE_URL=…/bookeh_migcheck npx payload migrate`; `npx payload migrate:create check --skip-empty` -- expected: no file written; then `DATABASE_URL=…/bookeh_migcheck DATABASE_PUSH=false npx vitest run --config ./vitest.config.mts --project int tests/int/migrationSchema.int.spec.ts` -- expected: pass; drop the DB.

## Auto Run Result

**Summary.** `authors` exists with `name` (required, max 200), `nameKey`, `sortName`, `visibility` and `createdBy`. The AD-4 pieces the catalogue collections share are written once: `visibilityFields()` (required `shared | private` with no default, and a `createdBy` set only by hook: null when shared, the stored creator or `req.user` when private, so promotion clears it), `catalogueAccess` (users read shared rows or their own private ones, the admin reads all, only the admin writes, signed out reads nothing) and `nameKeyIndexes(table)`, an `afterSchemaInit` hook that adds the two partial unique indexes (AD-19). The migration creates the table with both `WHERE` indexes.

**Files changed.**
- `src/collections/Authors.ts` -- new collection.
- `src/fields/visibility.ts` -- new: `visibility` + hook-set `createdBy`.
- `src/access/catalogue.ts` -- new: `catalogueAccess`.
- `src/collections/catalogueIndexes.ts` -- new: partial unique `nameKey` indexes via `afterSchemaInit`.
- `src/payload.config.ts` -- registers `Authors` and the index hook.
- `src/migrations/20261012_173948_authors.{ts,json}`, `src/migrations/index.ts` -- the migration; down() reordered so it runs.
- `src/payload-types.ts` -- regenerated.
- `src/fields/bookFields.ts` -- the `authors` slug cast is gone.
- `tests/int/authors.int.spec.ts` -- new: 9 tests covering `createdBy`, read scoping for another user, the creator, the admin and a signed-out request, refused user writes, both constraints including promotion onto a taken name, and the 200-character limit.

**Review.** 17 findings (medium 4, low 10, false 3). Patched 2 entries, both medium: the down migration aborted because the CASCADE had already dropped the constraint it then dropped (now reordered; up → down → up checked on a scratch database), and the signed-out read is now pinned by a test. Deferred 1: deleting a shared author will cascade out of Books once B2 adds `books.authors`. Rejected: demotion shared → private (admin-only, no rule in AD-4), constraint errors reported on the `name_key` column (the service matches first; admin-only path), admin writes on private rows and `isAdmin` vs `canEditShared` (AD-4/AD-5, matches `media`), `ON DELETE SET NULL` on `createdBy` (user deletion is Phase 2), admin Duplicate failing (fails loudly, no use), an untested no-user throw (AD-16 guarantees a user), and three false findings (loud schema-init failure; CI runs these tests on the migration-built schema; AD-5 allows admin back-office writes).

**Follow-up review:** recommended. Patched entries: high 0, medium 2, low 0. Named risk: CI's drift check (`migrationSchema.int.spec.ts`, drizzle-kit) ignores index predicates, so a later change to the `WHERE` of `nameKeyIndexes` would not show as drift; only the constraint tests in `authors.int.spec.ts` would catch it.

**Verification.** `npm run lint`: 0 errors (12 warnings, unused args in generated migrations). `npm run typecheck`: clean. `npm run test:unit`: 28 files, 494 passed. `npm run test:int`: 18 files passed, 1 skipped; 150 passed, 1 skipped. Scratch database built by `payload migrate`: `migrate:create check --skip-empty` wrote nothing; both partial indexes present with their `WHERE`; `migrationSchema.int.spec.ts` with `DATABASE_PUSH=false` against it passed. The spec's scratch command needs a vitest config without `vitest.setup.ts`, which rewrites `DATABASE_URL` to `bookeh_test`.

**Residual risks.** The drift check is blind to partial-index predicates (above). `series` (B4) and `books` (B2) must reuse `visibilityFields()`, `catalogueAccess` and `nameKeyIndexes`; only their own stories prove that.

### Follow-up review pass (2026-10-12)

**Changes.** `Authors.ts` shows `name`, `visibility` and `createdBy` as admin list columns, so shared and private authors of the same name are told apart. A new test pins the admin's update and delete through access. Doc comments now name `media` among the catalogue collections (AD-14) and say the admin writes through access while `lib/catalogue` writes with system privileges. `bookFields.int.spec.ts` drops the stale `authors` cast and comment. The `authors.int.spec.ts` header now matches what the tests do with names.

**Review.** 23 findings (low 17, false 6); 8 carried from the first pass unchanged. Patched 6 entries, all low (the six changes above). Deferred 1: no CI step runs `down()` migrations, and the B4/B5/B2 migrations will repeat Payload's generator order. Rejected: admin read of private authors (false: FR-46 needs it, FR-48 excludes only private user data, and AD-4 settles it); binding `nameKeyIndexes` to collections automatically, and a predicate test (each collection story's constraint test catches a missing index; CI runs them on the migrated schema); moving `catalogueIndexes.ts` (no named harm); the deferral needing `deferred-work.md` (false: epic 3 records deferrals in the spec frontmatter); the update-time no-user throw (AD-16); `books` outside `nameKeyIndexes` (false: no `nameKey`). The carried rows keep their first-pass verdicts.

**Follow-up review:** not recommended. On a follow-up pass that needs a `high` patch, and this pass had none. Patched entries: high 0, medium 0, low 6.

**Verification.** `npm run lint`: 0 errors (12 warnings in generated migrations). `npm run typecheck`: clean. `npm run test:unit`: 28 files, 494 passed. `npm run test:int`: 18 files passed, 1 skipped; 151 passed, 1 skipped (`authors` 10, `bookFields` 8). There is no schema change in this pass, so the migration is unchanged.
