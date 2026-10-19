---
title: 'Story 3.33: [D3] Create a copy'
type: 'feature'
created: '2026-10-19'
baseline_revision: 'f58cc824d40d1f89ef547e34c8f45b5b4b155052'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '_bmad-output/implementation-artifacts/epic-3-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      The Payload admin's create form for `copies` is a second insert path that bypasses `createCopy()`.
    evidence: |-
      `ownerAccess` lets any signed-in owner create `copies` rows, and the admin panel renders a create form for the collection. Such a row skips the rules that `createCopy` will hold, such as the default location from 3.34. The cause is the collection's access from 3.20, not this story. Removing create from the admin needs a decision on whether the back office may add copies at all.
    location: >-
      src/collections/Copies.ts:38
    severity: low
---

<intent-contract>

## Intent

**Problem:** Several paths will create copies: the save (3.35), closing a wishlist entry (Epic 7), and Received. Nothing in `src` creates one yet. AD-18 makes `createCopy()` in `lib/copies` the only insert into `copies`, so default-location and status rules live in one place.

**Approach:** Add `createCopy(ctx, input)` in a new `src/lib/copies/createCopy.ts`. It inserts one owned or ordered copy of a Book for the context's user through the gateway and joins the context's transaction when there is one. Integration tests cover owned, ordered, a foreign Book id and a rolled-back transaction.

## Boundaries & Constraints

**Always:**
- `src/lib/copies/createCopy.ts` exports `type NewCopy = { bookId: number; status: Copy['status'] }` and `createCopy(ctx: Context, input: NewCopy): Promise<number>`, which resolves to the new copy's id. Its doc comment cites AD-18 and says it is the only insert into `copies`.
- One `gateway.create` on `copies` with `data: { owner: ctx.user.id, book: input.bookId, status: input.status }` and `depth: 0`. `owner` is there only to satisfy Payload's create type, because the owner hook sets it from the request.
- No `withTransaction` wrapper. A context from `withTransaction()` carries the transaction on its `req`, so the gateway call joins it. Outside a transaction, Payload's create is its own unit.
- A Book the user cannot read (another user's private Book, or an id that does not exist) is refused by the collection's `readableRelation` with Payload's `ValidationError` on `book`, unchanged. `runAction` already maps that to `VALIDATION` with `fields.book`.
- In `src`, the only `create` on `copies` is in `createCopy.ts`.

**Never:**
- No `location` input and no default location. That is 3.34, which adds `location?: Ref | null` and the profile default. Until then a new copy has no location.
- No `notes` input. No caller sets notes on create.
- No undo receipt and no `Undone<T>`. The save's restore (3.37) owns that.
- No other `lib/copies` function (move, receive, set status, remove) and no location service.
- No change to the `copies` collection, its hooks, the gateway or any migration.
- No ownership gate on the Book. Any readable Book gets a copy, and owning another edition or the same one is allowed (duplicates are real).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Owned | User A, a shared Book, `status: 'owned'` | Resolves to an id. Read with system privileges, the row has `owner` A, that `book`, `status: 'owned'`, `location` null, `notes` null. | No error expected |
| Ordered | User A, a shared Book, `status: 'ordered'` | As above with `status: 'ordered'` | No error expected |
| Own private Book, twice | User A, A's private Book, called twice | Two distinct ids, both A's copies of that Book | No error expected |
| Foreign Book id | User B, A's private Book | Rejects. B has no copy of that Book. | `ValidationError`, paths `['book']` |
| Rolled-back transaction | `withTransaction(asA, tx => createCopy(tx, …).then(id => { seen = id; throw e }))` | Rejects with `e`. No copy with `seen` remains. | Rollback |

</intent-contract>

## Code Map

- `src/collections/Copies.ts`: the collection. `ownerField()` sets `owner` from `req.user`. `readableRelation('books', …)` rejects a Book the request user cannot read. `status` is `ordered | owned`. `noLocationWhenOrdered` never fires here, because no location is sent. Read-only.
- `src/lib/payload/gateway.ts:57-62`: `gateway.create`, called as `import * as gateway from '@/lib/payload/gateway'`. It forces `overrideAccess: false` and the context's `req` and `user`.
- `src/lib/payload/transaction.ts:36-59`: `withTransaction` hands `fn` a context whose `req` carries the transaction. The tests use it for the rollback row.
- `src/lib/books/upsertUserBook.ts:150-156`: the precedent for `owner: tx.user.id` on a gateway create, with its comment.
- `src/lib/errors.ts:62-67`: `ValidationError` → `VALIDATION` with `fields`, so no conversion is needed.
- `eslint.config.mjs:27`: zone `copies: ['payload', 'undo']`, so `lib/copies` may import `lib/payload`. `lib/catalogue` already lists `copies`.
- `tests/int/copies.int.spec.ts`: collection test. Its `systemBook()` helper builds shared or private Books, and `ownerId()` reads `owner`. The header comment says gateway writes are the sanctioned path "until 3.33"; update it to say that this file tests the collection directly and services go through `createCopy`.
- `tests/helpers/harness.ts` (`contextFor`, `createUser`), `tests/helpers/isbn.ts` (`randomIsbn`), `tests/helpers/validation.ts` (`rejectedPaths`).
- `tests/int/holdings.int.spec.ts:57`, `tests/int/lookupBook.int.spec.ts:104`, `tests/int/locations.int.spec.ts:41,132`: test fixtures that write `copies` through the gateway, some with a `location`. Leave them as they are (see Design Notes).

## Tasks & Acceptance

**Execution:**
- `src/lib/copies/createCopy.ts`: new. `NewCopy` and `createCopy` as described in Always.
- `tests/int/createCopy.int.spec.ts`: new. One test per matrix row. Rows are read back with `payload.findByID`/`count` and `overrideAccess` (the default for the Local API without `user`).
- `tests/int/copies.int.spec.ts`: header comment only, as in the Code Map.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: set `3-33-d3-create-a-copy` to its final status.

**Acceptance Criteria:**
- Given `npx eslint src tests`, `npx tsc --noEmit`, `npm run test:unit` and `npm run test:int`, when they run, then all pass with 0 lint errors.
- Given `grep -rn "collection: 'copies'" src`, when it runs, then the only hit that is a create is in `src/lib/copies/createCopy.ts`. The others are reads (`lib/books/holdings.ts`) or are outside `create` calls.

## Spec Change Log

## Review Triage Log

### 2026-10-19 — Review pass
- verdicts: 16 findings — high 0, medium 0, low 5, false 11, maybe-false 0
- findings:
  - `[low]` `[reject]` blind: no test for a Book id that does not exist. Real gap, no defect. `readableTargets` counts 0 for a missing id exactly as for an unreadable one (`relation.ts:37-45`), so it is the same path as the foreign-Book test. Under the functional-minimum test rule, a second test of one branch is not worth it.
  - `[false]` `[reject]` blind: the 3.35 path, a Book created earlier in the same transaction, may not pass `readableRelation`. Disproved. The count spreads `asRequestUser(req)`, which carries the transaction's `req` (`relation.ts:18-21,40-45`), and `tests/int/fieldHelpers.int.spec.ts:180` pins "sees a target created earlier in the request's transaction". 3.35 tests the save itself.
  - `[false]` `[reject]` blind: no test copies another user's shared Book. `createCopy` adds no Book rule over the collection, and `copies.int.spec.ts` "accepts a shared Book…" already has B copy A's shared Book. Nothing in this diff can break it.
  - `[low]` `[patch]` blind: the doc comment calls this the only insert under AD-18 but does not say the default-location rule is not applied yet. Patched: one sentence saying a new copy has no location until 3.34.
  - `[false]` `[reject]` blind: sprint status `done` while the spec says `in-review`. Finalize sets the spec to `done` in the same commit, and the spec is left out of the diff on purpose because it is the edge layer's claims file.
  - `[low]` `[reject]` blind: no lint rule enforces "only insert into `copies`". Real: it holds by convention, as for `user-books`. A `no-restricted-syntax` rule over three services is new tooling, not a direct correction, and AD-18's other single writers have none.
  - `[false]` `[reject]` blind: the `seen as number` cast. No bad outcome: `expect(seen).toBeTypeOf('number')` fails the test first if `seen` is unset.
  - `[false]` `[reject]` intent A: A2 (always open a transaction) is not implemented. Both readings put the write in the caller's transaction when there is one. A lone create outside one is atomic either way.
  - `[low]` `[reject]` intent B2: test fixtures still insert copies through the gateway. Real. Design Notes give the reason: the collection test must write directly, and the other fixtures set `location`, which `createCopy` takes only from 3.34. Moving them now means editing them twice.
  - `[low]` `[defer]` intent B3: the Payload admin form can still create `copies` rows, which bypasses `createCopy`. Real and pre-existing from 3.20 (`ownerAccess` allows owner creates). Not caused by this story. Deferred.
  - `[false]` `[reject]` intent B4: no enforcement. Same claim as the blind lint row; same disposition.
  - `[false]` `[reject]` intent C2: the nonexistent id is untested. Same root cause as the first blind row; no defect.
  - `[false]` `[reject]` intent D2: no default location. Epics 3.34 (F2) owns it explicitly, so the intent excludes it here.
  - `[false]` `[reject]` intent E2: not committed. Finalize commits.
  - `[false]` `[reject]` intent: no caller in `src` yet. That is expected for a service story; 3.35 is the first caller.
  - `[false]` `[reject]` intent: the `VALIDATION` mapping is not tested here. It is `errors.ts`' own contract, already tested, and unchanged.
  - edge-case and verification-gap layers: no findings.

## Design Notes

**Why `src` only for "the only insert".** AD-18 binds services, and the lint zones and the gateway are what stop a screen writing rows. The collection test has to write `copies` directly to prove the collection's own rules. The holdings, lookup and locations fixtures set `location` and other fields that `createCopy` does not take until 3.34. Routing them through `createCopy` now would mean either widening its input "for later" or editing them twice.

**Why no `withTransaction`.** It would wrap a single write and change nothing: a joined context already carries the transaction, and a lone create needs none. 3.34 adds a location lookup and possibly an inline create before the insert, and it will wrap both then.

**Why the id and not the row.** `saveCopy` needs `copyId` for `SaveResult` and the restore. Nothing needs the rest of the row.

## Verification

**Commands:**
- `npx eslint src tests`: expected 0 errors.
- `npx tsc --noEmit`: expected clean.
- `npm run test:unit`: expected all pass (unchanged).
- `npm run test:int`: expected all pass, `createCopy` included. This needs the worktree's Postgres on `localhost:5433` through `.env`.

## Auto Run Result

**Summary.** `createCopy(ctx, { bookId, status })` in `src/lib/copies/createCopy.ts` makes one gateway create on `copies` for the context's user and resolves to the new copy's id.
- The write joins the caller's transaction when the context carries one.
- A Book the user cannot read is refused by `readableRelation` with `ValidationError` on `book`.
- Duplicates are allowed.
- There is no location yet; 3.34 adds `location` and the profile default.

**Files changed.**
- `src/lib/copies/createCopy.ts`: new. The service and `NewCopy`.
- `tests/int/createCopy.int.spec.ts`: new. 5 tests, one per matrix row.
- `tests/int/copies.int.spec.ts`: header comment only.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: 3.33 is done.

**Review.** 16 findings: low 5, false 11. The edge-case and verification-gap layers found nothing.

Patched 1 (low): the doc comment now says that the default location is not applied until 3.34.

Deferred 1 (low): the Payload admin's create form for `copies` bypasses `createCopy` (pre-existing from 3.20; see frontmatter).

Rejected:
- No test for a nonexistent Book id (2 rows). It takes the same `readableTargets` branch as the foreign-Book test.
- An uncommitted Book in the same transaction. False: the count carries the transaction's `req`, and `fieldHelpers.int.spec.ts:180` pins it.
- Another user's shared Book. Covered by the collection test, and `createCopy` adds no rule.
- Sprint status ahead of the spec. False: finalize sets both.
- No lint rule for "only insert" (2 rows). Convention, as for AD-18's other single writers; a rule is new tooling.
- The test cast. No bad outcome.
- Test fixtures writing `copies` directly. See Design Notes.
- Intent readings A2, D2, E2, no caller yet, and the untested `VALIDATION` mapping. The intent or other stories settle each one.

**Follow-up review:** not recommended. Patched entries: high 0, medium 0, low 1.

**Verification.** Run in worktree `story-3-33-create-copy`, Postgres on `localhost:5433`, after the patch:
- `npx eslint src tests`: 0 errors (36 pre-existing warnings).
- `npx tsc --noEmit`: clean.
- `npm run test:unit`: 30 files, 521 passed.
- `npm run test:int`: 33 files passed, 1 skipped (`migrationSchema`). `createCopy` passed 5/5.
- Matrix audit: every row has a passing test.
- Playwright not run (service story).

**Residual risks.**
- Until 3.34, an owned copy from `createCopy` has no location. No caller exists yet, so nothing user-facing is affected.
- **Merge conflict:** built beside 3.32 on main. Both change adjacent `sprint-status.yaml` lines; keep both as `done`. No migration, so no type regeneration after a rebase.
