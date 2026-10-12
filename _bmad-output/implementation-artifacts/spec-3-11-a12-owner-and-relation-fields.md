---
title: 'Story 3.11: [A12] Owner and relation fields'
type: 'feature'
created: '2026-10-12'
baseline_revision: '942c785f93933fd7016ff71ae58b08085169384c'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '_bmad-output/implementation-artifacts/epic-3-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** The private collections of the schema lane (`user-books`, `copies`, `locations` in 3.19–3.21, later `loans`, `wishlists`, `tags`) need one owner field and authorised relations (AD-1, AD-17), and `src/fields` has neither: nothing yet stops a private row without an owner, an owner taken from input, or a relation to another user's row.

**Approach:** Add `ownerField()` and `ownedRelation()` / `readableRelation()` to `src/fields`. The owner is set by a field hook from `req.user` on create and kept on update. The relation helpers' `validate` runs Payload's own relationship check, then counts the targets through `asRequestUser(req)` and rejects any it cannot read. A throwaway collection, on a second Payload instance in its own Postgres schema, proves them in an integration test.

## Boundaries & Constraints

**Always:** `ownerField()` is `owner`, a required relationship to `users` with an admin read-only field. On create, its `beforeValidate` hook returns `req.user.id` whatever the input held, and throws when `req.user` is absent. On update, it returns the stored owner (`previousValue`, an id or a populated doc) whatever the input held. Both relation helpers take `(slug, { name, required?, hasMany? })` and return a `relationship` field whose `validate` is fixed (callers cannot pass one). The `validate` first returns Payload's `relationship` validator result from `payload/shared` when it is not `true`, and it returns `true` on `event === 'onChange'` without querying, like Payload's own validator. With no ids it returns `true`. With no `req.user` it rejects without querying. Otherwise it runs `req.payload.count({ collection: slug, where: { id: { in: ids } }, ...asRequestUser(req) })` and rejects with `req.t('validation:invalidSelection')` unless the count equals the number of distinct ids. Because the count carries `req`, it joins the request's transaction. The ids come from numbers, numeric strings and `{ id }` objects. Strict TS, no `any`.

**Never:** No real private collection, no access helper in `src/access` (the first private collection story adds the owner access), no change to `payload.config.ts`, migrations or `payload-types.ts`. No `filterOptions` (Payload's `validateFilterOptions` reads without the user's access). No polymorphic relations. No `overrideAccess: true` anywhere in `src/fields`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Owner from request | user A creates a note, no `owner` in data | note's `owner` is A | No error expected |
| Owner in input | A creates a note with `owner: B` | `owner` is A | Input ignored, no error |
| Owner on update | A updates the note with `owner: B` | `owner` stays A | Input ignored, no error |
| No user | Local API create without `user` (overrideAccess) | nothing created | Throws |
| Own target | A creates a pin with `note` = A's note (single) and `notes` = [A's note] (hasMany) | created | No error expected |
| Foreign target | A creates a pin with `note` = B's note | nothing created | `ValidationError` on `note` |
| Foreign in many | A's pin with `notes` = [A's note, B's note] | nothing created | `ValidationError` on `notes` |
| Readable target | A's pin with `user` = A (`readableRelation('users')`); then `user` = B | first created; second rejected | `ValidationError` on `user` |
| Same transaction | inside `withTransaction`, A creates a note then a pin pointing at it | pin created | No error expected |

</intent-contract>

## Code Map

- `src/fields/isbn.ts:46-72`, `src/fields/nameKey.ts` -- field-helper style to copy: a factory returning a typed field, a hook, a `validate` delegating to Payload's built-in validator from `payload/shared` (`text` there, `relationship` here).
- `src/access/asRequestUser.ts` -- `asRequestUser(req)` gives `{ req, user, overrideAccess: false }`; spread into the count.
- `node_modules/payload/dist/fields/validations.js:569-624` -- the built-in `relationship` validator: required, min/max rows, id shape, then `onChange` → `true`, then `validateFilterOptions`, which is a no-op without `filterOptions`.
- `node_modules/payload/dist/fields/hooks/beforeValidate/promise.js:188-210` -- the args of a field `beforeValidate` hook: `operation`, `previousValue` (the stored doc's value on update), `req`, `value`. A returned non-`undefined` value replaces the input.
- `node_modules/payload/dist/fields/hooks/beforeChange/promise.js:44,98-125` -- `validate` runs only for submitted top-level fields on update, so an unchanged relation is not re-read; it receives `event: 'submit'`.
- `node_modules/payload/dist/index.js:543-560` -- `getPayload({ config, key })` caches instances per `key`, so a second config can run beside the app's.
- `node_modules/@payloadcms/db-postgres/dist/index.js:22` -- the `schemaName` option puts every table and enum in that Postgres schema. Push (`pushDevSchema`) filters to it, so the app's `public` schema is untouched. `migrationSchema.int.spec.ts` diffs `current_schema()` only.
- `src/collections/Users.ts` -- reused as the `users` collection of the throwaway config; create data needs `email`, `password`, `displayName`, `roles`, `language`, `profileVisibility`, `collectionVisibility` (see `tests/helpers/harness.ts:15-31`).
- `src/lib/payload/transaction.ts` -- `withTransaction(ctx, fn)` for the same-transaction row; a `Context` is `{ req, user }` built with `createLocalReq({ user }, payload)`.
- `tests/unit/fields.unit.spec.ts` -- the unit style for field helpers, if a pure helper (the id extraction) gets a unit test.

## Tasks & Acceptance

**Execution:**
- `src/fields/owner.ts` -- new. `ownerField(): RelationshipField` as stated in Always. The hook throws `new Error('ownerField: no req.user on create')`. The doc comment cites AD-1 and says access stays with the collection.
- `src/fields/relation.ts` -- new. `ownedRelation(slug, options)` and `readableRelation(slug, options)` share one private builder. `ownedRelation` is for targets in private collections (owner-scoped read). `readableRelation` is for any other readable target (catalogue Books, `users`). Doc comments cite AD-17 and say the check joins the request's transaction.
- `tests/int/fieldHelpers.int.spec.ts` -- new. A throwaway config built with `buildConfig`: `Users`, plus `field-test-notes` (`title` text, `ownerField()`, read/update/delete access `owner = req.user.id`, create needs a user) and `field-test-pins` (`ownerField()`, `note` single `ownedRelation('field-test-notes')`, `notes` hasMany `ownedRelation`, `user` `readableRelation('users')`, owner access as notes). Use `postgresAdapter({ schemaName: 'field_helpers_test', push: true })` on `process.env.DATABASE_URL`, `getPayload({ config, key: 'field-helpers' })`, `graphQL: { disable: true }`, no `onInit`, and a secret. Users are created locally with unique emails. Requests come from `createLocalReq({ user }, payload)` spread with `asRequestUser`. One test per matrix row. The unknown slugs are cast to `CollectionSlug` in one place with a comment.

**Acceptance Criteria:**
- Given the throwaway collections, when `npm run test:int` runs, then every matrix row passes, and the app's `public` schema and `migrationSchema.int.spec.ts` are unaffected.
- Given a CI-style run with `DATABASE_PUSH=false`, when the int lane runs, then `fieldHelpers.int.spec.ts` still passes, because its own config forces `push: true` on its own schema.
- Given the changed files, when lint and typecheck run, then both are clean.

## Spec Change Log

## Review Triage Log

### 2026-10-12 — Review pass
- verdicts: 17 findings — high 0, medium 3, low 9, false 5, maybe-false 0
- findings:
  - `[low]` `[patch]` blind: the count has no `disableErrors`, so a target collection whose read access returns `false` throws `Forbidden`, and the count's catch kills the request's transaction (`count.js:29-38,80`). No planned collection denies a signed-in user outright, but the fix is one option. Patched: `disableErrors: true`, so that case counts 0 and is rejected as a field error.
  - `[medium]` `[patch]` blind: `owner` is required and read-only in admin with no default. The admin form state validates on `onChange` (`addFieldStatePromise.js:119-162`), and Payload's validator returns `required` before its `onChange` short-circuit, so the admin cannot create a private row (tags are managed there per CLAUDE.md). Patched: `defaultValue: ({ user }) => user?.id`; the hook still overrides it on create.
  - `[medium]` `[patch]` blind: the spec reuses the app's `Users`, so `users.defaultLocation` as `ownedRelation('locations')` (AD-17, story 3.21/3.42) would fail config sanitisation in this spec. Patched: a minimal local `users` auth collection with self-only read.
  - `[medium]` `[patch]` blind: the `field_helpers_test` schema persists between runs, so a change to the throwaway collections makes push stop at a data-loss prompt. Verified during the patch run: replacing `Users` hung `beforeAll` for 60 s on "Accept warnings and push schema to database?". Patched: `beforeAll` drops the schema first through the app instance's pool; an undeclared `pg` import was avoided.
  - `[low]` `[reject]` blind: on update, an `undefined` stored owner lets the input through. `owner` is required from the first migration of every private collection, so no row lacks one; failing closed needs a new branch.
  - `[low]` `[patch]` blind: the doc comments do not say when the check is skipped (unsubmitted fields, drafts without `drafts.validate`). Patched: one sentence on both helpers.
  - `[low]` `[patch]` blind: a write without `req.user` fails with "invalid selection" and nothing says why. Patched: the same doc sentence states that a write without a user is rejected (AD-16: every write path builds a req for a concrete user).
  - `[low]` `[reject]` edge: a float or out-of-range id reaches the count and Postgres raises instead of a field error. Only a crafted request does this, the save fails either way, and the fix is a new guard.
  - `[low]` `[patch]` edge: draft saves skip `validate`, so the check does not run. No collection uses drafts (the spine has none); same root and doc fix as the blind skip-limits finding.
  - `[false]` `[reject]` edge: a system write without `req.user` is rejected even with `overrideAccess`. This is intended (spec Always, AD-16): system writes build a context with an explicit user, and nothing writes private rows without one.
  - `[false]` `[reject]` edge: `overrideAccess: true` with a user still checks readability. AD-17 applies to every write; private collections are written only through the gateway with `overrideAccess: false` (AD-3), so no trusted caller needs the bypass.
  - `[low]` `[patch]` verification-gap (other): `toId`'s numeric-string and `{ id }` branches and `ids === null` cannot be reached. `beforeValidate` unwraps `{ id }` (`beforeValidate/promise.js:127-148`), and the built-in validator rejects non-numbers (`isValidID.js`). Patched: dead branches deleted, doc corrected.
  - `[false]` `[reject]` intent: the API is `(slug, { name, ... })`, not the epic's one-argument `ownedRelation(slug)`. The epic names the helper and its target; every later caller also needs a field name, and Design Notes record why the options form keeps `validate` out of reach.
  - `[low]` `[reject]` intent: `ownedRelation` and `readableRelation` would diverge only if private read access widens to friends (F8, Phase 2+, not built). An owner check now is an abstraction for later.
  - `[low]` `[reject]` intent: tests exercise the Local API only (no update to a foreign target, no admin `onChange`, no no-user branch). Update runs the same `validate` for submitted fields, and the rest restates config; a test-only finding without a named regression is rejected per CLAUDE.md.
  - `[false]` `[reject]` intent: "never changed" holds only for Payload writes. The Drizzle helper is read-only (AD-7), and raw SQL is outside every AD.
  - `[false]` `[reject]` intent: sprint status and commit are missing. Finalisation of this run does both.

## Design Notes

**Why a second Payload instance.** A test collection in `payload.config.ts` would need a migration, generated types and a CI drift exception, none of them throwaway. A keyed instance in its own schema exists only in the test database and only for this spec. If push does not create the schema itself, the test creates it first (`CREATE SCHEMA IF NOT EXISTS` on a plain `pg` pool) before `getPayload`.

**Why options instead of a spread.** `{ name: 'location', ...ownedRelation('locations') }` would let a later key override `validate` and silently drop the check. `ownedRelation('locations', { name: 'location' })` keeps `validate` out of reach. `hasMany` is in the options because `user-books.tags` needs it (epics, tags story).

**Why two names for one check.** Both rules re-read through the user's access (AD-17). The name records which target kind the field expects, so a reviewer can see when a private-to-private relation was built with `readableRelation` by mistake.

```ts
const owner: FieldHook = ({ operation, previousValue, req }) => {
  if (operation === 'create') {
    if (!req.user) throw new Error('ownerField: no req.user on create')
    return req.user.id
  }
  return previousValue
}
```

## Verification

**Commands:**
- `npm run test:int` -- expected: all pass, including `fieldHelpers.int.spec.ts`
- `npm run test:unit` -- expected: all pass
- `npm run lint` -- expected: no errors
- `npm run typecheck` -- expected: no errors

## Auto Run Result

**Summary.** Added the AD-1 and AD-17 field helpers to `src/fields`.
- `ownerField()` is `owner`, a required relationship to `users`. A `beforeValidate` hook sets it from `req.user` on create and keeps the stored value on update, whatever the input holds. A create without a user throws. A default of the signed-in user lets the Payload admin form create private rows.
- `ownedRelation(slug, { name, required?, hasMany? })` and `readableRelation(...)` build a relationship field with a fixed `validate`. It runs Payload's own relationship check first. It then counts the targets through `asRequestUser(req)` with `disableErrors`, and rejects with `validation:invalidSelection` unless every distinct id is readable. The count carries `req`, so it joins the request's transaction.
- A throwaway config proves both helpers on a second, keyed Payload instance in Postgres schema `field_helpers_test`. The config holds a minimal `users` auth collection, `field-test-notes` and `field-test-pins`. The schema is dropped and pushed fresh on each run.

**Files changed.**
- `src/fields/owner.ts`: new. Contains `ownerField()` and its owner hook.
- `src/fields/relation.ts`: new. Contains `ownedRelation`, `readableRelation` and the shared readability `validate`.
- `tests/int/fieldHelpers.int.spec.ts`: new. Builds the throwaway config and has 9 tests, one per matrix row.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: story 3.11 set to `done`.

**Review findings.** 17 findings: medium 3, low 9, false 5. Each has its own row in the Review Triage Log.
- **Patched (8):**
  - Medium: the admin form could not create a private row; `owner` now has a default.
  - Medium: the spec reused the app's `Users`; it now has its own minimal auth collection.
  - Medium: a leftover schema made push hang on a data-loss prompt; `beforeAll` now drops it first.
  - Low: the count now passes `disableErrors`, so a `Forbidden` no longer kills the request's transaction.
  - Low (3): the doc comments now state when the check is skipped and that a write without a user is rejected.
  - Low: the unreachable id branches are deleted.
- **Deferred:** none.
- **Rejected:**
  - Float or out-of-range ids: only crafted input sends them, and the fix needs a guard.
  - A stored owner that is missing on update: it cannot happen with a required column.
  - System writes without a user, and `overrideAccess` still being checked: both are intended (AD-16, AD-3).
  - The options signature instead of one argument: Design Notes give the reason.
  - "Owned" and "readable" diverging: this happens only with friends in Phase 2+.
  - Test-only coverage asks: no regression is named.
  - Owner writes outside Payload: the Drizzle helper is read-only (AD-7).
  - Sprint status and commit: finalisation does both.

**Follow-up review recommendation:** true. Patched: high 0, medium 3, low 5. The named unverified risk is the `owner` `defaultValue` fix for the Payload admin. No test or reviewer has opened the admin create form for a private collection, because none exists yet. The first private collection story (3.19 `user-books` or 3.21 `locations`) should create a row from the admin once.

**Verification.**
- `npm run test:int`: 124 tests pass, 1 skipped as before. `fieldHelpers.int.spec.ts` passes 9 of 9, also on a second run in a row.
- `DATABASE_PUSH=false npm run test:int -- fieldHelpers migrationSchema`: 10 tests pass. This matches the CI-style run, and the `public` schema shows no drift.
- `npm run test:unit`: 471 tests pass.
- `npm run lint`: 0 errors. The 8 warnings are in old migrations.
- `npm run typecheck`: clean.
- Prettier: clean.
- Matrix audit: every row has a test that passes.
- During implementation, two deliberate breaks were made: ignoring the count's result, and dropping `req` from the count. Each failed the matching tests.

**Residual risks.**
- The check runs in `validate`, so a draft save without `drafts.validate` skips it. No collection uses drafts.
- A float or out-of-range id from a crafted request gives a database error, not a field error.
- The spec now loads the app's Payload instance only to drop its own schema, which adds about a second to its setup.
