---
title: '6.3 [J7] People service'
type: 'feature'
created: '2026-10-26'
baseline_revision: 'ba21f8708486cb59bf98b9f96cedcdb8d793a6ff'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** People exist as a collection (6.1) and loans point at them (6.2), but nothing owns the People rules: a Person `Ref` from a picker cannot be resolved, a rename can collide, a merge would orphan loans, and deleting a Person with a loan fails on the `loans.person_id` NOT NULL foreign key (FR-34, AD-18).

**Approach:** Add `lib/people` as the one matcher and writer of `people`, on the pattern of the location functions in `lib/copies/locations.ts`: `resolvePerson` (Ref), `createPerson` ("Add person"), `renamePerson`, `mergePerson`, `deletePerson` and `personUse`. Add the `PERSON_IN_USE` error code with en/fi messages, record it and the `PersonUse` shape in the spine, and cover each rule with an integration test.

## Boundaries & Constraints

**Always:**
- `lib/people` imports no other service (spine, Module boundaries): only `@/lib/payload/*`, `@/lib/errors`, `@/fields/*`, `@/payload-types`. Writes to `loans` (merge) go through the gateway (AD-18, "a merge or delete updates referencing rows of other collections through the gateway").
- Every read and write filters on `owner = ctx.user.id` explicitly as well as through `ownerAccess`, so the admin is held to their own People (FR-48), as `assertOwnLocations` does.
- Typed names go through `normaliseName()` (NFC, trimmed, whitespace collapsed). Blank after normalising fails `VALIDATION`; longer than `limits.name` after normalising fails `VALIDATION` with that field marked `TOO_LONG`, never clipped (spine, Text input). Both before any read. The field key is `person` for a `Ref` (the picker's field) and `name` for create and rename.
- `createPerson`, `renamePerson`, `mergePerson` and `deletePerson` run in the caller's transaction or one of their own (`withTransaction`, AD-16). `resolvePerson` opens none: it runs on the caller's context, joining the action's transaction (AD-18 Ref rule); a Person it creates stays after Undo because nothing records it.
- Ids are checked with `isRowId()` before any read. Ownership is checked with `gateway.count`, not `findByID` (a `NotFound` would end the transaction).
- `NAME_TAKEN` carries the colliding Person's id as `conflictId`. A case-only rename of a Person keeps its own key and succeeds.
- A Person with any loan, open or returned, cannot be deleted: `PERSON_IN_USE`, nothing written.
- No Undo on create, rename, merge or delete (epic context: removals, deletes and merges are confirmed and have no Undo).

**Never:**
- No screens, server actions, Settings group or lend picker (6.7, 6.13); no `lib/loans` (6.5); no `listPeople` beyond what `personUse` returns.
- No wishlist entries in `PERSON_IN_USE`, `mergePerson` or `personUse` (Epic 7, Story 7.4).
- No accent folding or fuzzy matching: `nameKey` equality only (Names convention).
- No change to the `people` or `loans` collections, their migrations or `payload-types.ts`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Ref id, own | `resolvePerson(ctx, p.id)`, `p` is A's | `p.id` | — |
| Ref id, not own | B's Person id, a deleted id, `0` (as A and as the admin) | Nothing written | `VALIDATION`, `fields: { person: 'VALIDATION' }` |
| Ref name matches | A has "Antti"; `{ create: '  ANTTI ' }` | Existing id; no new row | — |
| Ref name new | `{ create: 'Liisa  K' }` | New Person "Liisa K", owner A | — |
| Ref name blank / long | `{ create: '   ' }` / 201 chars | Nothing written | `VALIDATION`, `person: 'VALIDATION'` / `person: 'TOO_LONG'` |
| Add person | `createPerson(ctx, 'Liisa')`, none named so | New id | — |
| Add person, taken | A has "Liisa"; `createPerson(ctx, 'liisa')` | Nothing written | `NAME_TAKEN`, `conflictId` = existing id |
| Rename | "Antti" → `'  Antti   K '`; "liisa" → `'Liisa'` | Stored "Antti K" / "Liisa", `nameKey` recomputed | — |
| Rename onto taken | "Antti" → `'LIISA'` while "Liisa" exists | Unchanged | `NAME_TAKEN`, `conflictId` = Liisa's id |
| Rename / merge / delete foreign | B's id, a deleted id, `0`, as A and as the admin | Nothing written | `NOT_FOUND` |
| Merge | Source has an open and a returned loan; target has one loan | Every source loan now on target; source deleted; other loans untouched | — |
| Merge into itself | `mergePerson(ctx, p.id, p.id)` | Nothing written | `VALIDATION` |
| Merge rolled back | Merge inside a caller's `withTransaction` that then throws | Source and its loans unchanged | Caller's error rethrown |
| Delete unused | Person without loans | Deleted | — |
| Delete in use | Person with only a returned loan; another with an open loan | Both kept | `PERSON_IN_USE` |
| Use counts | A: "Antti" 2 loans (1 returned), "Liisa" 0; B has loans too | `[{ id, name: 'Antti', loans: 2 }, { id, name: 'Liisa', loans: 0 }]`, by name; none of B's | — |

</intent-contract>

## Code Map

- `src/lib/copies/locations.ts` -- the template: `resolveLocation` (Ref; blank → field error before any read; `gateway.find` by `nameKey`, else `gateway.create` with `nameKey: ''`), `createLocation` / `renameLocation` (`NAME_TAKEN` + `conflictId`, rename excludes its own id), `assertOwnLocations` (`gateway.count` with `id in` + `owner`), `mergeLocation` (self → `VALIDATION`, repoint one by one, then `deleteByID`), `deleteLocation`. Read-only.
- `src/collections/People.ts` -- `name` (`maxLength: limits.name`), `nameKeyField()`, unique `(owner, nameKey)`; doc comment already names `lib/people` as its only writer. Read-only.
- `src/collections/Loans.ts` -- `person` is `ownedRelation('people', …)`, required; updating a loan's `person` re-runs that validation, the noon date hook and `returnedNotBeforeLent`, all idempotent on stored values. Read-only.
- `src/fields/nameKey.ts` -- `toNameKey()`. `src/fields/sortName.ts` -- `normaliseName()`. `src/fields/limits.ts` -- `limits.name` (200).
- `src/lib/payload/ref.ts` -- `Ref`, `isRowId`, `idOf`. `src/lib/payload/gateway.ts` -- `find`, `count`, `create`, `updateByID`, `deleteByID`. `src/lib/payload/transaction.ts` -- `withTransaction`.
- `src/lib/errors.ts:4-23` -- `ErrorCode` union; add `PERSON_IN_USE` after `NAME_TAKEN`.
- `src/app/(frontend)/components/toast/flashCookie.ts:17-36` and `tests/unit/messages.unit.spec.ts:55-73` -- exhaustive `satisfies Record<ErrorCode, true>` lists; typecheck fails until `PERSON_IN_USE` is added to both.
- `messages/en.json:304`, `messages/fi.json:304` -- `errors.*`; add `PERSON_IN_USE` after `NAME_TAKEN`.
- `_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md:258` (AD-18 delete bullet), `:260` (use counts), `:508-511` (Shared shapes, after `Suggestion`), `:588` (file tree `people/`).
- `tests/int/renameMergeLocation.int.spec.ts` -- test shape to follow: per-test `createUser`, `failure()` helper, `stored()` system read, the foreign-and-bad-id loop for a viewer and the admin, the rollback test.
- `tests/int/loans.int.spec.ts:20-60` -- `copyAs`, `personAs`, `loanAs` helpers and the shared `books` row via `overrideAccess`; loans need a copy and a Person of the same user.
- `tests/helpers/harness.ts` -- `createUser`, `contextFor`.

## Tasks & Acceptance

**Execution:**
- `src/lib/people/people.ts` -- new. Exports `resolvePerson(ctx, ref: Ref): Promise<number>`, `createPerson(ctx, name): Promise<number>`, `renamePerson(ctx, id, name): Promise<void>`, `mergePerson(ctx, sourceId, targetId): Promise<void>`, `deletePerson(ctx, id): Promise<void>`, `personUse(ctx): Promise<PersonUse[]>` and `type PersonUse = Named & { loans: number }` (`Named` = `{ id: number; name: string }`, declared locally as in the spine). Private helpers: `normalisedName(name, field)` (blank / `TOO_LONG` checks), `takenBy(tx, key, exceptId?)` (the `NAME_TAKEN` lookup), `assertOwnPeople(tx, ids)` (count → `NOT_FOUND`). `resolvePerson` checks an id with the same count but fails `VALIDATION` on `person`. `deletePerson` counts the Person's loans (`person` + `owner`) and throws `PERSON_IN_USE` when any. `mergePerson` reads the source's loans (`select: { person: true }`), updates each to the target one after the other, then deletes the source. `personUse` reads the owner's People sorted by `name` and their loans (`select: { person: true }`, `pagination: false`) and counts per Person, zero included. Doc comments in the `locations.ts` style (Spine AD-18, FR-34; Epic 7 adds entries).
- `src/lib/errors.ts`, `src/app/(frontend)/components/toast/flashCookie.ts`, `tests/unit/messages.unit.spec.ts` -- add `PERSON_IN_USE`.
- `messages/en.json`, `messages/fi.json` -- `errors.PERSON_IN_USE`: en "In use, so this person can't be deleted.", fi "Henkilöä ei voi poistaa, koska hän on käytössä."
- `ARCHITECTURE-SPINE.md` -- AD-18 delete bullet: "…cannot be deleted (`PERSON_IN_USE`)"; use-count bullet: "…from `personUse()` in `lib/people`"; Shared shapes: `// src/lib/people` with `type PersonUse = Named & { loans: number } // personUse(ctx): every Person of the viewer by name; Epic 7 adds entries`; file tree: `people/  # resolvePerson, createPerson, rename, merge, delete, personUse`.
- `tests/int/peopleService.int.spec.ts` -- new; one test per matrix row group: Ref (own id, foreign/bad ids as A and the admin, name match, name create, blank and long); add person and taken; rename normalised and case-only, rename onto taken; foreign/bad ids for rename, merge and delete as A and the admin; merge moves open and returned loans and deletes the source; merge into itself; merge rolled back; delete unused and in use (returned only, open); `personUse` counts and ordering, no foreign rows.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `6-3-j7-people-service: done` when the story is done.

**Acceptance Criteria:**
- Given a Person `Ref`, when `resolvePerson` resolves it, then an id is accepted only when it is one of the context user's People, and a name matches one of theirs by `nameKey` or creates it.
- Given two People of one user, when one is renamed onto the other's name in any case, then it fails with `NAME_TAKEN` and the other's id as `conflictId`, while a rename that changes only its own case succeeds.
- Given a source and a target Person, when `mergePerson` runs, then every loan of the source points at the target and the source is gone, all in one transaction that rolls back with the caller's.
- Given a Person with any loan, open or returned, when `deletePerson` runs, then it fails with `PERSON_IN_USE` and nothing changes; without loans the Person is deleted.
- Given `personUse(ctx)`, when it runs, then it lists each of the user's People by name with their count of loans, open and returned, and never another user's.
- Given the error catalogue, when `messages.unit.spec.ts` runs, then `errors.PERSON_IN_USE` exists in en and fi; and ARCHITECTURE-SPINE.md names `PERSON_IN_USE` and `PersonUse`.

## Spec Change Log

## Review Triage Log

### 2026-10-26 — Review pass
- verdicts: 22 findings — high 0, medium 0, low 16, false 6, maybe-false 0
- findings:
  - `[low]` `[patch]` Verification gap: `createPerson` / `renamePerson` blank and over-long names on `name` untested (spine Text input) — added blank → `VALIDATION` and 201 chars → `TOO_LONG` on `name` to the add and rename tests, each asserting nothing was written.
  - `[low]` `[patch]` Edge: `deletePerson` race, a loan committed after the count makes the delete fail on NOT NULL `loans.person_id` as `INTERNAL` — grouped with the race-documentation rows; the doc comment now says so. A lock is not worth it for one user lending from one phone.
  - `[low]` `[patch]` Edge: `mergePerson` race, a loan created after `loansOf` fails the source delete — same group; documented in the doc comment.
  - `[low]` `[patch]` Edge: a lost create/rename race surfaces as the unique index's `ValidationError`, not `NAME_TAKEN` — same group; `createPerson` / `renamePerson` now carry the sentence `locations.ts` carries.
  - `[false]` `[reject]` Edge: a `Ref` that is neither a number nor `{ create: string }` throws a `TypeError` — no caller exists; the typed `Ref` is the contract, and actions validate input at the boundary (6.5), as for `resolveLocation`.
  - `[low]` `[reject]` Edge: `personUse` reads People and loans in two queries, so a concurrent merge can undercount for one render — a momentary count on a Settings list; a snapshot or `GROUP BY` adds machinery for a case nobody meets.
  - `[low]` `[patch]` Blind: Finnish `PERSON_IN_USE` ("hän on käytössä") reads unnaturally — grouped with the English row; fi is now "Henkilöä ei voi poistaa, koska hänellä on lainoja."
  - `[low]` `[patch]` Blind: English `PERSON_IN_USE` is awkward and does not say why — en is now "This person has loans, so they can't be deleted."
  - `[low]` `[patch]` Blind: race behaviour of delete and merge is undocumented — same group as the edge race rows; documented.
  - `[low]` `[patch]` Blind: `Loans.ts` doc comment says `lib/loans` is the only writer, but `mergePerson` repoints `person` — comment reworded to name the People merge and copy removal (AD-18); comment only, no schema change.
  - `[low]` `[patch]` Blind: no test that name matching stays among the viewer's own People (AD-1, FR-48) — new test: with only B holding the names, `resolvePerson` and `createPerson` as A and as the admin create their own rows and leave B's untouched.
  - `[low]` `[patch]` Blind: no `name` validation test for create and rename — same as the verification-gap row; patched there.
  - `[low]` `[patch]` Blind: `personUse` not tested as the admin — the use-count test now asserts the admin gets only their own Person with 0 loans.
  - `[false]` `[reject]` Blind: `sprint-status.yaml` says done while the spec is in review — finalization sets the spec to `done` in the same commit.
  - `[low]` `[reject]` Blind: `Named` declared again in `lib/people` — `lib/people` may not import `lib/books`; both are the spine's one structural `{ id; name }`, so they cannot disagree at a call site, and moving it to a shared module adds a file for a two-field type.
  - `[low]` `[reject]` Blind: `deletePerson` repeats the loans filter of `loansOf` — two lines; Story 7.4 edits delete and merge together anyway.
  - `[low]` `[reject]` Intent: `resolvePerson` is not tested inside a caller's transaction — it opens none and runs on the given context by construction; 6.5's acceptance tests the inline-created Person inside lend and Undo.
  - `[false]` `[reject]` Intent: merge atomicity on an internal failure is not exercised — the rollback test drives the same `withTransaction` path; any throw inside rolls back the same way.
  - `[low]` `[patch]` Intent: `personUse` admin case untested — same as the blind admin row; patched there.
  - `[false]` `[reject]` Intent: `PERSON_IN_USE` wording is not exercised on a screen — no screen shows it until 6.13; the catalogue test checks both languages.
  - `[false]` `[reject]` Intent: the concurrent-create race is untested — documented behaviour of the unique index, the same as locations; not an acceptance criterion.
  - `[false]` `[reject]` Intent: bookkeeping (spec `in-review`, uncommitted, spec not in the patch) — finalization commits the spec and code together; the spec is the claims file and is kept out of the reviewed diff on purpose.

## Design Notes

**Why an id `Ref` fails on `person`, not `NOT_FOUND`.** The Ref comes from the lend picker's Person field; a Person deleted in another tab is a field error the picker can show, the same answer `ownedRelation` gives on the loan. Rename, merge and delete act on a Person the screen lists, so a gone one is `NOT_FOUND`, as for locations.

**Why `personUse` returns the list.** Settings (6.13) shows every Person with "2 loans"; one call with names and counts serves it, and Epic 7 adds `entries` to the same shape. Counting in memory over one user's loans (`select: { person: true }`) is two small queries; a Drizzle `GROUP BY` is not worth the module.

## Verification

**Commands:**
- `npm run typecheck` -- expected: clean.
- `npm run lint` -- expected: 0 errors.
- `npm run test:unit` -- expected: all pass, including `messages.unit.spec.ts`.
- `npm run test:reset && npm run test:int` -- expected: all pass, including `peopleService.int.spec.ts`.

## Auto Run Result

**Summary.** `lib/people` is now the one matcher and writer of People. `resolvePerson` resolves a `Ref`: an id must be one of the viewer's People, otherwise `VALIDATION` on `person`; a name matches by `nameKey` or creates the Person. `createPerson` ("Add person") and `renamePerson` fail `NAME_TAKEN` with `conflictId`, and a case-only rename is allowed. `mergePerson` repoints every loan, open or returned, then deletes the source in one transaction. `deletePerson` fails `PERSON_IN_USE` when the Person has any loan. `personUse` lists the viewer's People by name with their loan counts, zero included. Every call is held to the viewer's own rows, the admin included. Typed names are normalised; blank → `VALIDATION`, over `limits.name` → `TOO_LONG`. The new error code `PERSON_IN_USE` has en/fi messages, and the spine records it together with `PersonUse`.

**Files changed.**
- `src/lib/people/people.ts` -- new service: resolve, create, rename, merge, delete, `personUse`, `PersonUse`.
- `src/lib/errors.ts`, `src/app/(frontend)/components/toast/flashCookie.ts`, `tests/unit/messages.unit.spec.ts` -- `PERSON_IN_USE` in the union and both exhaustive lists.
- `messages/en.json`, `messages/fi.json` -- `errors.PERSON_IN_USE`.
- `src/collections/Loans.ts` -- doc comment only: names the People merge and copy removal as the other writers of loans (AD-18).
- `ARCHITECTURE-SPINE.md` -- AD-18 names `PERSON_IN_USE` and `personUse()`; Shared shapes gains `PersonUse`; file tree updated.
- `tests/int/peopleService.int.spec.ts` -- new: 12 tests covering every matrix row, with foreign and bad ids tried as the user and as the admin.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 6.3 done.

**Review.** One pass, 22 findings (low 16, false 6). Six patch groups, all low, were applied:
- `name` validation tests for create and rename.
- A test that names match only among the viewer's own People, as the user and as the admin.
- An admin case for `personUse`.
- Clearer en/fi `PERSON_IN_USE` messages.
- Doc comments that state the lost-race behaviour of create, rename, merge and delete.
- The `Loans.ts` writer comment.

Deferred: none.

Rejected, with the reasons recorded in the triage log:
- The `personUse` two-read undercount.
- The duplicate `Named` type.
- The repeated loans filter.
- `resolvePerson` inside a caller's transaction, which 6.5 tests.
- The false rows: untyped `Ref` input, merge atomicity, wording on a screen, the race test, and bookkeeping.

**Follow-up review:** not recommended. Patched entries this pass: high 0, medium 0, low 6.

**Verification.**
- `npm run typecheck`: clean.
- `npm run lint`: 0 errors, 48 warnings, all already present in generated migrations.
- `npm run test:unit`: 910 passed (62 files).
- `npm run test:reset && npm run test:int`: 573 passed (69 files), including `peopleService.int.spec.ts` (12).
- Matrix audit: all 16 rows are covered by passing tests.
- No schema change, so there is no migration or production-dump check.

**Residual risks.**
- A loan committed concurrently between `deletePerson`'s or `mergePerson`'s check and the Person delete fails on `loans.person_id` (NOT NULL, `ON DELETE set null`) and rolls back as `INTERNAL`, not `PERSON_IN_USE`. This is documented in the doc comments.
- A lost create or rename race surfaces as the unique index's `ValidationError`, as for locations.
- Until 6.4, removing a copy that has a loan still fails on the FK.
- Story 7.4 adds wishlist entries to `PERSON_IN_USE`, `mergePerson` and `personUse`.
