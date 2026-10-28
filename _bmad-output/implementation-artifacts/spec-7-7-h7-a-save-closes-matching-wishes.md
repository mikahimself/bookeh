---
title: '7.7 [H7] A save closes matching wishes'
type: 'feature'
created: '2026-10-28'
status: 'done'
baseline_revision: '6b0fa09e9d5faf2485f1ecb7104fd8079da6528a'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Add to library leaves the user's own open wishes for the Book open, so the list keeps wishing for a Book that is on the shelf (FR-28, AD-18). And a private-Book merge (a save of Story 3.39, Look it up again of Story 5.35) refuses while an entry still references the private Book, so a Book that is only wished for can never be shared (7.6's deferred item).

**Approach:** Two new functions in `src/lib/wishlists/entries.ts`. `closeEntriesForBook(ctx, bookId)` closes the user's open entries for the Book with no recipient and returns their restore; `saveCopy`'s place step calls it before `createCopy()` and folds its restore into the save's. `moveEntriesToBook(ctx, fromBookId, toBookId)` re-points the user's entries; `merge()` in `sharePrivateBook.ts` calls it beside `moveCopiesToBook()`, before the "still referenced" check.

## Boundaries & Constraints

**Always:**
- `closeEntriesForBook(ctx, bookId): Promise<Undone<number[]>>` (the closed ids): one `withTransaction` joining the caller's; finds entries with `owner = ctx.user.id`, `book = bookId`, `forPerson` empty, `closedAt` empty (explicit owner filter as `moveCopiesToBook`, so the admin is held to their own); sets `closedAt` to one `new Date().toISOString()` through `gateway.updateByID`, one after the other (AD-16). Restore: for each closed id still present (one `find` with `id in ids`, as the restoring user), `closedAt: null`; a gone entry is skipped (AD-20). It closes over the ids only.
- `saveOwnedCopy` (in `saveCopy.ts`): `closeEntriesForBook()` then `createCopy()`, same transaction; restore runs the copy's restore first (its `UNDO_FAILED` on a lent copy aborts before any reopen), then the entries'. Every `saveCopy` target closes: `{ isbn13 }` (new, held, promoted or merged Book), `{ bookId }`, `{ manual }`.
- `moveEntriesToBook(ctx, fromBookId, toBookId): Promise<number>`: shape of `moveCopiesToBook()` — `withTransaction`, explicit owner filter, every entry open or closed, `updateByID` `{ book: toBookId }` one by one, returns the count. `forPerson`, `wishlist`, `closedAt` unchanged.
- `merge()` calls it right after `moveCopiesToBook()`. A merge inside `saveCopy` then closes the moved own entries on the shared Book (place step runs after `settleHeldBook()`); `lookupAgain()` moves them and closes nothing. A merge is not undone, so a save's Undo reopens closed entries on the shared Book and leaves them there.
- Doc comments in the existing style: `saveCopy`'s gains the closing and its Undo; `settleHeldBook`/`merge` say copies, entries and row move; both new functions name AD-18 (and AD-5 for the move). `WishlistEntries.ts` comment: drop the private-Book-merge exception (the move is now `lib/wishlists`'s).
- Spine in this commit: source-tree `wishlists/` line gains `closeEntriesForBook, moveEntriesToBook`. (AD-5, AD-11 and AD-18 already state the behaviour.)

**Never:**
- No action, screen, toast, i18n string, migration or collection field change. `saveCopy`'s result shape stays (`SaveResult`).
- `saveEntry` never closes entries. No `closeEntry` / Bought / Ordered (7.8), no recipient service (7.9).
- No write to another user's entry; no `wishlist-entries` write outside `lib/wishlists`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Closes own | A has open own entries for Book X on lists L1 and L2; `saveCopy` `{ isbn13 }` of X | copy created; both entries `closedAt` set | — |
| Leaves others | also: A's entry for Person P on X, A's already-closed entry on X (closedAt t0), A's open entry for Book Y, B's open own entry on X | P's stays open; closed keeps t0; Y's and B's open | — |
| By id | X held only through A's open own entry; `saveCopy` `{ bookId: X }` | copy created; entry closed | — |
| Undo | undo the "Closes own" save | copy gone; L1/L2 entries open again; P, t0, Y, B as before | — |
| Undo, entry gone | close via save, then entry deleted, then undo | undo succeeds; copy gone | — |
| Undo, lent | save, lend the copy, undo | entries stay closed, copy stays | `UNDO_FAILED` |
| Merge on save | A's private Book X' (ISBN I) held only by A's own entry and A's entry for P; shared Book S with I; `saveCopy` `{ isbn13: I }` | X' gone; both entries on S; own closed, P's open; copy on S | — |
| Merge on Look it up again | A's private Book X' with a copy and an own open entry; shared S with its ISBN; `lookupAgain` | X' gone; copy and entry on S; entry still open | — |

</intent-contract>

## Code Map

- `src/lib/wishlists/entries.ts` -- `createEntry`, `deleteEntry` (count-first pattern), local `Named`. Add both functions here.
- `src/lib/copies/moveCopiesToBook.ts` -- golden pattern for `moveEntriesToBook` (owner filter, `select`, sequential `updateByID`).
- `src/lib/catalogue/saveCopy.ts:268-284` `saveOwnedCopy` -- add the close before `createCopy`, compose restores. `:44-120` `saveCopy` doc -- add a closing paragraph and the reopen in the Undo paragraph. `:127-141` `saveEntry` doc already says it never closes an entry; keep.
- `src/lib/catalogue/sharePrivateBook.ts:263-273` `merge()` -- `moveEntriesToBook(tx, ownId, sharedId)` after `moveCopiesToBook`. `:81-117` `settleHeldBook` doc ("its copies and `user-books` row move"), `:258-262` `merge` doc.
- `src/lib/catalogue/lookupAgain.ts` -- unchanged; goes through `settleHeldBook()`.
- `src/collections/WishlistEntries.ts:18-20` -- comment only.
- `eslint.config.mjs:23` -- `catalogue` may import `wishlists`; no change.
- `src/lib/undo/undo.ts:78` -- `undo()` runs the restore in one transaction; a throw rolls all of it back.
- `tests/int/saveEntry.int.spec.ts` -- harness for entries: `saveEntry` with `{ manual }`/`{ bookId }`, wishlist creation by `{ create }`, `undo`.
- `tests/int/holdings.int.spec.ts:212-219` -- `entryOfA`: creating an entry with `forPerson` through `gateway.create` (tests may write directly; no service sets a recipient yet). People: `gateway.create` on `people`.
- `tests/int/sharePrivateBook.int.spec.ts:133-164` -- `freshUser`, `privateBook`, `sharedBook`, `isbnInput`; `:449-477` merge test to mirror. `afterEach` asserts `lookupSources` not called.
- `tests/int/lookupAgain.int.spec.ts:63-109,144-159` -- `setup`, `sharedBook`, merge test to mirror.
- `tests/int/saveCopy.int.spec.ts:678-` -- undo section pattern; loans for the lent case: see how `UNDO_FAILED` on a lent copy is tested there (grep `UNDO_FAILED`).
- `ARCHITECTURE-SPINE.md:601` -- `wishlists/` source-tree line.

## Tasks & Acceptance

**Execution:**
- `src/lib/wishlists/entries.ts` -- add `closeEntriesForBook` and `moveEntriesToBook` with doc comments.
- `src/lib/catalogue/saveCopy.ts` -- close in `saveOwnedCopy`, composed restore; doc comment.
- `src/lib/catalogue/sharePrivateBook.ts` -- move entries in `merge()`; doc comments.
- `src/collections/WishlistEntries.ts` -- comment.
- `tests/int/saveClosesEntries.int.spec.ts` -- new: matrix rows Closes own + Leaves others (one test), By id, Undo, Undo entry gone, Undo lent.
- `tests/int/sharePrivateBook.int.spec.ts` -- add the "Merge on save" test.
- `tests/int/lookupAgain.int.spec.ts` -- add the "Merge on Look it up again" test.
- `ARCHITECTURE-SPINE.md` -- the source-tree line.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `7-7-h7-a-save-closes-matching-wishes: done` when done.

**Acceptance Criteria:**
- Given my open entries for a Book with no recipient, when `saveCopy` runs for that Book, then before creating the copy, in the same transaction, they are closed; entries for a Person, closed entries, other Books' and other users' entries are unchanged.
- Given that save, when its Undo runs, then the copy is deleted and the entries it closed are open again; an integration test undoes it.
- Given my private Book referenced by my entries and a shared Book with its ISBN, when an `{ isbn13 }` save or Look it up again merges them, then my entries move to the shared Book first and the merge succeeds; an integration test covers each path.
- Given the existing `saveCopy`, `saveEntry`, `sharePrivateBook` and `lookupAgain` suites, when run, then they pass.

## Spec Change Log

## Review Triage Log

### 2026-10-28 — Review pass
- verdicts: 20 findings — high 0, medium 0, low 14, false 6, maybe-false 0
- findings:
  - `[low]` `[reject]` Edge: undo of save 1 reopens wishes while a later save's copy of the same Book is still on the shelf — real, but needs two copies saved and the older toast's Undo used; the fix is a copy-count guard in the restore, against the AC's literal "reopens the entries it closed".
  - `[false]` `[reject]` Edge: Undo clears a later, unrelated close of the entry — nothing can close an already-closed entry (`closeEntriesForBook` finds open ones only; `closeEntry` is 7.8), so `closedAt` cannot change after the save.
  - `[low]` `[reject]` Edge: two concurrent saves of one Book can both record the same entries — needs the same user saving one Book from two devices within one transaction's span; the fix is row locks or conditional updates, extra complexity for a race not met in use.
  - `[false]` `[reject]` Intent: user-facing surface (toast, wishlist screen) not exercised — the AC is service-level; the existing action and toast Undo reach `saveCopy`/`undo()` unchanged, screens are 7.10+.
  - `[low]` `[patch]` Intent: no test that a failed save leaves the entries open (AC1 "same transaction", AD-16) — added a test in `saveClosesEntries.int.spec.ts`: `createCopy` fails once after checking inside the save's transaction that the entry is closed; afterwards the entry is open and no copy exists. (A first version made the Book unreadable, which failed inside `closeEntriesForBook` itself and proved nothing; replaced.)
  - `[low]` `[reject]` Intent: Undo after a merge-on-save not tested — the restore is the same `saveOwnedCopy` restore covered by the Undo tests; no criterion names it.
  - `[low]` `[reject]` Intent: admin case not tested — the explicit owner filter mirrors `moveCopiesToBook`; no criterion names the admin.
  - `[false]` `[reject]` Intent: Received and other owned-copy paths don't close wishes — the intent names `saveCopy` as the trigger; spine AD-11/AD-18 say the same.
  - `[low]` `[patch]` Intent: test title "…, before the copy" claims an order it doesn't check — title shortened.
  - `[false]` `[reject]` Intent: "move first" ordering not shown by the tests — if the move ran after `isUnreferenced()` the merge would throw, so both merge tests fail without the order.
  - `[low]` `[patch]` Blind: EXPERIENCE.md Undo row for Add to library doesn't say Undo reopens ticked-off wishes — sentence appended to the row (FR-28).
  - `[low]` `[patch]` Blind: spine AD-18 doesn't name `moveEntriesToBook()` as an entry writer — one sentence added to the AD-18 bullet.
  - `[low]` `[patch]` Blind: AC1's same-transaction clause has no test — same root cause and patch as the Intent rollback finding.
  - `[low]` `[patch]` Blind: docs credit the restore order for a lent copy's Undo leaving entries closed, but `undo()`'s rollback is what does it — `saveCopy` and `saveOwnedCopy` doc comments reworded to credit the rollback.
  - `[low]` `[reject]` Blind: concurrent saves can claim the same entries — same as the Edge race finding, rejected on the same grounds.
  - `[low]` `[reject]` Blind: Undo after a merge-on-save untested — same as the Intent finding, rejected on the same grounds.
  - `[low]` `[reject]` Blind: no test moves a closed entry on a merge — the move has no `closedAt` filter, and no criterion names closed entries.
  - `[low]` `[patch]` Blind: `settleHeldBook` doc comment left past 100 columns by a partial reflow — bullet rewrapped.
  - `[false]` `[reject]` Blind: status fields disagree and changes are uncommitted — the run was mid-review; statuses and the commit are set at finalize.
  - `[false]` `[reject]` Blind: the user isn't told a wish was ticked off — the toasts are fixed by EXPERIENCE.md ("Saved to {location} · Edit · Undo"); no story asks for feedback on closing.

## Design Notes

**Restore order.** The copy's restore runs first: on a lent copy it throws `UNDO_FAILED` and the undo transaction rolls back, so no entry is reopened while the copy stays. `createCopy()` writes no `user-books` row, so reopening has no row rule to respect.

**Merge then close.** `settleHeldBook()` runs before the place step, so moved own entries are closed on the shared Book in the same save; one Undo reopens them there (the merge itself stays, as AD-5 says).

## Verification

**Commands:**
- `npx tsc --noEmit --incremental false` -- expected: clean.
- `npm run lint` -- expected: 0 errors.
- `npm run test:reset && npm run test:int` -- expected: all pass, including the new and extended suites.

## Auto Run Result

**Summary.** Add to library now ticks off the user's own wishes (FR-28, AD-18). `saveCopy`'s place step calls the new `closeEntriesForBook()` in `lib/wishlists` before `createCopy()`, in the save's transaction, for every target. It closes the user's open entries for the Book that have no recipient. Entries for a Person, closed entries, other Books' entries and other users' entries stay as they were. The save's Undo deletes the copy and reopens the entries it closed that still exist. A lent copy fails the Undo with `UNDO_FAILED` and nothing changes. A private-Book merge (save, Story 3.39; Look it up again, Story 5.35) moves the user's entries to the shared Book through the new `moveEntriesToBook()` before the "still referenced" check, which settles 7.6's deferred item. On a save, the moved own entries are then closed on the shared Book. Look it up again only moves them.

**Files changed.**
- `src/lib/wishlists/entries.ts` -- `closeEntriesForBook` (with its reopen restore) and `moveEntriesToBook`.
- `src/lib/catalogue/saveCopy.ts` -- `saveOwnedCopy` closes first and composes the restores; doc comments.
- `src/lib/catalogue/sharePrivateBook.ts` -- `merge()` moves entries; doc comments.
- `src/collections/WishlistEntries.ts` -- the writer comment no longer lists a merge exception.
- `tests/int/saveClosesEntries.int.spec.ts` -- new: 6 tests (closes own and leaves the rest, by id, rollback on a failed copy, Undo, Undo with an entry gone, Undo of a lent copy).
- `tests/int/sharePrivateBook.int.spec.ts`, `tests/int/lookupAgain.int.spec.ts` -- one merge test each.
- `ARCHITECTURE-SPINE.md` -- `wishlists/` source-tree line; AD-18 names `moveEntriesToBook()`.
- `EXPERIENCE.md` -- the Add to library Undo row says Undo also reopens ticked-off wishes.
- `sprint-status.yaml` -- 7.7 done.

**Review.** One pass, 20 findings (low 14, false 6). Patched 6 low entries:
- a rollback test for the same-transaction close;
- a test title that claimed an order it didn't check;
- the docs now credit `undo()`'s rollback, not the restore order;
- a doc-comment rewrap;
- the EXPERIENCE.md Undo row;
- the spine's AD-18 sentence.

The first rollback test the subagent wrote was vacuous: making the Book unreadable failed inside `closeEntriesForBook` itself. A probe caught this, and the test now fails `createCopy` once, after checking inside the transaction that the entry is closed.

Rejected, with reasons in the triage log:
- Undo reopening wishes while a later copy exists (rare; needs a guard against the AC's wording);
- concurrent-save races (rare; would need locking);
- test-only asks with no named criterion (Undo after a merge, admin, a closed entry moving);
- the false ones (re-close, UI surface, Received, ordering, statuses, toast feedback).

Nothing deferred.

**Follow-up review:** not recommended. Patched entries this pass: high 0, medium 0, low 6.

**Verification.** After implementation and again after the patches:
- `npm run typecheck` (`next typegen` + `tsc`): clean.
- `npm run lint`: 0 errors (56 existing warnings).
- Prettier on the touched files: clean.
- `npm run test:reset && npm run test:int`: 640 passed (76 files).

In the subagent's own earlier full run, the `shelfTiming` benchmark failed once and passed on rerun. Matrix audit: all 8 rows are covered by passing tests.

**Residual risks.**
- An Undo of an earlier save reopens its wishes even when a later save's copy of the same Book still exists.
- Two concurrent saves of one Book by one user can both record the same closed entries.
- `closeEntriesForBook` re-validates `book` on update. For a Book the user can no longer read (a shared Book the admin made private), a save with an open own entry now fails there with a `ValidationError` on `book`, not in `createCopy()`. The save fails either way, with nothing written.
- The run was built in a cloud session and carried over to the local workspace by hand; it lands as one local commit.
