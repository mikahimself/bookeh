---
title: 'Story 4.5: [D24] Copy status, note and removal'
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

**Problem:** `lib/copies` can only insert copies (`createCopy`) and move them between Books on a merge. Edit book (4.9), the Answer and the action bar need status changes, notes and removal, and AD-18 allows no other writer of `copies`.

**Approach:** Add `setStatus`, `setNote` and `removeCopies` to `lib/copies`, each in the caller's transaction or one of its own. Status reuses `createCopy`'s location rule, so "ordered clears the location; owned uses the default unless one is given" lives in one place.

## Boundaries & Constraints

**Always:** Writes go through the gateway as the viewer. Each function checks that every id it is given is one of the viewer's copies before it writes, and otherwise fails with `DomainError('NOT_FOUND')` and writes nothing. The check filters on `owner` explicitly, as `moveCopies` does, so the admin is not exempt (FR-48). `removeCopies` takes a list of ids and runs in one `withTransaction()`, all or none (AD-18, selection actions). A `Ref` location is resolved by `resolveLocation()` in the same transaction.

**Never:** No Undo: removals and Edit book saves have none (EXPERIENCE.md → Undo, AD-20), and Received, which does, is Epic 8. No server action or UI: nothing calls these yet (4.9, Epic 5). No loan deletion: `loans` arrives in Epic 6, and the doc comment says that it is added here then. No orphan Book clean-up on removal. No change to `moveCopies(fromBookId, toBookId)` (4.6 owns the selection move). No spine edit: AD-18 already lists set status, set note and remove in `lib/copies`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| To ordered | A's owned copy at L; `setStatus(asA, id, { status: 'ordered' })` | ordered, location null | No error expected |
| To owned, default | A's ordered copy, A's default D; `{ status: 'owned' }` | owned at D | No error expected |
| To owned, given | `{ status: 'owned', location: { create: 'Mökki' } }` or `null` | owned at the new location, or none | No error expected |
| Note | `setNote(asA, id, '  Café  ')` | stored `'Café'` | No error expected |
| Empty note | `'   '` | stored `null` | No error expected |
| Remove | `removeCopies(asA, [c1, c2])` | both gone; the Book stays | No error expected |
| Empty list | `removeCopies(asA, [])` | nothing read or written | No error expected |
| Foreign id | B's copy id to any of the three, alone or in A's list | nothing changes | `DomainError('NOT_FOUND')` |

</intent-contract>

## Code Map

- `src/lib/copies/createCopy.ts` -- `NewCopy` and the private `locationFor()` hold the status/location rule. Move `locationFor` to `locations.ts` and export it, and base `NewCopy` on a new exported `CopyStatus` (`{ status: 'owned'; location?: Ref | null } | { status: 'ordered' }`).
- `src/lib/copies/locations.ts` -- `resolveLocation()`; receives the moved `locationFor`.
- `src/lib/copies/moveCopies.ts` -- sibling style (explicit `owner` filter, sequential calls, AD-16). Do not change.
- `src/lib/payload/gateway.ts` -- `count`, `find`, `updateByID`, `deleteByID`. Check with `count`/`find` first: a failed by-id write (`NotFound`) ends the transaction (see `deleteCopy` in createCopy.ts).
- `src/collections/Copies.ts` -- `notes` is a textarea, maxLength 2000 (a longer note is the collection's `ValidationError` on `notes`). `noLocationWhenOrdered` rejects but never clears.
- `src/lib/books/upsertUserBook.ts:47` -- the text convention: `trim().normalize('NFC')`, `''` stored as `null`.
- `tests/int/createCopy.int.spec.ts` -- setup to copy (`bookFor`, `userWithDefault`, `systemRead`).

## Tasks & Acceptance

**Execution:**
- `src/lib/copies/locations.ts`, `src/lib/copies/createCopy.ts` -- move `locationFor` and add `CopyStatus` as in the Code Map. -- one home for the rule (AD-18).
- `src/lib/copies/updateCopy.ts` -- new: `setStatus(ctx, copyId, change: CopyStatus): Promise<void>` writes `status` and `locationFor(change)`. `setNote(ctx, copyId, note: string): Promise<void>` writes the trimmed NFC note, or `null` when empty. Both share a private own-copy check (`count` with `id` and `owner`, 0 → `NOT_FOUND`). Doc: AD-8/AD-18; the caller sends a status only when it changes, since owned with no location always means the default.
- `src/lib/copies/removeCopies.ts` -- new: `removeCopies(ctx, copyIds: number[]): Promise<void>`. Dedupes the ids. An empty list returns at once. It finds the viewer's copies among them, fails with `NOT_FOUND` unless all are found, then deletes each by id. The doc comment says Epic 6 deletes their loans here.
- `tests/int/copyWrites.int.spec.ts` -- new, two users. setStatus: owned at L → ordered clears L, then → owned lands at the default, then given `{ create }` lands there. setNote: the trim/NFC case and the empty case. removeCopies: two copies go and the Book stays. A list with one of A's ids and one of B's fails with `NOT_FOUND` and A's copy stays. B's id fails with `NOT_FOUND` on `setStatus` and `setNote`, and the copy is unchanged. -- the AC's named tests and the access and transaction spine rules.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `4-5-d24-copy-status-note-and-removal: done`.

**Acceptance Criteria:**
- Given `setStatus`, when a copy is set to ordered, then its location is cleared; when set to owned, then it lands at the default location unless a location (`Ref` or `null`) is given.
- Given `setNote`, when it runs, then the note is stored trimmed and NFC-normalised, and an empty note is stored as `null`.
- Given `removeCopies` with a list of copy ids, when any id is not the viewer's, then it fails with `NOT_FOUND` and removes none; otherwise it removes all of them in one transaction.
- Given another user's copy id, when `setStatus` or `setNote` runs, then it fails with `NOT_FOUND` and the copy is unchanged.

## Spec Change Log

## Review Triage Log

### 2026-10-21 — Review pass
- verdicts: 20 findings — high 0, medium 0, low 11, false 9, maybe-false 0
- findings:
  - `[low]` `[reject]` (blind) `setNote` leaves the 2000-character limit to Payload, so an over-long note is `VALIDATION` on `notes`, not `TOO_LONG` as for manual entries (R6). Real, but a 2000-character note is rare. The fix adds a `limits` entry, a schema change and a branch, and fits the note editor's own story (E12), whose message it serves.
  - `[low]` `[reject]` (blind) `setStatus({ status: 'owned' })` on an already-owned copy moves it to the default location. This is the AC's literal rule ("owned uses the default unless one is given") and is documented for callers. There is no caller yet, and 4.9 sends sparse edits. A keep-current branch would add a read and a rule the AC does not state.
  - `[low]` `[patch]` (blind) `CopyStatus` lives in `createCopy.ts`, so `locations.ts` imports from its own user, a type-only cycle. Moved the type next to `locationFor` in `locations.ts`; the name is unchanged.
  - `[low]` `[patch]` (blind) `removeCopies` uses `find` with a dummy `select` where a `count` is enough, so the story has two different own-copy checks. Switched to `gateway.count`.
  - `[low]` `[patch]` (blind) Two comments credit the explicit `owner` filter with keeping the admin out, but `ownerAccess` already does that for every role (`src/access/owner.ts`). Reworded both: explicit as well as through `ownerAccess`.
  - `[false]` `[reject]` (blind) `setStatus`/`setNote` are too generic, and `updateCopy.ts` is named after no function. The names are the epic AC's and AD-18's. No caller would diverge, and the file name harms nothing.
  - `[low]` `[patch]` (blind) The test helper `locationFor` shadows the meaning of the new library export `locationFor`. Renamed it to `newLocation`.
  - `[false]` `[reject]` (blind) `sprint-status.yaml` says done while the spec says in-review. Finalize sets the spec to done in the same commit, so the committed record agrees.
  - `[low]` `[reject]` (blind) Two concurrent removes of the same ids: the second fails with `NOT_FOUND` after the first commits. This needs a double submit that the confirming dialog does not invite. Treating vanished ids as removed would add a branch that hides real foreign ids.
  - `[low]` `[reject]` (edge) Same as the second blind finding (owned on owned goes to the default). Same reason.
  - `[low]` `[reject]` (edge) A note of only zero-width characters is stored, not `null`. Unlikely in use, and the fix adds a custom whitespace class beyond the project's `trim()` convention (`upsertUserBook`).
  - `[low]` `[reject]` (edge) A NaN or fractional id becomes a Postgres cast error (`INTERNAL`), not `NOT_FOUND`. There is no caller yet, and input shape is validated at the action boundary by convention (4.1 triage, `isSaveInput`).
  - `[false]` `[reject]` (intent) No UI or action reaches the functions. Story 4.5 is a developer story for `lib/copies`; the surfaces are E12, E25 and 4.9 (STORY-SLICING).
  - `[low]` `[reject]` (intent) Already-owned plus no location goes to the default. Duplicate of the second blind finding; same reason.
  - `[false]` `[reject]` (intent) `setStatus` with a location relocates without Undo, overlapping with move. The AC requires owned to take a given location, Edit book has no Undo (EXPERIENCE.md → Undo), and both paths stay in `lib/copies` (AD-18).
  - `[false]` `[reject]` (intent) An empty note is stored as `null`, not `''`. "May be empty" is met: an empty note is accepted. `null` is the project's convention for cleared text (`upsertUserBook`).
  - `[false]` `[reject]` (intent) Rollback partway through the deletes is untested. All or none comes from `withTransaction`, whose rollback `transaction.int.spec.ts` pins. The story's own all-or-none case (a mixed list removes nothing) is tested.
  - `[false]` `[reject]` (intent) No admin test. `copies.int.spec.ts:89` pins that `ownerAccess` hides another user's copies from the admin, and every check here reads through it.
  - `[false]` `[reject]` (intent) Loans are only a doc comment, against AD-18's "deleting a copy deletes its loans". `loans` does not exist until Epic 6, and the epic AC says "from Epic 6".
  - `[false]` `[reject]` (intent) The change is uncommitted and the status markers disagree. Finalize commits the story with the spec at done.

## Verification

**Commands:**
- `npm run typecheck` -- expected: no errors
- `npm run lint` -- expected: no errors
- `npm run test:unit` -- expected: all pass
- `npm run test:int` -- expected: all pass, including `copyWrites.int.spec.ts` and the unchanged `createCopy.int.spec.ts`

## Auto Run Result

Status: done

**Summary:** Added `setStatus`, `setNote` and `removeCopies` to `lib/copies`. Each runs in the caller's transaction or one of its own and fails with `NOT_FOUND`, writing nothing, on any id that is not one of the viewer's copies.
- `setStatus` reuses `createCopy`'s location rule: ordered clears the location, and owned takes the given location (`Ref` or `null`) or the default. The rule now lives in `locationFor()` in `locations.ts`, beside the new `CopyStatus` type.
- `setNote` stores the note trimmed and NFC-normalised, and stores an empty note as `null`.
- `removeCopies` takes a list of ids and removes all or none. An empty list does nothing, and loan deletion is noted for Epic 6.
- No spine edit: AD-18 already lists these functions.

**Files changed:**
- `src/lib/copies/locations.ts`: `CopyStatus`, plus `locationFor()` moved here from `createCopy.ts`.
- `src/lib/copies/createCopy.ts`: `NewCopy` is now `CopyStatus & { bookId }`, using the shared `locationFor()`.
- `src/lib/copies/updateCopy.ts`: new, with `setStatus` and `setNote`.
- `src/lib/copies/removeCopies.ts`: new, with `removeCopies`.
- `tests/int/copyWrites.int.spec.ts`: new, two-user integration tests for all three functions.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: 4.5 is done.

**Review findings:** 20 in total.
- 4 patches, all `low`:
  - `CopyStatus` moved beside `locationFor`, which removes the type cycle.
  - `removeCopies` checks ownership with `count`.
  - The FR-48 comments are reworded: the filter is explicit as well as through `ownerAccess`.
  - The test helper is renamed to `newLocation`.
- 0 deferred.
- 7 rejected as `low`:
  - `TOO_LONG` for an over-long note. It is rare, and it belongs to the note editor's story.
  - Owned on an already-owned copy goes to the default location. This is the AC's literal rule, and callers send sparse edits. Raised three times.
  - A double remove fails with `NOT_FOUND`.
  - A note of only zero-width characters is stored rather than cleared.
  - A NaN id gives `INTERNAL`, not `NOT_FOUND`. Input shape is validated at the action boundary.
- 9 rejected as `false`:
  - The names and the file name come from the AC.
  - The status markers differ only until the commit (raised twice).
  - No UI was expected: this is a developer story.
  - A location set through status is required by the AC.
  - Storing an empty note as `null` follows the project's convention.
  - The rollback path is already pinned by `transaction.int.spec.ts`.
  - The admin case is already pinned by `copies.int.spec.ts:89`.
  - Loans arrive in Epic 6.

**Follow-up review recommended:** false. Patched entries by verdict: high 0, medium 0, low 4.

**Verification:** run against this worktree's own Postgres (`bookeh-postgres-4-5`, port 5433).
- `npm run typecheck`: clean.
- `npm run lint`: 0 errors. All 36 warnings are pre-existing and in untouched files.
- `npm run test:unit`: 690 passed.
- `npm run test:int`: 44 files, 429 tests passed, including `copyWrites` (5) and the unchanged `createCopy` (14).
- Every row of the matrix is covered by a test that ran. The empty-list case and an explicit decomposed-accent NFC input were added in step 3.

**Residual risks:**
- `setStatus(owned)` with no location always moves the copy to the default location, even when it was already owned. 4.9 must send a status only when it changes.
- An over-long note fails as `VALIDATION` on `notes`, not `TOO_LONG`, until the note editor's story adds a message for it.
- Ids are not checked for shape here. Server actions must validate them.
