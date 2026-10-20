---
title: 'Story 3.39: [D8] Share my private Book when a source knows it'
type: 'feature'
created: '2026-10-20'
baseline_revision: '11dd58d2ed652f227b4c61d797c00ba92a1ddf45'
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

**Problem:** A private Book (3.38) stays private forever. FR-12 and AD-5 say that the creator's next save of it shares it once a source knows its ISBN, and that it joins an existing shared Book with that ISBN when there is one.

**Approach:** The `{ isbn13 }` save resolves the Book it holds inside its transaction through a new `lib/catalogue` module. When the user's own private Book is the held Book and the in-process cache holds a `found` outcome, the module promotes the Book in place. When a shared Book exists and the user also has a private Book with that ISBN, the module merges the private Book into the shared one. In both cases the differing hand-entered values become the user's overrides; for an admin they are dropped. The copy is then created as before.

## Boundaries & Constraints

**Always:**
- `lib/metadata/lookup.ts` gains `heldOutcome(isbn13): SourcesOutcome | undefined`. It is the cache entry, or `undefined` on a miss or an expired entry, and it never calls a source. Only `found` and `none` are ever cached.
- `covers.ts`: the fetch-and-write half of `downloadCover()` becomes an exported `storeCover(ctx, isbn13, coverUrl, policy)`. `downloadCover()` calls it, and its behaviour does not change.
- New `src/lib/catalogue/sharePrivateBook.ts`:
  - `prepareShare(ctx, isbn13, held)`, before the transaction. It returns `undefined` unless `held` is private and `heldOutcome()` is `found`. Otherwise it returns `{ candidate: candidates[0], raw, cover? }`. `cover` comes from `storeCover()`, and only when the Book has no cover and the candidate has a `coverUrl`. It never calls `lookupSources`.
  - `settleHeldBook(tx, isbn13, pending?)`, inside the save's transaction. It returns the id of the Book the copy goes on. It registers the cover's discard on rollback, then re-reads `findBookByIsbn(tx, isbn13)`:
    - Shared: merge the user's own private Book with that ISBN into it, if there is one, and discard the cover.
    - The user's private Book with `pending`: promote it.
    - The user's private Book without `pending`: return its id unchanged.
    - None: `DomainError('NOT_FOUND')`.
  - **Promote.** The row keeps its id and is updated with system privileges:
    - Each overridable field becomes the candidate's value, or `null` when the candidate has none.
    - `authors` and `series` are matched or created by `findOrCreateByName(tx, …, 'shared', …)` with the candidate's `sortName`, as in `ensureSharedBook`.
    - `themes`, `genres` (`mapSubjectsToGenres(tx, raw)`), `source` and `rawMetadata` are written. `cover` is set only when the Book had none and a cover was stored.
    - `visibility: 'shared'`. The `visibility` hook clears `createdBy`.
  - **Merge** (private P into shared S): move the user's copies of P to S (`lib/copies`), merge the user's `user-books` row (`lib/books`), then delete P with `deleteRow()`.
  - **Overrides.** Compare P's values before the write with the target's: the candidate when promoting, S when merging. A field P has a value for differs when the target's value is absent or not equal:
    - Text and number fields: exact equality.
    - `authors`: the ordered list of `toNameKey(name)`.
    - `series`: `toNameKey(name)`.
  - A non-admin (`isAdmin` from `@/access/roles`) gets each differing field as an override, written through `upsertUserBook()` after the Book is shared. `authors` and `series` keep P's own ids. An admin gets none.
- New `moveCopies(ctx, fromBookId, toBookId)` in `src/lib/copies/`. It moves the viewer's own copies of one Book to another through the gateway, with an explicit `owner` filter.
- New `mergeUserBook(ctx, fromBookId, toBookId, overrides)` in `src/lib/books/upsertUserBook.ts`, the module that writes `user-books`:
  - Without a row on the target, the viewer's row on `from` is re-pointed to it.
  - With a row on both, the target's row stays. It takes `read: true` if either row has it, and the moved row's `rating` and `ratedAt` when it has no rating. The `from` row is then deleted.
  - `overrides` are then written only for fields the target row does not already override.
- `saveCopy` `{ isbn13 }` path: no held Book means `ensureSharedBook` as now. A held Book means `prepareShare` before `withUndo`, then `settleHeldBook` and `saveOwnedCopy(tx, id, undefined)` inside it, so the restore deletes only the copy.
- Doc comments cite FR-12, AD-4, AD-5, AD-11 and D-8. `saveCopy`'s doc describes the share and the merge.

**Never:**
- No call to `lookupSources`, `fetch` for anything but the cover, or the sources from any save path added here.
- Another user's private Book, row or copy is never read, changed or deleted.
- No `pick` (3.53), no `lookupAgain` (5.35), no wishlist entries (7.7), no UI.
- No change to the `{ manual }` path, any collection, migration, `payload-types.ts`, `findOrCreateByName`, `ensureSharedBook` or `createCopy`.
- Leftover private authors, series or a private cover of P are not cleaned up.

## I/O & Edge-Case Matrix

All rows are A's `saveCopy(A, { isbn13: X })`, with `lookupSources` mocked and asserted never called.

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Promote | A (non-admin) owns private P with X: title `T1`, author `aleksis kivi`, 1 copy. `heldOutcome` `found`: title `T2`, author `Aleksis Kivi`, series `S`, cover URL | P keeps its id. It now has title `T2`, a shared author and series, `source`, `rawMetadata`, a cover, `visibility` shared and no `createdBy`. A has 2 copies of P. A's row: `overridden` `['title']`, title `T1`; authors are not overridden (same key) | No error expected |
| Admin promote | The same, as admin | The same Book; no override written | No error expected |
| Field the source lacks | P has a `publisher`; the candidate has none | P's `publisher` is null; A's row overrides `publisher` with P's value | No error expected |
| Not held | `heldOutcome` returns `undefined` or `none` | The copy goes on P; P stays private and unchanged; no `fetch` | No error expected |
| Merge | Shared S with X exists, and A's private P with X has 1 copy and a row (`read: true`) | A's old copy and row are on S, P is deleted, and the new copy is on S. Differing values are overrides on S (none for an admin). Works with or without `heldOutcome` | No error expected |
| Merge, both rows | A has rows on both P (`read: true`, `rating: 4`) and S (`rating: 2`, title overridden) | One row on S: `read: true`, `rating: 2`, title override kept | No error expected |
| Other users | B has private P_B with X, and B's copy of P_B | P_B and its copy are untouched by A's promote and A's merge | No error expected |
| Undo | `undo()` with the token after a promote or a merge | Only the new copy is deleted. The Book stays shared; the moved copies, the row and the overrides stay | No error expected |
| Rollback | Promote whose copy insert fails (a broken default location) | P is still private with its old values; no override row; the cover file is removed | The copy's `ValidationError` |

</intent-contract>

## Code Map

- `src/lib/catalogue/saveCopy.ts:77-91`: the `{ isbn13 }` path to rewire. `held` is read at line 80. `saveOwnedCopy(tx, bookId, book)` already takes `undefined` for an existing Book.
- `src/lib/catalogue/ensureSharedBook.ts:84-135`: the precedent for the promote write. It covers the shared author and series matching with `sortName`, `mapSubjectsToGenres`, `attachCover`, the `system` options and `assertLive`. `deleteRow()` at line 141 is reused for P.
- `src/lib/catalogue/covers.ts:168-237`: `downloadCover()`. Split it after `coverUrl` is known (line 195). `attachCover`/`discardCover` at 240/254. `onRollback` comes from `@/lib/payload/transaction`.
- `src/lib/metadata/lookup.ts:29-38`: `cached()`, wrapped by `heldOutcome()`.
- `src/lib/catalogue/findBookByIsbn.ts`: shared first, then the user's own private Book.
- `src/lib/books/upsertUserBook.ts`: `BookOverrides` and the `user-books` writer. It checks `visibility: shared` before writing overrides, so write them after the promote update. The `(owner, book)` index is unique.
- `src/lib/copies/createCopy.ts`: the gateway style for `moveCopies`. `ownerAccess` scopes it to the owner for the admin too.
- `src/fields/bookFields.ts:6`: `OVERRIDABLE_BOOK_FIELDS`. `src/fields/nameKey.ts`: `toNameKey`. `src/fields/visibility.ts`: promotion clears `createdBy`.
- `src/access/roles.ts:13`: `isAdmin(user)`. The lint rule forbids reading `roles` directly.
- Tests:
  - `tests/int/saveCopy.int.spec.ts` and `tests/int/createPrivateBook.int.spec.ts` mock `@/lib/metadata/lookup` as `{ lookupSources }` only. Add `heldOutcome: vi.fn()`, or every held private Book save throws.
  - Fixtures: `found()`, `fetchSpy`, `booksWithIsbn`, `copiesOf`, the broken-default rollback with `rejectedPaths`, `undo`.
  - Harness: `createUser`/`contextFor` in `tests/helpers/harness.ts`; an admin is created with the `roles` option there.
- `tests/unit/lookup.unit.spec.ts`: where `heldOutcome` gets its unit test.

## Tasks & Acceptance

**Execution:**
- `src/lib/metadata/lookup.ts` -- add `heldOutcome()` -- AD-5's server-held outcome without a source call.
- `src/lib/catalogue/covers.ts` -- extract `storeCover()` -- the share downloads from the held candidate's URL.
- `src/lib/copies/moveCopies.ts` -- new `moveCopies()` -- the merge moves copies (AD-5, AD-18).
- `src/lib/books/upsertUserBook.ts` -- add `mergeUserBook()` -- the row moves, and `lib/books` stays its only writer (AD-6).
- `src/lib/catalogue/sharePrivateBook.ts` -- new: `prepareShare`, `settleHeldBook`, promote, merge, overrides -- FR-12, AD-5, D-8.
- `src/lib/catalogue/saveCopy.ts` -- wire the held-Book path and update the doc -- AD-11.
- `tests/unit/lookup.unit.spec.ts` -- `heldOutcome`: a miss returns `undefined` with no source call; after a cached `found`, it returns it.
- `tests/int/sharePrivateBook.int.spec.ts` -- new: one test per matrix row, through `saveCopy`; private Books are made with the manual save.
- `tests/int/saveCopy.int.spec.ts`, `tests/int/createPrivateBook.int.spec.ts` -- add `heldOutcome` to the module mock.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- set `3-39-d8-share-my-private-book-when-a-source-knows-it` to its final status.

**Acceptance Criteria:**
- Given `npx eslint src tests`, `npx tsc --noEmit`, `npm run test:unit` and `npm run test:int`, when they run, then all pass with 0 lint errors.
- Given `git diff --stat 11dd58d2ed652f227b4c61d797c00ba92a1ddf45 -- src/collections src/migrations src/payload-types.ts`, when it runs, then it is empty.

## Spec Change Log

## Review Triage Log

### 2026-10-20 — Review pass
- verdicts: 25 findings — high 0, medium 0, low 18, false 7, maybe-false 0
- findings:
  - `[low]` `[reject]` blind: promote keeps the private Book's own cover, which then becomes shared. Today only the admin can set a private Book's cover (back office), so this cannot happen in everyday use. User uploads on private Books arrive with D-4 (Epic 4), whose stories must decide it. The fix flips a spec'd rule. Recorded under residual risks.
  - `[low]` `[reject]` blind: promote overwrites the creator's genre picks. Private Books get no genres until `editBook()` (Epic 4), so it is unreachable today. Recorded under residual risks.
  - `[low]` `[reject]` blind: the merge deletes P without `isUnreferenced()`. `copies.book_id` and `user_books.book_id` are `NOT NULL`, so a reference left behind makes the delete fail and the save roll back; nothing is corrupted. That needs either a concurrent same-user save or an admin's back-office copy on a user's private Book. The fix adds a guard.
  - `[low]` `[reject]` blind: `mergeUserBook` keeps the target's rating instead of the newer one (PRD FR-46). FR-46's rule is for the admin's merge, which Phase 1 does not build. Rows on both Books arise only from the 3.38 race. The fix edits this build's intent contract ("the moved row's `rating` … when it has no rating"). Recorded under residual risks.
  - `[low]` `[patch]` blind: the rating carry-over branch has no test. Same root as the first verification-gap row; the same test.
  - `[low]` `[reject]` blind: exact text equality turns a whitespace-only difference (a double space in a MARC title) into a permanent override. Adapters already trim and NFC-normalise, so it needs an internal double space in the source. The fix replaces the intent contract's "exact equality", so it is an edit to this build's spec. Recorded under residual risks.
  - `[low]` `[reject]` blind: `ownPrivateBook()` adds a query that `findBookByIsbn` already made. It is one indexed read per save, and the fix widens the shared `HeldBook` type.
  - `[low]` `[reject]` blind: a Book deleted between the read and the transaction gives `NOT_FOUND`. That needs a concurrent Undo of the manual save in another tab; the fix adds a branch.
  - `[low]` `[reject]` blind: the manual save's earlier Undo receipt, used after a promote and its Undo, deletes the now-shared Book when nothing references it, leaving shared authors and the cover row. That needs manual entry, a source finding the ISBN, and two Undos, all within 30 minutes. The deleted Book is unreferenced, and the fix adds a guard to `createPrivateBook`'s restore.
  - `[low]` `[reject]` blind: two concurrent promotes of one Book orphan a cover. That needs two presses with different `requestId`s at the same instant; the fix adds locking.
  - `[low]` `[patch]` blind: the promote `it.each`'s `expected` column is used only for its length. Replaced with a boolean.
  - `[low]` `[reject]` blind: the branch where a private Book already has a cover is untested. It is unreachable for users today (first row), and the finding gives no failure it would catch now.
  - `[false]` `[reject]` blind: `own.series != null` in `differing()` is redundant. It narrows the type for `idOf(own.series)`; tsc needs it.
  - `[low]` `[patch]` blind: the `saveCopy` Undo paragraph is ragged after the re-wrap. Reflowed.
  - `[low]` `[patch]` blind: the `heldOutcome` doc omits that a hit refreshes recency. One clause added.
  - `[false]` `[reject]` edge: an admin's copy or row on P is nulled by the delete. `book_id` is `NOT NULL`, so the delete fails and the transaction rolls back instead (see the third row).
  - `[low]` `[reject]` edge: a shared Book created concurrently between the re-read and the promote surfaces as the unique index's `ValidationError`, not a merge. A lost race surfacing as `ValidationError` is accepted under AD-19, as in `ensureSharedBook`; the fix adds a catch and a retry.
  - `[low]` `[reject]` edge: the stale manual-save receipt deletes the shared Book. Same root as the blind Undo-receipt row.
  - `[low]` `[patch]` verification-gap: `mergeUserBook`'s rating carry-over is untested. Added a test: private row rated, shared row unrated, and the surviving row takes the private row's `rating` and `ratedAt`.
  - `[low]` `[patch]` verification-gap: `ownPrivateBook`'s `createdBy` filter is untested on the admin path. Added an admin merge case beside B's private Book; B's Book, copy and rows are unchanged.
  - `[false]` `[reject]` intent: the Book takes `candidates[0]`, not "the candidate the Answer picked". The Answer for a held Book is `existing` (AD-9) and offers no pick, so D-7's preselection, the best candidate, is the pick. `pick` reaches the save in 3.53.
  - `[false]` `[reject]` intent: the merge runs without a held outcome. An existing shared Book proves a source knew the ISBN, and the merge uses no source value. The AC says what happens when its Given holds and does not restrict other cases (Design Notes).
  - `[false]` `[reject]` intent: the admin loses hand-entered values the source lacks. That is D-8 as written: "for the admin, the hand-entered values that differ are dropped (later fixes on Edit book go to the shared record)".
  - `[false]` `[reject]` intent: the change is service level, tests mock `heldOutcome`, and the cache is not per user. D8 is a Service story in STORY-SLICING; the Answer and Add to library are 3.46 and 3.48. AD-5 holds the outcome "for that ISBN", not per user. `lookupBook` filling the cache is 3.28's tested behaviour.
  - `[false]` `[reject]` intent: Undo keeps the moved copies, the row and the overrides. This matches AD-11: "After an auto-share it removes the copy and leaves the Book shared".

## Design Notes

**Why the merge needs no held outcome.** A shared Book exists only because a source once found the ISBN, so the AC's precondition already holds. Making the merge wait on the cache would leave it to the cache's lifetime. The merge reads no source value: the shared Book's values are the target.

**Why only `candidates[0]`.** The Answer for a Book the user holds is `existing` (In library), with nothing to pick. `pick` reaches the save in 3.53, which threads it through `prepareShare` as it does `ensureSharedBook`.

**Why a field the source lacks is cleared.** "Takes the values of the candidate" (AC). Keeping the hand-entered value would put client text on a shared Book (AD-5). A non-admin keeps it as an override; an admin's is dropped (D-8) and is fixed on Edit book.

**Manual path.** Manual entry is offered only after a `none` Answer, so a manual save meets a held private Book with `found`, or a shadowed private Book, only in a race. It stays as in 3.38.

## Verification

**Commands:**
- `npx eslint src tests` -- expected: 0 errors.
- `npx tsc --noEmit` -- expected: clean.
- `npm run test:unit` -- expected: all pass.
- `npm run test:int` -- expected: all pass, against Postgres on `localhost:5432` (`.env`).

## Auto Run Result

**Summary.** The creator's next `{ isbn13 }` save of a private Book now shares it (FR-12, AD-5, D-8):
- **Promote:** when the in-process cache holds a `found` outcome for the ISBN (`heldOutcome()`, never a source call), the private Book keeps its id and takes the best candidate's values.
  - Authors and series are matched or created among shared rows. Genres, themes, `source` and `rawMetadata` are written, and the candidate's cover is set when the Book has none.
  - `visibility` becomes shared and `createdBy` clears.
- **Merge:** when a shared Book with the ISBN exists and the user also has a private one, the user's copies and `user-books` row move to the shared Book, and the private Book is deleted.
- **Overrides:** in both cases, hand-entered values that differ from the target become the user's overrides, keeping the private Book's own author and series ids. An admin's are dropped.
- **Undo:** an Undo of the save deletes only the new copy; the Book stays shared.

**Files changed.**
- `src/lib/metadata/lookup.ts`: `heldOutcome()`, a cache-only read.
- `src/lib/catalogue/covers.ts`: `storeCover()` split out of `downloadCover()`, which behaves as before.
- `src/lib/catalogue/sharePrivateBook.ts`: new. `prepareShare()` (before the transaction), `settleHeldBook()` (inside it), promote, merge and the override comparison.
- `src/lib/copies/moveCopies.ts`: new. Moves the viewer's own copies between Books.
- `src/lib/books/upsertUserBook.ts`: `mergeUserBook()`, which re-points or folds the viewer's row and writes the overrides.
- `src/lib/catalogue/saveCopy.ts`: the held-Book path goes through `settleHeldBook()`; doc comment updated.
- `tests/int/sharePrivateBook.int.spec.ts`: new, 16 tests covering every matrix row.
- `tests/unit/lookup.unit.spec.ts`: 2 `heldOutcome` tests.
- `tests/int/saveCopy.int.spec.ts`, `tests/int/createPrivateBook.int.spec.ts`: `heldOutcome` added to the module mock.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: 3.39 is done.

**Review.** 25 findings: low 18, false 7.

Patched (all low):
- Two missing tests: the rating carry-over in `mergeUserBook` (2 rows), and the admin merge beside another user's private Book. Each was checked to fail with the code it guards removed.
- The promote test table's boolean column.
- The `heldOutcome` doc clause.
- The `saveCopy` doc reflow.

Deferred: none.

Rejected:
- Low (12):
  - A private cover or genres carried onto the shared Book (2). Unreachable until Epic 4.
  - Delete without `isUnreferenced` (1). `NOT NULL` makes it roll back.
  - The newest rating per FR-46, and normalised text comparison (2). Each fix edits the intent contract.
  - An extra query, `NOT_FOUND` mid-save, the stale manual Undo receipt (2 rows), concurrent promotes, and a concurrent shared create (AD-19) (6). All are rare races; each fix adds guards.
  - The untested cover-kept branch (1). Unreachable for users today.
- False (7): the redundant check, FK nulling, and five intent rows settled by D-7, D-8, AD-5, AD-11 and the slicing.

**Follow-up review:** not recommended. Patched entries: high 0, medium 0, low 6.

**Verification.** Run on `main`, Postgres on `localhost:5432`:
- `npx eslint src tests`: 0 errors (36 warnings, already present).
- `npx tsc --noEmit`: clean. Prettier: clean.
- `npm run test:unit`: 554 passed. In one earlier run, `scanScreen.unit.spec.ts` timed out under load, as in 3.36 and 3.38. It passed alone and in the next full run.
- `npm run test:int`: 353 passed, 1 skipped. `sharePrivateBook` 16/16.
- No change under `src/collections`, `src/migrations` or `payload-types.ts`.
- Story 3.40 (`23a166b`) was committed on `main` during the run, so the review diff was taken against HEAD and holds this story's changes only. `npm install` was run to pick up its `@base-ui/react` dependency; the lockfile is unchanged.

**Residual risks.**
- **Epic 4 (D-4 and `editBook`):**
  - A promote keeps a private Book's own cover, which then becomes shared.
  - It replaces the creator's genre picks with the mapped ones.
  - Both are harmless now, because private Books get neither cover nor genres yet. The cover-upload and Edit book stories must decide them.
- **Ratings in a merge:** with rows on both Books, the shared Book's rating wins, not the newer one (PRD FR-46 names "most recent wins" for the admin's merge). Rows on both arise only from the 3.38 race.
- **Whitespace:** text is compared exactly, so a whitespace-only difference (a double space in a source title) becomes a `title` override.
- **Stale Undo receipt:** a manual save's Undo receipt, used after a promote and its Undo, deletes the then-unreferenced shared Book and leaves its shared authors and cover row.
- **`pick`:** 3.53 must thread `pick` through `prepareShare()`, and 5.35 (`lookupAgain`) reuses `settleHeldBook()`.
