---
title: 'Story 3.21: [F1] Locations and the default location'
type: 'feature'
created: '2026-10-18'
baseline_revision: 'c8517f76c863e1c913ecc374867f421370cb9eea'
status: 'done'
review_loop_iteration: 1
followup_review_recommended: false
context:
  - '_bmad-output/implementation-artifacts/epic-3-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      locations.owner_id is NOT NULL with an ON DELETE set null foreign key, so deleting a user who has locations fails with a raw Postgres not-null violation.
    evidence: |-
      Payload's generated default for a required relationship, the same as user_books.owner_id (3.19) and copies.owner_id (3.20). User deletion is Phase 2 (FR-9) and its rule belongs to the owning services (AD-18); one migration can fix all three tables then.
    location: >-
      src/migrations (the locations migration)
    severity: low
  - summary: >-
      The hand-reordered migration down() is verified only by the manual scratch check; nothing in CI runs migrate:down.
    evidence: |-
      Verification-gap reviewer: .github/workflows/ci.yml runs `migrate` only and migrationSchema.int.spec.ts diffs the up-built schema, so a wrongly ordered down() (the generator's default drops the table before the FK drops on copies, users and payload_locked_documents_rels) ships green and fails at rollback. Same practice as 3.19/3.20; the scratch check (migrate, migrate:down, migrate) passed for this diff. One CI step `migrate:down` + `migrate` after "Apply migrations to bookeh_test" would cover every migration.
    location: >-
      .github/workflows/ci.yml
    severity: low
---

<intent-contract>

## Intent

**Problem:** A copy cannot say where it is and a profile has no default location: `copies` (3.20) has `book`, `status` and `notes` only, and `users` has no `defaultLocation`, so the primary flow's "Add to library saves at the default location" (FR-4, FR-31, FR-32) has no data to land on.

**Approach:** Add the `locations` private collection (`ownerField()`, `name`, `nameKeyField()`, `ownerAccess`, `(owner, nameKey)` unique in the database), point `copies.location` and `users.defaultLocation` at it with `ownedRelation('locations')`, and enforce on `copies` that an ordered copy has no location. Commit the migration and regenerated types, with a two-user access test using foreign ids.

## Boundaries & Constraints

**Always:**
- Slug `locations`, file `src/collections/Locations.ts`, `access: ownerAccess`. Fields in order: `ownerField()`; `name` (text, required, `maxLength: 200`); `nameKeyField()`. `indexes: [{ fields: ['owner', 'nameKey'], unique: true }]` so the unique index is in the migration that creates the table (AD-19). Admin: `group: 'Library'`, `useAsTitle: 'name'`, `defaultColumns: ['name', 'updatedAt']`.
- `src/collections/Copies.ts`: add `ownedRelation('locations', { name: 'location' })` after `status` (optional). A collection-level `beforeValidate` hook throws `ValidationError` on path `location` (message `req.t('validation:invalidInput')`) when the effective status is `ordered` and the effective location is not `null`/`undefined`. Effective = the value in `data` when the key is present, else `originalDoc`'s. The hook never clears anything: clearing belongs to `lib/copies` (AD-18).
- `src/collections/Users.ts`: add `defaultLocation` = `ownedRelation('locations', { name: 'defaultLocation' })` (optional) after `collectionVisibility`, with field-level `access: { create: self, read: self, update: self }` where `self` is `req.user.id === id` (false on create, where `id` is undefined). The admin never reads or writes another user's default location (FR-48, Visibility table), and cannot point it at one of the admin's own locations.
- Register `Locations` in `payload.config.ts` collections, alphabetical (`…, Genres, Locations, Media, …`).
- Fix the Copies doc comment ("`location` comes with the `locations` collection") to describe the field and the hook.

**Never:**
- No `lib/copies` service: no `Ref` resolution, no inline create, no default applied to new copies (F2, 3.34), no rename/merge/delete (F5, F7), no Settings UI (K11, F8). No change to `lib/account/profile.ts`: `Profile` gains `defaultLocation` in 3.42.
- No `admin.condition` on `location` (Payload skips `validate` on a hidden field; the hook is the rule). No field-level `validate` replacing `ownedRelation`'s.
- No change to `ownerField()`, `nameKeyField()`, `ownedRelation()`, `ownerAccess`. No `afterSchemaInit` index helper.
- No copy-count, no use of `locations` from the shelf or any screen.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Own location | A creates `{ name: '  Mökki  ' }` via the gateway, with `owner: B` in the input | Saved; `owner` = A, `name` as given, `nameKey` = `'mökki'` | — |
| Read scope | A's location exists | A's `find`/`findByID` return it; B's and the admin's `find` return no docs, `findByID` fails | `NotFound` |
| Foreign write | B or the admin updates/deletes A's location by id | Nothing changes | `Forbidden` |
| Unique per owner | A has `Tampere`; A creates `tampere`; B creates `Tampere` | A's second fails; B's is saved | `ValidationError` |
| Copy at own location | A creates an owned copy with A's location | Saved with `location` = that id | — |
| Copy at foreign location | A creates a copy with B's location id | Not saved, error path `location` | `ValidationError` |
| Ordered with location | A creates `{ status: 'ordered', location: <own> }`; or updates an owned copy at a location to `{ status: 'ordered' }` without `location: null` | Not saved, error path `location` | `ValidationError` |
| Ordered cleared | A updates `{ status: 'ordered', location: null }` | Saved, `location` null | — |
| Own default | A updates own user `{ defaultLocation: <own id> }`; then `null` | Saved; then cleared | — |
| Foreign default | A updates own user with B's location id | Not saved, error path `defaultLocation` | `ValidationError` |
| Admin and another's default | Admin updates A's user with the admin's own location; admin reads A | A's `defaultLocation` unchanged; the field is absent from the admin's read | — (field dropped silently) |

</intent-contract>

## Code Map

- `src/collections/Copies.ts` -- the collection to extend; `src/collections/UserBooks.ts` -- `indexes` compound-unique style and doc-comment style; `src/collections/Genres.ts` -- `nameKeyField()` and `defaultSort: 'name'` in a collection.
- `src/collections/Users.ts:5-16` -- `Access`/`FieldAccess` helpers (`adminOrSelf`, `adminOnlyField`); add `self` beside them. Field access args: `node_modules/payload/dist/fields/config/types.d.ts:86-110` (`id` undefined on create). `node_modules/payload/dist/collections/config/types.d.ts:618-624` -- `typescript: { interface }` names the generated interface.
- `src/fields/owner.ts`, `src/fields/nameKey.ts` (`keyFromName` throws `ValidationError` with `{ collection, errors: [{ path, message }], req }` -- the pattern for the copy hook), `src/fields/relation.ts` (`ownedRelation` returns a `SingleRelationshipField` whose `validate` is `readableTargets`; it rejects when `req.user` is absent or cannot read the target), `src/access/owner.ts` (`ownerAccess`). Read-only.
- `node_modules/payload/dist/collections/operations/utilities/update.js:60-69,100-137` -- on update `submittedTopLevelFieldNames` is `undefined` unless the collection uses trash, so **every field is validated, not only the submitted ones**; order: field `beforeValidate` (unwraps `{ id }` to ids, sets `owner`, computes `nameKey`, and refills every unsubmitted field from the stored row), then collection `beforeValidate` (`data` now carries the stored values too, plus `originalDoc`, `operation`, `req`), then validation. `node_modules/payload/dist/collections/config/types.d.ts:68-90` -- `BeforeValidateHook<T>` args (exported as `CollectionBeforeValidateHook`).
- `node_modules/payload/dist/fields/hooks/beforeValidate/promise.js:218-245` -- a field whose `access[operation]` is false is deleted from the input and, on update, refilled from the stored doc (`getFallbackValue`); the refilled value is then validated like any other. `afterRead/promise.js:223-230` -- `access.read` false removes the field from the result.
- `node_modules/payload/dist/auth/operations/forgotPassword.js:156-164` -- the reset token is written with `payload.update({ …, req })` and no `req.user`: a `users` field validator that needs a request user breaks password reset (FR-5).
- `node_modules/payload/dist/fields/config/types.d.ts:30-70` -- validate options carry `id`, `req`, `operation`, `siblingData`, `previousValue`. `node_modules/payload/dist/fields/validations.d.ts:71` -- `RelationshipFieldSingleValidation`.
- `node_modules/@payloadcms/drizzle/dist/schema/build.js:190-229`, `utilities/buildIndexName.js` -- compound index named from field paths: expect `owner_nameKey_idx` (later `people`/`tags`/`wishlists` get `_1`, `_2`… by registration order).
- `src/payload.config.ts:7-14,29` -- imports and `collections`.
- `src/migrations/20261018_162301_copies.ts` -- latest migration and the hand-reordered `down()`. Expect: `CREATE TABLE "locations"`, `ALTER TABLE "copies" ADD COLUMN "location_id"`, `ALTER TABLE "users" ADD COLUMN "default_location_id"`, FKs `ON DELETE set null`, `CREATE UNIQUE INDEX … ON "locations" ("owner_id","name_key")`. The generated `down()` drops `locations CASCADE` before the FK/index/column drops on `copies`, `users` and `payload_locked_documents_rels`; reorder by hand so those drop first.
- `tests/int/copies.int.spec.ts` -- `systemBook`, `copyAs`, `ownerId`, the `Forbidden`/`NotFound` assertions; `tests/int/userBooks.int.spec.ts` -- unique-constraint and read-scope tests; `tests/int/users.int.spec.ts:30-45` -- updating a user as themself. `tests/helpers/harness.ts` (`createUser`, `contextFor`, `as`), `tests/helpers/validation.ts` (`rejectedPaths`), `tests/helpers/isbn.ts`.
- `src/lib/payload/gateway.ts` -- `find`, `findByID`, `create`, `updateByID`, `deleteByID`, `overrideAccess: false`; `users` updates through it are the profile path.
- `README.md:95-111` -- scratch migration check; `tests/int/migrationSchema.int.spec.ts` -- CI drift check under `DATABASE_PUSH=false`.
- `_bmad-output/implementation-artifacts/sprint-status.yaml:93` -- `3-21-f1-locations-and-the-default-location` is already `done` in the working tree; leave it.
- Dev Postgres on `localhost:5432` (`.env` `DATABASE_URL`, database `bookeh`; int tests use `bookeh_test`). The containers on 5433/5434 belong to other worktrees: do not touch them.

## Tasks & Acceptance

**Execution:**
- `src/collections/Locations.ts` -- new collection per Always, plus `defaultSort: 'name'` and `typescript: { interface: 'UserLocation' }` (the generated name `Location` would shadow the DOM global and a forgotten import would compile against `window.location`'s type) -- AD-1, AD-19, Names convention.
- `src/collections/Copies.ts` -- `location` field; the ordered-copy `beforeValidate` hook per Design Notes; add `location` to `admin.defaultColumns` after `status`; doc comment -- AD-8 ("an ordered copy has no location"), AD-17.
- `src/collections/Users.ts` -- `defaultLocation` per Design Notes: `ownedRelation` spread with self-only field access and its `validate` run only for the user's own write -- AD-17, FR-4, FR-5, FR-48.
- `src/payload.config.ts` -- register `Locations`.
- `src/payload-types.ts` -- `npm run generate:types`.
- `src/migrations/*` -- `npx payload migrate:create locations`; commit `.ts`, `.json`, regenerated `index.ts`; reorder `down()` per Code Map.
- `tests/int/locations.int.spec.ts` -- new: the matrix rows grouped into a few tests, and in addition: (1) a location-only update `{ location: <own> }` on a copy stored as `ordered` is rejected on path `location` and the stored `location` stays null; (2) with A's default set, the admin updates A's `displayName` and it succeeds with A's default untouched, and `payload.forgotPassword({ collection: 'users', data: { email: a.email }, disableEmail: true })` returns a token; (3) the admin test uses a user created inside that test, so it never depends on another test having cleared the default.
- Do not commit: the run commits at finalisation.

**Acceptance Criteria:**
- Given `npx eslint src tests`, `npm run typecheck`, `npm run test:unit` and `npm run test:int`, when they run, then all pass (lint: 0 errors; `npm run lint` additionally reports pre-existing errors from `.claude/worktrees/*/.next`, which are not this story's).
- Given a scratch database built only by `payload migrate`, when `migrate:create check --skip-empty` runs, then no migration is written, `locations` has a unique index on `(owner_id, name_key)`, and `migrate:down` then `migrate` succeed.
- Given `src/payload-types.ts`, when inspected, then `Copy.location` and `User.defaultLocation` are `(number | null) | UserLocation` (optional), `UserLocation` has `owner`, `name`, `nameKey`, and no interface named `Location` is generated.

## Spec Change Log

- 2026-10-18, implementation (first pass): the "Admin and another's default" row came out only partly as predicted: with A's default already set, the admin's write was refused with `ValidationError` instead of being dropped. The first pass recorded this as acceptable. The review showed it is the visible edge of a larger defect (next entry).
- 2026-10-18, review pass 1 (bad_spec): **Trigger.** Blind and edge-case reviewers proved that once a user has a `defaultLocation`, *every* update of that user by anyone but the user fails validation on `defaultLocation`: the admin changing roles or display name, a system `payload.update` without a request user, and Payload's own `forgotPassword` (FR-5). Cause: Payload validates every field on update and refills unsubmitted fields from the stored row, and `ownedRelation`'s validator checks the stored target against the request user, who cannot read it. The spec's Code Map and Design Notes wrongly claimed Payload validates only submitted fields, which also made the copy hook's `originalDoc` fallbacks dead code. **Amended.** Design Notes and Tasks: `defaultLocation` keeps `ownedRelation`'s validator but runs it only when the request user is the row's own user (`options.req.user?.id === options.id`); for anyone else the field was already dropped by access and refilled from the stored row, so there is nothing to validate. This composes the helper's validator rather than replacing it, and leaves `ownedRelation()` itself untouched. The copy hook reads `data` only. Added: `UserLocation` interface name, `defaultSort`, `location` admin column, the three extra test cases, test decoupling. **Avoids.** A user row that locks against the admin and password reset the moment a default location is chosen. **KEEP.** The `Locations` collection exactly as first built (fields, `indexes`, admin block). The `copies` hook as a collection-level `beforeValidate` throwing `ValidationError` on path `location`, with the `{ status: 'ordered', location: null }` update accepted. The `self` field access on `defaultLocation` (`id !== undefined && user?.id === id`). The test file's structure: `locationAs`/`copyAs` helpers through the gateway, `storedUser` read past access, `rejectedPaths` for error paths, `Forbidden` on foreign by-id writes, `NotFound` on foreign by-id reads, `payload.count` proving no row references the foreign location. The hand-reordered migration `down()`.

## Review Triage Log

### 2026-10-18 — Review pass 1
- verdicts: 16 findings — high 2, medium 1, low 10, false 0, maybe-false 0; grouped into 1 bad_spec entry (the admin/reset lock and everything folded into the re-derivation), 1 defer, 3 reject
- findings:
  - `[high]` `[bad_spec]` blind: once `defaultLocation` is set, every non-self update of the user (admin `roles`/`displayName`, system write without a user, `forgotPassword`) fails validation on `defaultLocation` — verified in `update.js:68-69` (all fields validated unless trash), `beforeValidate/promise.js:236-244` (refill from stored row), `relation.ts` (`!req.user` → `invalidSelection`), `forgotPassword.js:156` (no user on the update). Amendment: self-only validator run in Design Notes.
  - `[low]` `[bad_spec]` blind: no test has the admin edit an unrelated field of a user with a default set — folded into Tasks (test case 2).
  - `[low]` `[bad_spec]` blind: the hook's rationale ("Payload validates only submitted fields") is false and its `originalDoc` fallbacks are dead — verified; Design Notes rewritten, hook reads `data`.
  - `[medium]` `[bad_spec]` blind: generated `Location` interface shadows the DOM global; a forgotten import compiles silently against `window.location` — real for every later importer (`lib/copies`, shelf, Settings). Amendment: `typescript: { interface: 'UserLocation' }`.
  - `[low]` `[bad_spec]` blind: no `defaultSort` on `locations`, admin pickers list in id order — one line, folded in.
  - `[low]` `[bad_spec]` blind: `copies` admin columns omit the new `location` — one word, folded in.
  - `[low]` `[bad_spec]` blind: the `Users.ts` comment describes the lock as an admin-submits-the-field quirk — same root as the first row; the comment is rewritten with the fix.
  - `[low]` `[reject]` blind: name all three tables in the FK deferral — the fix edits this build's spec; the deferred entry already names the shared root cause.
  - `[high]` `[bad_spec]` edge: admin updating any field of a user whose default is set is refused — same root as the first blind row.
  - `[high]` `[bad_spec]` edge: `forgotPassword` breaks for a user with a default set — same root.
  - `[low]` `[reject]` edge: the unique-violation `ValidationError` path is `owner_id, name_key`, not `name` — real, but screens never hit the raw constraint: `lib/copies` matches by `nameKey` before creating (F2) and rename answers `NAME_TAKEN` (F7, AD-18); same ruling as 3.15/3.18/3.19.
  - `[low]` `[defer]` edge: `owner_id` NOT NULL with `ON DELETE set null` — generated default shared with `user_books` and `copies`; recorded in `deferred`.
  - `[low]` `[bad_spec]` verification-gap: a location-only update on a copy stored as `ordered` is untested, so dropping the status fallback passes every test — folded into Tasks (test case 1).
  - `[low]` `[bad_spec]` verification-gap (other): the admin test depends on the previous test having cleared A's default — folded into Tasks (test case 3).
  - `[low]` `[reject]` intent-alignment: the database constraint is observed by the test as a Payload `ValidationError`, the index itself only by the scratch check and CI's drift test — consistent with 3.19's practice; the scratch check in Verification inspects the index directly.
  - `[low]` `[reject]` edge (note): the Copies.ts comment on submitted-field validation is inaccurate — same root as the blind rationale row, folded in there; no separate action.

### 2026-10-18 — Review pass 2
- verdicts: 16 findings — high 0, medium 0, low 11, false 2, maybe-false 0, carried 3; 1 patch entry (2 rows + 2 same-root rows), 1 defer, the rest rejected
- findings:
  - `[low]` `[patch]` blind: the validator guard `req.user?.id === id` is true on a userless create (`undefined === undefined`), so the helper's validator runs there and rejects any value, while `self` answers false on create — verified; patched: guard is `options.id !== undefined && options.req.user?.id === options.id`.
  - `[low]` `[patch]` blind: the `defaultLocation` JSDoc attaches to the `OwnedSingle` type alias, not the field — verified; patched: type and its note moved above the JSDoc.
  - `[low]` `[reject]` blind: `as OwnedSingle` asserts `validate` exists with no runtime guard — the helper always attaches it and the own-write test calls it, so a regression fails `locations.int.spec.ts`; a module-load guard adds complexity for a path tests already cover.
  - `[false]` `[reject]` blind: the migration `.json` snapshot is missing from the diff — excluded from the review diff on purpose (3000 generated lines); it is in the working tree, and the scratch check and CI drift test key off it.
  - `[low]` `[reject]` blind: the back office lets the owner delete a location, and the `set null` FKs un-place its copies and clear the default with no confirmation — the database does exactly what `deleteLocation()` (F5, AD-18) will do; F5 adds the dialog and the count. Only the owner can reach it (owner-scoped access) and no screen offers it.
  - `[low]` `[reject]` blind: no `CHECK (status <> 'ordered' OR location_id IS NULL)` — AD-19 lists unique constraints only; the invariant lives in the collection hook (AD-18) and every write goes through Payload; a CHECK would also need an `afterSchemaInit` entry to pass the drift test.
  - `[low]` `[reject]` blind: no positive test for an ordered copy created without a location or an owned copy with none — `copies.int.spec.ts` creates owned copies with no location in every case and updates one to `ordered` without a location; test-only ask with coverage elsewhere.
  - `[low]` `[reject]` edge: unique-violation `ValidationError` path is `owner_id, name_key` — carried from pass 1 (screens never hit the raw constraint).
  - `[false]` `[reject]` edge: a later `(owner, nameKey)` index collides on the name `owner_nameKey_idx` — `buildIndexName` appends `_1`, `_2` on collision (Code Map); no migration fails.
  - `[low]` `[patch]` edge: validator runs on a userless create — same root as the first blind row; patched with it.
  - `[low]` `[reject]` edge: the owner deletes the location between the validator's count and the copy insert, giving a raw FK error — a race inside one user's own requests; the fix adds an error-code branch for a case no screen can produce.
  - `[low]` `[reject]` edge: deleting a location silently nulls `default_location_id` and `copies.location_id` — same root as the blind back-office row; rejected with it.
  - `[low]` `[defer]` edge: `owner_id` NOT NULL with `ON DELETE set null` — carried from pass 1; already in `deferred`.
  - `[low]` `[patch]` edge (claim): "the validator runs only for the user's own write" is false on a userless create — same root as the first blind row; patched with it.
  - `[low]` `[defer]` verification-gap: `down()` is verified only by the manual scratch check — pre-verified; the reviewer ran the scratch check and it passed; deferred (CI `migrate:down` step covers every migration).
  - `[low]` `[reject]` intent-alignment: a privileged write (`overrideAccess: true`) to `users` by a non-self request user bypasses `defaultLocation`'s validator — no such writer exists: AD-3's system-privilege allowlist is `lib/catalogue`, `lib/shelf` and the first-user seed, none of which touch `users.defaultLocation`, and `lib/account` goes through the gateway (lint-enforced). Recorded under residual risks for any future privileged writer of `users`.

## Design Notes

**Copy hook.** `noLocationWhenOrdered` is a collection `beforeValidate` hook on `copies`, not a `validate` on `location`: an invariant on one collection lives in its hooks (AD-18), and the error must land on `location` whichever field the write submitted. By the time it runs, Payload's field `beforeValidate` has refilled every unsubmitted field from the stored row, so on update `data.status` and `data.location` are always present and `originalDoc` is not needed:

```ts
const noLocationWhenOrdered: CollectionBeforeValidateHook<Copy> = ({ collection, data, req }) => {
  if (data?.status === 'ordered' && data.location != null) {
    throw new ValidationError({ collection: collection.slug, errors: [{ path: 'location', message: req.t('validation:invalidInput') }], req })
  }
  return data
}
```

**Default location.** Collection access lets the admin update any user, and Payload validates every field on update after refilling the ones not submitted. `ownedRelation`'s validator checks the target against the request user, so the stored default of user A would be checked against the admin (unreadable), against no one in a system write, and against no one in `forgotPassword`: A's row would lock the moment A picked a default. The field therefore keeps the helper's validator but runs it only for A's own write; nobody else can write the field (access drops it and the stored value comes back), so for them there is nothing to validate:

```ts
const self: FieldAccess = ({ req: { user }, id }) => id !== undefined && user?.id === id
const defaultLocation = ownedRelation('locations', { name: 'defaultLocation' })
const ownLocation = defaultLocation.validate   // RelationshipFieldSingleValidation
…
{
  ...defaultLocation,
  validate: (value, options) =>
    options.req.user?.id === options.id ? ownLocation(value, options) : true,
  access: { create: self, read: self, update: self },
}
```

(`options.id` is undefined on create, where the field is dropped anyway.) The admin's write of another user's default is thus a silent no-op in every state, as the matrix says, and the field is absent from the admin's read.

## Verification

**Commands:**
- `npx eslint src tests` -- expected: 0 errors.
- `npm run typecheck` -- expected: clean.
- `npm run test:unit` -- expected: all pass.
- `npm run test:int` -- expected: all pass, including `locations`, `copies`, `users`, `profile`.
- Scratch check (database `bookeh_migcheck` on the 5432 Postgres, created with `docker exec bookeh-postgres-1 psql -U bookeh -c 'create database bookeh_migcheck'`): `DATABASE_URL=postgres://bookeh:bookeh@localhost:5432/bookeh_migcheck npx payload migrate`; `… npx payload migrate:create check --skip-empty` -- expected: no file written; `\d locations` shows the unique index on `(owner_id, name_key)`; `… migrate:down` then `… migrate` -- expected: both succeed; drop the database.

## Auto Run Result

**Summary.** `locations` is a private collection: `ownerField()`, `name`, `nameKeyField()`, `ownerAccess`, `defaultSort: 'name'`, generated interface `UserLocation`, and the `(owner, nameKey)` unique index (`owner_nameKey_idx`) in the migration that creates the table. `copies.location` and `users.defaultLocation` are `ownedRelation('locations')`. A collection `beforeValidate` hook on `copies` rejects any write whose resulting state is `ordered` with a location, on path `location`, whichever field was submitted; it never clears. `defaultLocation` has self-only field access (the admin neither reads nor writes another user's default) and runs the helper's validator only for the user's own write, because Payload validates every field on update after refilling the unsubmitted ones: without that gate a user's row locked against the admin, system writes and `forgotPassword` the moment a default was set. One review loop: the first implementation shipped that lock and was re-derived from the amended spec.

**Files changed.**
- `src/collections/Locations.ts` -- new collection.
- `src/collections/Copies.ts` -- `location` field, `noLocationWhenOrdered` hook, `location` admin column, doc comment.
- `src/collections/Users.ts` -- `defaultLocation` with `self` field access and the self-gated validator (`isSelf` shared by both).
- `src/payload.config.ts` -- registers `Locations`.
- `src/migrations/20261018_164917_locations.{ts,json}`, `src/migrations/index.ts` -- the migration; `down()` reordered by hand.
- `src/payload-types.ts` -- regenerated (`UserLocation`, `Copy.location`, `User.defaultLocation`).
- `tests/int/locations.int.spec.ts` -- new: 7 tests over the 11 matrix rows plus the location-only update on an ordered copy, the admin's edit of another field and `forgotPassword` with a default set.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 3.21 done.

**Review.** Pass 1: 16 findings (high 2, medium 1, low 10, false 0, carried 0): routed bad_spec on the admin/reset lock; code reverted and re-derived with `UserLocation`, `defaultSort`, the admin column, three extra test cases and test decoupling folded in; 3 rejected (deferral wording is a spec edit; unique-violation path is handled by `lib/copies` per AD-18; the database constraint observed through `ValidationError` matches 3.19's practice); 1 deferred (FK `set null` on NOT NULL `owner_id`). Pass 2: 16 findings (low 11, false 2, carried 3): patched 1 entry, low (validator guard on a userless create, JSDoc placement); deferred 1 (`down()` verified only by the scratch check); rejected: `as OwnedSingle` without a runtime guard, missing `.json` in the review diff, back-office location delete relying on `set null`, no CHECK constraint, positive no-location tests, index-name collision, validator race with a concurrent delete, privileged writes bypassing the validator (no such writer exists), each with its reason in the triage log.

**Follow-up review:** not recommended. Patched entries this pass: high 0, medium 0, low 1.

**Verification.**
- `npx eslint src tests`: 0 errors (36 pre-existing unused-arg warnings in generated migrations). `npm run lint` also reports errors from `.claude/worktrees/story-3-22-effective-book/.next`, another session's worktree.
- `npm run typecheck`: clean.
- `npm run test:unit`: 500 passed. One earlier run, concurrent with the int lane, had one failure that three clean reruns did not reproduce; the failing test's name was not captured.
- `npm run test:int`: 24 files passed, 1 skipped (`migrationSchema`, push on); 188 tests passed (`locations` 7, `copies` 8, `users`, `profile`).
- Scratch database `bookeh_migcheck` on 5432, built by `payload migrate`: `migrate:create check --skip-empty` wrote nothing; `\d locations` shows `owner_nameKey_idx UNIQUE (owner_id, name_key)`; `migrate:down` then `migrate` succeeded; database dropped. Run twice on this migration file (implementation and the verification-gap reviewer); the pass 2 patch changed no schema.
- Playwright not run (collection story, no UI).

**Residual risks.** The two deferred items. A future privileged writer of `users` (`overrideAccess: true` with a request user other than the row's) bypasses `defaultLocation`'s validator and must check the location itself; today no such writer exists. `lib/copies` (F2, D24) must send `location: null` together with `status: 'ordered'`, or the hook refuses the write.
