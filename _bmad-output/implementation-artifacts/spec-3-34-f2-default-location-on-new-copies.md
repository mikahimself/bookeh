---
title: 'Story 3.34: [F2] Default location on new copies'
type: 'feature'
created: '2026-10-20'
baseline_revision: '4e883957b89fd48e7253e0cdaf536b11a0aa71b1'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '_bmad-output/implementation-artifacts/epic-3-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** `createCopy()` (3.33) writes every new copy with no location. FR-4/FR-31 and AD-18 say a new owned copy lands at the profile's default location unless the caller says otherwise. AD-18 also makes `lib/copies` the owner of locations: an input that picks a location or creates one inline is a `Ref`.

**Approach:** Add the spine's `Ref` type to `lib/payload`, a location resolver in `lib/copies` that matches a name by `nameKey` among the user's own locations and creates it when missing, and a `location?: Ref | null` input on owned copies in `createCopy`. Resolving the location and inserting the copy share one transaction, so an inline-created location never outlives a failed insert.

## Boundaries & Constraints

**Always:**
- `src/lib/payload/ref.ts` exports `type Ref = number | { create: string }` with a one-line comment citing the spine (an existing row, or a name to create).
- `NewCopy` becomes a union: `{ bookId: number; status: 'owned'; location?: Ref | null } | { bookId: number; status: 'ordered' }`. An ordered copy cannot carry a location at the type level and is always written with none.
- Owned copy, `location` undefined: the context user's `defaultLocation` (read from `ctx.user`; a populated object yields its `id`), or none when the user has no default. `null`: none, even when a default is set. A number: that id, unchecked by the service; the collection's `ownedRelation` rejects another user's or a missing location with `ValidationError` on `location`. `{ create }`: resolved by `resolveLocation`.
- `src/lib/copies/locations.ts` exports `resolveLocation(ctx: Context, ref: Ref): Promise<number>`. A number is returned as is. A `{ create: name }` is normalised with `normaliseName` (NFC, trimmed, whitespace collapsed); blank after that throws `DomainError('VALIDATION', { fields: { location: 'VALIDATION' } })` before any read. Otherwise it finds the user's location whose `nameKey` equals `toNameKey(name)` through `gateway.find` (owner access scopes it to the user, admin included) and returns its id, or creates one through `gateway.create` with the normalised name and returns the new id. Its doc comment says it runs in the caller's transaction and that a row created this way stays after Undo (spine, Ref).
- `createCopy` wraps the location resolution and the insert in `withTransaction(ctx, …)`, so it joins the caller's transaction or opens its own. It still resolves to the new copy's id. Its doc comment drops the "not applied yet" sentence and states the location rule.
- A lost race between two inline creates of one name surfaces as the unique index's `ValidationError`, unchanged.

**Never:**
- No hook sets a default location (AD-18: "no hook sets a default").
- No change to the `copies`, `locations` or `users` collections, the gateway, or any migration.
- No reading the profile through `lib/account` (lint zone forbids it; `ctx.user` already carries the field).
- No rename, merge, delete or list of locations, no move/receive/status functions, no Settings UI (3.42), no `saveCopy` (3.35).
- No change to the return type of `createCopy`; 3.35 decides what `SaveResult.savedTo` needs.
- No accent folding or fuzzy matching of location names.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Default | User with `defaultLocation` L; owned, `location` omitted | Copy at L | No error expected |
| No default | User without a default; owned, `location` omitted | Copy with no location | No error expected |
| Explicit none | User with default L; owned, `location: null` | Copy with no location | No error expected |
| Ordered | User with default L; `status: 'ordered'` | Copy with no location | No error expected |
| Inline create | Owned, `location: { create: '  Mökki ' }`, no such location | New location named `Mökki` owned by the user; copy at it | No error expected |
| Case-differing name | User has `Mökki`; owned, `{ create: 'MÖKKI' }` | Copy at the existing `Mökki`; the user's location count is unchanged | No error expected |
| Blank name | Owned, `{ create: '   ' }` | Rejects; no copy and no location written | `DomainError` `VALIDATION`, `fields.location` |
| Rollback | Owned, `{ create: '<unique name>' }`, a Book the user cannot read | Rejects on `book`; no location with that name remains | `ValidationError`, paths `['book']`; transaction rolled back |

</intent-contract>

## Code Map

- `src/lib/copies/createCopy.ts`: the service to extend. Currently a single `gateway.create` with no transaction; 3.33's Design Notes anticipated this story wrapping resolution and insert together.
- `src/collections/Copies.ts`: read-only. `ownedRelation('locations', { name: 'location' })` rejects a foreign location; `noLocationWhenOrdered` throws `ValidationError` on `location` if an ordered copy gets one.
- `src/collections/Locations.ts`: read-only. `ownerAccess`, `ownerField()`, `nameKeyField()` (key derived by hook; the create type still requires `nameKey`, pass `''` as `findOrCreateByName` does), unique index on `(owner, nameKey)`. The collection stores `name` as given, so the service normalises first.
- `src/collections/Users.ts:48-56`: `defaultLocation`, an `ownedRelation` to `locations`, self-only field access. Generated type `number | UserLocation | null | undefined` on `User`.
- `src/fields/nameKey.ts`: `toNameKey`. `src/fields/sortName.ts:4`: `normaliseName`.
- `src/lib/catalogue/findOrCreateByName.ts`: the precedent for match-by-`nameKey`-then-create and the blank-name `DomainError('VALIDATION', …)`. It uses system privileges because catalogue rows are shared; locations are private, so use the gateway instead.
- `src/lib/payload/gateway.ts`: `find` (line 39) and `create` (line 60), forcing the context's user and `overrideAccess: false`.
- `src/lib/payload/transaction.ts:46`: `withTransaction` joins a context that carries a transaction, otherwise opens one on a fresh `req` with `ctx.user`.
- `src/lib/errors.ts`: `DomainError`; `ValidationError` maps to `VALIDATION` with `fields`.
- `eslint.config.mjs:27`: zone `copies: ['payload', 'undo']`; `lib/copies` may import `lib/payload` and `fields`, not `lib/account`.
- `tests/int/createCopy.int.spec.ts`: existing 5 tests use user A with no default; `expectCopy` asserts `location` null, which stays true for them. Add the new rows with users of their own so A stays default-free.
- `tests/helpers/harness.ts`: `contextFor(user)` uses the given user object as `ctx.user`, so a test that sets a default must build the context from the updated user (or create the user with `defaultLocation` after creating the location as that user).
- `tests/int/locations.int.spec.ts`: the collection test already covers a foreign location id on `copies.location`; not repeated here.

## Tasks & Acceptance

**Execution:**
- `src/lib/payload/ref.ts` -- new: `Ref` type -- the spine places it in `lib/payload` for every owning service.
- `src/lib/copies/locations.ts` -- new: `resolveLocation` as in Always -- AD-18 puts location matching in `lib/copies`.
- `src/lib/copies/createCopy.ts` -- `NewCopy` union, default/none/Ref resolution, `withTransaction` around resolve + insert, updated doc comment -- FR-4/FR-31.
- `tests/int/createCopy.int.spec.ts` -- one test per new matrix row; update the header comment to mention the location rule -- integration tests named in the epic's AC.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- set `3-34-f2-default-location-on-new-copies` to its final status.

**Acceptance Criteria:**
- Given `npx eslint src tests`, `npx tsc --noEmit`, `npm run test:unit` and `npm run test:int`, when they run, then all pass with 0 lint errors.
- Given `grep -rn "collection: 'locations'" src/lib`, when it runs, then the only create on `locations` is in `src/lib/copies/locations.ts`.

## Spec Change Log

## Review Triage Log

### 2026-10-20 — Review pass
- verdicts: 15 findings — high 0, medium 0, low 8, false 7, maybe-false 0
- findings:
  - `[false]` `[reject]` blind: sprint status `done` while the spec is `in-review` and untracked. Finalize sets the spec to `done` and commits both together; the spec is left out of the reviewed diff because it is the edge layer's claims file.
  - `[false]` `[reject]` blind: the default-location tests take the populated-object branch, not the production path. Disproved: `Users.auth` sets no `depth`, so Payload's JWT strategy (`node_modules/payload/dist/auth/strategies/jwt.js:42`) reads the user at `defaultDepth` 2, and the verification layer's probe confirmed `payload.auth()` returns `defaultLocation` populated. Production takes the same `.id` branch the tests do.
  - `[low]` `[patch]` blind: no test passes a numeric `location` to `createCopy`. Same root cause as the verification-gap row below; patched there.
  - `[low]` `[reject]` blind: inline-create failures other than blank (a name over 200 characters, the unique-index race) surface on `name`/`nameKey`, not `location`. Real, but a 200-character location name is not met in everyday use, the race is accepted in Always, and the fix adds a guard branch plus an error translation.
  - `[false]` `[reject]` blind: `resolveLocation`'s find relies on access to scope by owner. The gateway always forces `overrideAccess: false` and the context user (`gateway.ts:39`), and `ownerAccess` binds every role, admin included; no path returns another user's row.
  - `[false]` `[reject]` blind: the rollback test could pass vacuously if the order changed. The bad outcome it guards (a leftover location) cannot occur under either order; today `resolveLocation` runs before the copy insert, so the test does exercise a rollback.
  - `[low]` `[reject]` blind: every `createCopy` now opens a transaction, even when nothing is created inline. Real cost of one BEGIN/COMMIT and a fresh `req` outside a caller transaction; negligible, required by the spec's Always, and 3.35's `saveCopy` joins its own transaction anyway.
  - `[low]` `[reject]` edge: a `{ create }` name over 200 characters rejects on `name`, not `location`. Same as the blind row above; same disposition.
  - `[low]` `[patch]` verification-gap: an explicit own location id is untested through `createCopy`; a regression that routed only `{ create }` refs to `resolveLocation` would fall back to the default silently. Patched: one test, a user with a default and a second location, copy created with `location: second.id`, stored location asserted to be `second.id`.
  - `[low]` `[reject]` verification-gap (other): the Design Note says auth loads the user at depth 0; it is depth 2. Real, but the fix is an edit to this build's spec. The code handles both shapes; recorded under Auto Run Result.
  - `[false]` `[reject]` intent: reading B (a scanned book actually landing at the default) is not delivered. The epic's 3.34 AC is service-level; `saveCopy` (3.35) and Settings (3.42) deliver the flow.
  - `[false]` `[reject]` intent: no test shows a real authenticated `ctx.user` carries `defaultLocation`. The verification layer's probe of `payload.auth()` returned it populated; the field's `read: self` access lets the user read their own.
  - `[low]` `[patch]` intent: the id branch of `Ref` is untested. Same root cause as the verification-gap row; patched there.
  - `[low]` `[reject]` intent: joining a caller's transaction with an inline create is not exercised. `withTransaction`'s join is tested in `transaction.int.spec.ts` and 3.33's rollback test; a further test asks only for coverage, with no defect named.
  - `[false]` `[reject]` intent: sprint-status bookkeeping ahead of the spec. Same as the first blind row.

## Design Notes

**Why `ctx.user.defaultLocation` and not a fresh read.** Payload loads the user row on every request (auth depth 0, so the field is an id), and `withTransaction` carries the same `user`. A fresh read would go through `users`, whose profile belongs to `lib/account`, which `lib/copies` may not import. Within one request the value cannot go stale in a way that matters: a default deleted mid-request fails the insert on `location`, not silently.

**Why a union and not a runtime check for ordered.** AD-8 says an ordered copy has no location. Making it unrepresentable keeps one rule in the type and leaves the collection hook as the backstop for other writers.

**Why the id is not checked in `resolveLocation`.** `ownedRelation` on `copies.location` already re-reads the target as the request user and rejects with the right path; a second check would duplicate it.

## Verification

**Commands:**
- `npx eslint src tests` -- expected: 0 errors.
- `npx tsc --noEmit` -- expected: clean.
- `npm run test:unit` -- expected: all pass (unchanged).
- `npm run test:int` -- expected: all pass, the new `createCopy` rows included. Needs the worktree's Postgres on `localhost:5434` through `.env`.

## Auto Run Result

**Summary.** New owned copies now land at the profile's default location.
- `createCopy(ctx, input)` takes `location?: Ref | null` on owned copies:
  - omitted: the user's `defaultLocation`, or none without one
  - `null`: none
  - an id: that location
  - `{ create }`: matched by `nameKey` among the user's locations, or created
- An ordered copy cannot carry a location: `NewCopy` is an owned/ordered union.
- Resolving the location and inserting the copy run in one `withTransaction`, so a location created inline is rolled back with a failed insert.

**Files changed.**
- `src/lib/payload/ref.ts`: new. The spine's `Ref` type.
- `src/lib/copies/locations.ts`: new. `resolveLocation(ctx, ref)`.
- `src/lib/copies/createCopy.ts`: the `NewCopy` union, the location rule, the transaction and the doc comment.
- `tests/int/createCopy.int.spec.ts`: header comment, plus 9 new tests (one per matrix row, and an explicit id over the default).
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: 3.34 is done.

**Review.** 15 findings: low 8, false 7. The edge-case layer found 1, the verification-gap layer 1 gap and 1 other.

Patched 1 entry (low, 3 rows): no test passed an explicit location id through `createCopy`. Added one, with the id overriding a set default.

Deferred: none.

Rejected:
- Inline-create errors other than blank land on `name`/`nameKey` (2 rows). A name over 200 characters is not met in everyday use, and the race is accepted in Always.
- A transaction on every call. A negligible cost, required by the spec.
- No test of joining a caller's transaction with an inline create. Only a coverage ask; the join is tested elsewhere.
- The Design Note's auth-depth claim. Its fix is a spec edit; see the correction below.
- False (7 rows):
  - Sprint status ahead of the spec (2 rows). Finalize sets both.
  - The default tests miss the production branch. Auth reads at depth 2, so production takes the same branch.
  - Access-only owner scoping. The gateway forces access.
  - A vacuous rollback test.
  - Reading B (the end-to-end save) is not delivered. 3.35 and 3.42 deliver it.
  - No test that a real `ctx.user` carries the default. Probed: it does, populated.

**Correction to Design Notes.** Payload's JWT strategy reads the user at `collection.config.auth.depth`, which `Users` leaves unset, so the user is read at `defaultDepth` 2, not 0. In a real request `ctx.user.defaultLocation` is a populated `UserLocation`, with its `owner` populated as well. `createCopy` handles both an id and an object. The extra population on every authenticated request is pre-existing and not caused by this story.

**Follow-up review:** not recommended. Patched entries: high 0, medium 0, low 1.

**Verification.** Run in worktree `story-3-34-default-location`, Postgres on `localhost:5434`, after the patch:
- `npx tsc --noEmit`: clean.
- `npx eslint src tests`: 0 errors (36 pre-existing warnings in `src/migrations`).
- `npm run test:unit`: 521 passed.
- `npm run test:int`: 34 files passed, 1 skipped (`migrationSchema`); 288 tests passed. `createCopy` passed 14/14.
- Matrix audit: every row has a passing test.
- Playwright not run (service story).

**Residual risks.**
- `tests/unit/scanScreen.unit.spec.ts` ("pushes the Answer address on an ISBN barcode…") failed in 2 of 5 unit runs during this build and passed in the others. It is untouched by this diff. It looks timing-sensitive under load from parallel worktrees.
- The verification layer's probe left one user and two locations in this worktree's `bookeh_test`. They are harmless: tests create their own rows.
- Still no caller of `createCopy` in `src`. 3.35 `saveCopy` is the first.
