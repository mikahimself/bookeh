---
title: 'Story 4.6: [F6] Move copies'
type: 'feature'
created: '2026-10-21'
status: 'done'
baseline_revision: 'd3abc955381ef1336d82d4bc0f9c4ee9ac00cc28'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** FR-33's "move a selection to another location" has no service. AD-18 makes every selection action one `lib/copies` function over a list of copy ids, all or none, and AD-20 makes a move undoable. The name `moveCopies` is already taken by the private-Book merge helper, which moves copies from one Book to another.

**Approach:** Rename the merge helper to `moveCopiesToBook` and add `moveCopies(ctx, copyIds, location: Ref | null)` to `lib/copies`. It moves every listed copy of the viewer to one location in one transaction and returns `Undone<{ location: number | null }>`, whose restore puts each copy back at its previous location.

## Boundaries & Constraints

**Always:** Gateway reads and writes as the viewer; owner access scopes `copies`, the admin included (AD-17, FR-48). Joins the caller's transaction or opens one (`withTransaction`, like `createCopy`) and records nothing; callers wrap it in `withUndo()`. The `Ref` is resolved once by `resolveLocation()`. Duplicate ids count once. Writes run in sequence (AD-16). The restore closes over copy ids and previous location ids only and skips gone copies (`count` first: a failed write ends the transaction).

**Never:** No server action, screen or toast (no selection UI yet; Edit book calls it in 4.9). No `undefined` default-location form. No system privileges. No change to the `copies` collection. No spine edit: AD-18 and AD-20 already state the contract, and the spine never names the merge helper.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Move and Undo | A's owned c1 at L1, c2 at none; `withUndo` around `moveCopies(asA, [c1, c2], { create: 'Mökki' })`, then `undo()` | Mökki is created and both copies are at it, `data.location` is its id; after Undo c1 is at L1, c2 at none, and Mökki still exists | No error expected |
| Ordered in list | c1 owned, c3 ordered; any target, `null` included | nothing moved, no location created | `DomainError('VALIDATION', { fields: { location: 'VALIDATION' } })` |
| Foreign id | B's copy id among A's ids | nothing moved | `DomainError('NOT_FOUND')` |
| Bad ids | `[]`, or an id that is not a positive safe integer | nothing read | `DomainError('NOT_FOUND')` |

</intent-contract>

## Code Map

- `src/lib/copies/moveCopies.ts` -- today the merge helper `moveCopies(ctx, fromBookId, toBookId)`; it moves to `moveCopiesToBook.ts` and this path takes the new function.
- `src/lib/catalogue/sharePrivateBook.ts:4,322` -- the only caller of the merge helper; update the import and the call.
- `src/lib/copies/createCopy.ts` -- pattern: `withTransaction`, gateway writes as the viewer, `Undone<T>` whose restore counts before writing, doc style.
- `src/lib/copies/locations.ts:20` -- `resolveLocation(ctx, ref)`: an id comes back unchecked (the `ownedRelation` on `copies.location` rejects a foreign one with `ValidationError`), and a name is matched or created.
- `src/collections/Copies.ts:16` -- `noLocationWhenOrdered` rejects only a non-null location, so the service checks status itself (an ordered copy fails a move to `null` too), before any write. Read-only.
- `src/lib/payload/gateway.ts:41,55,74` -- `find` (`where: { id: { in: ids } }`, `select: { status: true, location: true }`, `depth: 0`, `pagination: false`), `count`, `updateByID`.
- `src/lib/undo/undo.ts` -- `Undone`, `withUndo` (needs `T extends object`), `undo`.
- `tests/int/createCopy.int.spec.ts:30-76` -- setup to copy: `bookFor`, `locationFor`, `contextFor`, `createUser`, system reads via `payload.findByID`.

## Tasks & Acceptance

**Execution:**
- `src/lib/copies/moveCopiesToBook.ts` -- the merge helper, renamed. Body and doc unchanged. -- frees the AC's name.
- `src/lib/catalogue/sharePrivateBook.ts` -- import and call `moveCopiesToBook`. -- follows the rename.
- `src/lib/copies/moveCopies.ts` -- new `moveCopies(ctx, copyIds: number[], location: Ref | null): Promise<Undone<{ location: number | null }>>`. Dedupe the ids and fail with `NOT_FOUND` when the list is empty or holds an id that is not a positive safe integer. Inside `withTransaction`: find the viewer's copies by id, and fail with `NOT_FOUND` when fewer are found than asked for. Fail with the `location` field error when any copy is ordered. Then resolve the location, update each copy whose location differs, and return the restore over `{ id, previous }` pairs for the copies that changed. The doc comment cites AD-18, AD-20 and FR-33. -- the AC's service.
- `tests/int/moveCopies.int.spec.ts` -- new. Case one: A moves two copies (one at a location, one at none) to `{ create }`, `undo()`, and both copies are back where they were while the created location still exists (AC's Undo test, spine Undo rule). Case two: a list with one ordered copy, moved to `{ create }`, throws the `location` field error and leaves every copy unchanged with no location created (AC all-or-none). Case three: B's copy id in A's list throws `NOT_FOUND` and nothing changes (two-user access rule), and `[]` and `[0]` throw `NOT_FOUND` too.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- set `4-6-f6-move-copies: done` in the story commit.

**Acceptance Criteria:**
- Given `moveCopies(ctx, copyIds, location)` in `lib/copies`, when it runs, then every listed copy moves in one transaction, all or none, and a list holding an ordered copy fails the whole move with a field error on `location`.
- Given a move run through `withUndo`, when `undo()` runs with its token, then each copy is back at its previous location (or none), and a location created inline by the move still exists.
- Given the private-Book merge in `sharePrivateBook`, when it runs after the rename, then its copies still move to the shared Book (the existing `sharePrivateBook` tests pass unchanged).

## Spec Change Log

## Review Triage Log

### 2026-10-21 — Review pass
- verdicts: 22 findings — high 0, medium 0, low 15, false 7, maybe-false 0
- findings:
  - `[low]` `[reject]` (edge) A previous location deleted before Undo makes `ownedRelation` reject the restore, so the whole Undo fails with `UNDO_FAILED`. AD-20 accepts this ("if any step fails, nothing is restored"), and Design Notes record it. Location delete is not built yet, and guarding it would add a branch for a rare case.
  - `[low]` `[reject]` (edge) A moved copy that becomes ordered before Undo makes `noLocationWhenOrdered` fail the restore, so Undo fails as a whole. Same spine rule, recorded in Design Notes. `setStatus` (4.5) is not on main, and a guard would add complexity.
  - `[false]` `[reject]` (edge) Undo overwrites a later move with the pre-move location. AD-20 says it "writes the recorded previous values to rows that still exist, whatever they hold now", so this is the stated behaviour, not a defect.
  - `[low]` `[patch]` (verification-gap) The restore's skip of a gone copy (AD-20) is untested. Added a case that deletes one moved copy before `undo()` and checks that Undo still resolves.
  - `[low]` `[patch]` (verification-gap) The rule "a copy already at the target is not in the restore" (AD-20: never touch a row the action did not change) is untested. The same new case moves a copy that is already at the target, moves it again, and checks that Undo leaves it alone.
  - `[low]` `[patch]` (verification-gap) No test runs a successful move to `null`. The same new case's second move goes to `null` and asserts the result and the row.
  - `[false]` `[reject]` (verification-gap, other) An ordered copy fails even a move to `null`. The layer itself filed this as intended, and AC 1 reads "an ordered copy in the list fails the whole move".
  - `[low]` `[patch]` (blind) The foreign-copy assertion proves nothing, because B's copy starts at none and the target is `null`. B's copy now starts at a location of B's, and the test asserts it stays there.
  - `[low]` `[patch]` (blind) A `null` move on an ordered copy fails, which is a trap for Edit book's Save (4.9). The doc comment now says a caller that sets a copy to ordered does not also move it, because `setStatus` clears the location.
  - `[low]` `[reject]` (blind) The result lacks the location name and moved count that the 5.30 toast needs. No caller exists yet, and adding fields now would be surface built "for later". 5.30 can extend the result.
  - `[false]` `[reject]` (blind) sprint-status reads `done` while the spec reads `in-review`. Both land in the one story commit after triage, as in earlier stories.
  - `[low]` `[reject]` (blind) `idOf` is a fourth copy of a one-line helper. Sharing it would touch three unrelated files for no named breakage.
  - `[low]` `[reject]` (blind) The doc says the function opens its own transaction, while AD-20 says "opens no transaction". It follows `createCopy`'s precedent: under `withUndo` it only joins, so the receipt is still recorded after the commit, which is what AD-20 protects.
  - `[low]` `[reject]` (blind) The ordered-copy error does not name the offending copy. The selection UI (5.30) doesn't exist yet, and adding ids to the error adds surface.
  - `[false]` `[reject]` (intent) No screen, action or toast. AC and STORY-SLICING (F6 "Service", F4 the screen) put the UI in another story.
  - `[low]` `[reject]` (intent) "All or none" is tested only at the validation step, not through a write that fails partway. `transaction.int.spec.ts` covers `withTransaction` rollback, so this would be a test-only addition.
  - `[low]` `[reject]` (intent) The AD-20 wording mismatch, a duplicate of the blind finding. Same reason.
  - `[low]` `[patch]` (intent) R4a is stricter than the collection hook. Same root as the blind ordered-`null` trap, and the same doc patch.
  - `[low]` `[patch]` (intent) The skip path is untested, a duplicate of the verification-gap finding. The same new case covers it.
  - `[false]` `[reject]` (intent) Lent copies move freely. Loans arrive in Epic 6, and FR-33's lent rule is about a loan keeping the copy's location, not about blocking a move.
  - `[false]` `[reject]` (intent) The rename reaches beyond the AC. It is needed to free the AC's name, and the unchanged `sharePrivateBook` tests cover it (AC 3).
  - `[false]` `[reject]` (intent) c2 starts at none, so only one copy returns to a "real" location. "None" is c2's old location, and the test asserts it.

## Design Notes

The restore writes previous values to copies that still exist, whatever they hold now (AD-20). A copy that has become ordered since the move, or whose previous location has since been deleted, makes its write fail, so the whole Undo fails with `UNDO_FAILED` and changes nothing. That is the spine's rule, and no screen can do either yet. A copy already at the target is not written and is not in the restore, so Undo never touches a row the move did not change.

## Verification

**Commands:**
- `npm run typecheck` -- expected: no errors
- `npm run lint` -- expected: no errors
- `npm run test:unit` -- expected: all pass
- `npm run test:int` -- expected: all pass, including `moveCopies.int.spec.ts` and `sharePrivateBook.int.spec.ts`

## Auto Run Result

Status: done

**Summary:** Added `moveCopies(ctx, copyIds, location: Ref | null)` to `lib/copies`. It moves the viewer's listed copies to one location in one transaction, all or none, and returns `Undone<{ location }>`, whose restore puts each changed copy back at its previous location. Duplicate ids count once. An empty list, a bad id, or a copy that owner access hides fails with `NOT_FOUND`. A list holding an ordered copy fails with `VALIDATION` on `location` before any location is created. A copy already at the target is not written and is left out of the restore, and the restore skips a copy that has gone. A location created inline stays after Undo. The old Book-to-Book merge helper had the name `moveCopies`; it is now `moveCopiesToBook`, with its body unchanged. The spine already states this contract (AD-18, AD-20), so it is unchanged.

**Files changed:**
- `src/lib/copies/moveCopies.ts`: the new selection move with its restore.
- `src/lib/copies/moveCopiesToBook.ts`: the merge helper, renamed.
- `src/lib/catalogue/sharePrivateBook.ts`: calls `moveCopiesToBook`.
- `tests/int/moveCopies.int.spec.ts`: four cases:
  - move and Undo with an inline location;
  - a restore that skips a gone copy and an unchanged one, after a move to `null`;
  - an ordered copy in the list;
  - another user's copy and bad ids.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: 4.6 is done.

**Review findings:** 22 in total.
- 7 patches, all `low`, in 4 groups:
  - B's copy in the two-user test starts at a location, so the assertion now means something.
  - One new restore case covers both AD-20 skip rules and a successful move to `null`.
  - A doc sentence tells callers not to move a copy they are setting to ordered.
- 0 deferred.
- 8 rejected as `low`:
  - Undo failing after the previous location is deleted, or after the copy becomes ordered (AD-20 accepts both; Design Notes).
  - The toast's name and count, and the offending ids in the error (no caller yet).
  - The `idOf` duplication.
  - The AD-20 "opens no transaction" wording, raised twice (follows `createCopy`).
  - A partway-failure rollback test (covered by `transaction.int.spec.ts`).
- 7 rejected as `false`:
  - Undo overwriting a later move (the stated AD-20 behaviour).
  - Ordered copies failing a move to `null` (the AC's wording).
  - The order of sprint-status and spec status.
  - No UI (F4 owns it).
  - Lent copies.
  - The rename.
  - c2's old location being none.

**Follow-up review recommended:** false. No `high` or `medium` entries were patched (patched by verdict: high 0, medium 0, low 7).

**Verification:** run against the worktree's own Postgres on port 5435.
- `npm run typecheck`: clean.
- `npm run lint`: 0 errors. All 36 warnings are pre-existing, in `src/migrations`.
- `npm run test:unit`: 690 passed.
- `npm run test:int`: 44 files, 428 tests passed, including `moveCopies.int.spec.ts` (4) and the unchanged `sharePrivateBook.int.spec.ts`.
- Every matrix row is covered by a test that ran.

**Residual risks:**
- Undo fails as a whole with `UNDO_FAILED` if a moved copy's previous location has been deleted, or the copy has become ordered, since the move. This is documented and untested.

**Rebase onto main (after 4.2 and 4.5):** the only conflict was `sprint-status.yaml` (both stories done). To match 4.5's `lib/copies` writers, the copy find now filters on `owner` explicitly as well as through `ownerAccess` (FR-48), and `copyIds` is `readonly number[]`. One difference from 4.5 is kept: an empty list is `NOT_FOUND` here (the reviewed matrix row), while `removeCopies([])` returns without a read.
