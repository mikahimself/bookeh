---
title: 'Story 3.38: [D7] Private Book from manual entry'
type: 'feature'
created: '2026-10-20'
baseline_revision: 'e0cfa53bb7aaabe7ce861a23793d9acb876cb86b'
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

**Problem:** `saveCopy` (3.35, 3.36) saves only a Book a source knows. When no source knows the ISBN, or the book has none, the user cannot catalogue it. FR-12 and FR-22 require that typed title and authors make a **private Book**, and AD-4 and AD-5 say how its records are matched and scoped.

**Approach:** Widen `SaveInput.target` with the spine's `{ manual: { isbn?, title, authors } }` arm. A new `lib/catalogue` module validates the typed values and creates the private Book, with authors matched or created in the private scope, inside the save transaction. `saveCopy` routes the manual target there and creates the copy as before.

## Boundaries & Constraints

**Always:**
- `SaveInput.target` becomes `{ isbn13: string } | { manual: { isbn?: string; title: string; authors: string[] } }`, as in the spine. `SaveResult` is unchanged. Update `saveCopy.ts`'s narrowing comment: drop "`{ manual }` with 3.38".
- New `src/lib/catalogue/createPrivateBook.ts`:
  - `normaliseManual(manual)` is pure. `title` goes through `normaliseName()` (NFC, trimmed, whitespace runs collapsed). If it is blank, it throws `DomainError('VALIDATION', { fields: { title: 'VALIDATION' } })`.
  - Each author goes through `normaliseName()`. Blank entries are dropped, and repeats by `toNameKey()` are dropped, keeping the first. If none remain, it throws `VALIDATION` with `fields: { authors: 'VALIDATION' }`. When both title and authors fail, both fields appear in one error.
  - An `isbn` that is absent or blank after trimming means no ISBN. Anything else goes through `normaliseIsbn()` (`INVALID_ISBN`). Title and author checks run before the ISBN check.
  - `createPrivateBook(ctx, manual)` (the normalised shape) runs `withTransaction` and calls `findOrCreateByName(tx, 'authors', 'private', { name })` once per author, in order and one after the other, never with a `sortName`. It then creates the `books` row with system privileges: `title`, `authors`, `isbn13` (only when there is one), `visibility: 'private'`, and no `source`, `rawMetadata`, cover, series or genres. The `visibility` field hook sets `createdBy` from `ctx.req.user`. It returns `{ id }`.
- `saveCopy`'s `save()` with a manual target:
  1. Normalise first, before any read. This keeps the `oncePerRequest` wrapper and its `requestId` check exactly as in 3.36.
  2. With an ISBN, read `findBookByIsbn(ctx, isbn13)`. A held Book (shared, or the user's own private Book) is used as it is, and the typed values are dropped.
  3. In one `withTransaction`: the held Book, or else `createPrivateBook(tx, …)`. Then `createCopy` and the `savedTo` read, unchanged.
  - A manual save never calls `lookupSources`, `downloadCover` or `fetch`.
- Doc comments on `createPrivateBook` and the `saveCopy` doc state these rules and cite FR-12 and AD-4/AD-5.

**Never:**
- No auto-share (3.39), no Undo of a save (3.37), no server action or Answer UI (3.49), no wishlist entry (Epic 7), no `pick` (3.53).
- No change to any collection, migration, `findOrCreateByName`, `findBookByIsbn`, `ensureSharedBook`, `createCopy` or `lookupBook`.
- No series, subtitle or other fields on the manual input. The spine's arm has only `isbn`, `title` and `authors`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Typed with ISBN | A: manual `{ isbn: '951-0-…' (valid ISBN-10), title: '  Seitsemän  veljestä ', authors: ['Aleksis Kivi'] }`, no Book with that ISBN | A private Book with `createdBy` A, `isbn13` normalised, title `Seitsemän veljestä`. Its author is a new private author created by A. One owned copy at A's default. No source call | No error expected |
| No ISBN | manual with no `isbn`, or `isbn: '  '` | A private Book with no `isbn13`; a second such save creates a second Book | No error expected |
| NFC | Title and author typed in NFD (`'ä'`) | Stored in NFC (`'ä'`) | No error expected |
| Author matching | Authors: one name matching a shared author (different case), one matching A's own private author, one matching only B's private author | Linked to the shared row, A's row, and a new private row of A's. B's row is untouched | No error expected |
| Blank and repeated authors | `['Kivi', ' ', 'kivi']` | One author | No error expected |
| Missing fields | Title `'  '` and authors `[]` or `['  ']` | Nothing read or written | `VALIDATION`, `fields: { title, authors }` |
| Bad ISBN | `isbn: 'abc'` with a valid title and authors | Nothing read or written | `INVALID_ISBN` |
| Scan again | After A's manual save with ISBN X: `lookupBook(A, { isbn: X })`, then `saveCopy(A, { isbn13: X })` | `existing`, with A's private Book; the save adds a second copy of the same Book; still one Book with X | No error expected |
| ISBN already held | Manual save with ISBN X when a shared Book with X exists, or A's private Book with X exists | That Book gets the copy; no new Book, author or row from the typed values | No error expected |
| Other user | B, a non-admin user, after A's manual save | B's `find`/`findByID` on `books` and `authors` through `as(B)` returns neither the Book nor A's private author; `lookupBook(B, { isbn: X })` is not `existing` | No error expected |
| Rollback | Manual save whose copy insert fails (a default location id that does not exist) | No Book and no new author remain | The copy's `ValidationError`, unchanged |

</intent-contract>

## Code Map

- `src/lib/catalogue/saveCopy.ts:19-23`: `SaveInput` to widen. `save()` at line 55 is the function to branch. The narrowing comment is at lines 13-16, and the doc comment above `saveCopy` describes the ISBN path only.
- `src/lib/catalogue/ensureSharedBook.ts`: the precedent for `createPrivateBook`. It shows `withTransaction`, `const system = { req: tx.req, overrideAccess: true, depth: 0 }`, `assertLive(tx)` before each `payload` call, and authors in a sequential loop with an `includes` dedupe (AD-16).
- `src/lib/catalogue/findOrCreateByName.ts:91`: `findOrCreateByName(ctx, 'authors', 'private', { name })` matches shared rows, then the caller's own private rows, and creates a private one. Never pass `sortName` here, because client text could land on a shared row.
- `src/lib/catalogue/findBookByIsbn.ts`: the held-Book read (shared first, then the user's own private Book; never someone else's).
- `src/fields/sortName.ts:4`: `normaliseName` (NFC, trim, collapse). `src/fields/nameKey.ts`: `toNameKey`. `src/fields/isbn.ts:34`: `normaliseIsbn` throws `DomainError('INVALID_ISBN')`.
- `src/fields/visibility.ts`: the `createdBy` hook takes `req.user` on a private create, so no explicit `createdBy` is needed.
- `src/fields/bookFields.ts:48`: `title` is required, `maxLength: 500`. An over-long title surfaces as Payload's `ValidationError`, which is acceptable.
- `src/lib/errors.ts:21`: `DomainError(code, { fields })`.
- `src/lib/catalogue/lookupBook.ts`: already answers `existing` for the user's own private Book, and calls `lookupSources` in that case. Mock it in the tests.
- `tests/int/saveCopy.int.spec.ts`: fixtures to copy in a trimmed-down form. `vi.mock('@/lib/metadata/lookup')`, the `fetch` spy, `unique()`, `copiesOf()`, `booksWithIsbn()`, `freshUser()`, `userWithDefault()`, and the broken-default rollback trick at line 334 with `rejectedPaths`.
- `tests/helpers/harness.ts`: `createUser`, `contextFor`, `as(user)`. `tests/helpers/isbn.ts`: `randomIsbn()`.

## Tasks & Acceptance

**Execution:**
- `src/lib/catalogue/createPrivateBook.ts` -- new: `ManualEntry` type, `normaliseManual`, `createPrivateBook` as in Always -- FR-12, AD-4, AD-5.
- `src/lib/catalogue/saveCopy.ts` -- widen `SaveInput.target`, branch `save()` on `'manual' in input.target`, and update the comments -- FR-12, FR-22.
- `tests/int/createPrivateBook.int.spec.ts` -- new: one test per matrix row, all through `saveCopy`, except that the Scan again row also calls `lookupBook`. A separate file keeps it clear of 3.37's edits to `saveCopy.int.spec.ts`.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- set `3-38-d7-private-book-from-manual-entry` to its final status.

**Acceptance Criteria:**
- Given `npx eslint src tests`, `npx tsc --noEmit`, `npm run test:unit` and `npm run test:int`, when they run, then all pass with 0 lint errors, and the existing `saveCopy` tests pass unchanged.
- Given `git diff --stat e0cfa53bb7aaabe7ce861a23793d9acb876cb86b -- src/collections src/migrations src/payload-types.ts`, when it runs, then it is empty.

## Spec Change Log

## Review Triage Log

### 2026-10-20 — Review pass
- verdicts: 25 findings — high 0, medium 0, low 15, false 10, maybe-false 0
- findings:
  - `[low]` `[patch]` blind: the manual branch reads the held Book before the transaction, so a shared Book another user creates in between is missed and a private duplicate is created. Moved the read inside the transaction (`findBookByIsbn(tx, …)`); the window is narrower, not closed (read committed).
  - `[low]` `[reject]` blind: no length checks in `normaliseManual`, so a title over 500 fails late, and an author over 200 fails on path `name`. Nobody types a 200-character author; the fix adds guards. The title error still lands on `title`.
  - `[low]` `[reject]` blind: no runtime shape check on client input, so a malformed payload becomes `INTERNAL`. Only a client bug reaches it (3.49 builds the action); the fix adds guards.
  - `[low]` `[reject]` blind: no upper bound on the number of authors. Single user on the tailnet, and the form has a handful of fields; the fix adds a guard and a constant.
  - `[low]` `[patch]` blind: the `includes` dedupe in `createPrivateBook` is dead once input is deduped by `toNameKey`. Deleted; a plain push. The branded-type part is rejected: there is no second caller.
  - `[low]` `[reject]` blind: `saveCopy` no longer refuses an outer transaction on the manual path. No caller passes one (actions run through `runAction` without a transaction); the fix adds a guard.
  - `[low]` `[patch]` blind: the NFD test depends on invisible combining characters. Inputs are now `\u0308` escapes, with an assertion that they differ from NFC (Prettier had already folded the first version).
  - `[low]` `[patch]` blind: no test pins title/author checks before the ISBN check. Added an `it.each` row: `isbn: 'abc'`, blank title and author, giving `VALIDATION` with both fields and no read.
  - `[false]` `[reject]` blind: the caller is not told the typed values were dropped, so a toast would name the wrong Book. The save toast names the location ("Saved to {location}"), never the title (EXPERIENCE.md); `SaveResult` carries nothing that could mismatch.
  - `[low]` `[patch]` edge: the held-Book read outside the transaction. Same root as the first blind row; the same fix.
  - `[low]` `[reject]` edge: two concurrent manual saves by one user with one new ISBN and different `requestId`s get the unique-index `ValidationError`. Needs two separate presses at the same instant; documented (AD-19). The fix adds a catch and a re-read.
  - `[low]` `[reject]` edge: a title over 500 errors only after the author writes. Same as the blind length row.
  - `[low]` `[reject]` edge: an author over 200 reports on `name`. Same as the blind length row.
  - `[low]` `[reject]` edge: a non-string title or authors becomes `INTERNAL`. Same as the blind shape row.
  - `[low]` `[reject]` edge: a very large authors array holds the transaction open. Same as the blind bound row.
  - `[low]` `[reject]` edge: the deleted "cannot be called inside one" wording. Same as the blind transaction row.
  - `[low]` `[patch]` verification-gap: the check order is not pinned. Same root as the blind order row; the same test.
  - `[low]` `[patch]` verification-gap (other): the held-Book race. Same root as the first blind row; the same fix.
  - `[false]` `[reject]` intent: a manual save with an ISBN a source knows still makes a private Book. The spine forbids the save from calling the sources (AD-5); the Answer offers manual entry only after `none` (3.49), and 3.39 shares the Book on the next save.
  - `[false]` `[reject]` intent: "scanning again" is tested at the service, not the scanner. Slice D7 is a Service story; the scan flow test is 3.52.
  - `[false]` `[reject]` intent: "cannot see" is tested through access, not the shelf. The epic AC asks for integration tests, and the shelf does not exist yet; every read goes through the same access.
  - `[false]` `[reject]` intent: "held Book wins" is not in the epic ACs. It follows from the AC "not a duplicate" and AD-19 (Design Notes); not a defect.
  - `[false]` `[reject]` intent: normalisation goes beyond the ACs, and `normaliseManual` is only tested through `saveCopy`. Collapsing whitespace is the Names convention (`normaliseName`); the coverage ask has no named failure.
  - `[false]` `[reject]` intent: the sprint status is `review`. Finalize sets it to `done`.
  - `[false]` `[reject]` intent: no restore path for 3.37. 3.37 is a separate story in flight; recorded under residual risks.

## Design Notes

**Why a held Book wins over typed values.** The Answer offers manual entry only after lookup said `none`, so a Book with the ISBN that the user may hold exists only in a race, or after another user's shared save in between. AD-19 allows one shared Book per ISBN and one private Book per creator and ISBN. The AC "scanning the same ISBN again returns this Book, not a duplicate" means the same thing: one ISBN leads to one Book. Failing would turn a harmless race into an error the user cannot fix. The typed values are dropped, but the user can still edit afterwards (Epic 4).

**Why no ISBN means no matching.** FR-12: "Books without an ISBN are never merged automatically". Two manual saves without an ISBN are two Books.

**Parallel 3.37.** 3.37 (Undo a save) runs beside this story and also changes `saveCopy.ts`. Whichever story merges second takes both: the manual branch must sit inside the same `run` callback, and its restore must cover the private Book and private authors through `isUnreferenced()`.

## Verification

**Commands:**
- `npx eslint src tests` -- expected: 0 errors.
- `npx tsc --noEmit` -- expected: clean.
- `npm run test:unit` -- expected: all pass.
- `npm run test:int` -- expected: all pass. Needs the worktree's Postgres on `localhost:5436` through `.env`.

## Auto Run Result

**Summary.** `saveCopy` accepts the spine's `{ manual: { isbn?, title, authors } }` target (FR-12, FR-22):
- `normaliseManual()` normalises the title and authors (NFC, trimmed, whitespace collapsed) and drops blank and repeated authors. A blank title or no authors left gives one `VALIDATION` that names both fields. Only after that is the ISBN checked: blank means none, otherwise `INVALID_ISBN`.
- Inside the save's transaction, a Book the user holds for the ISBN gets the copy. Otherwise `createPrivateBook()` creates a private Book with `createdBy` set. Its authors are matched shared first, then the user's own private rows, else created private. No source call, no cover.

**Files changed.**
- `src/lib/catalogue/createPrivateBook.ts`: new. `ManualEntry`, `NormalisedEntry`, `normaliseManual()`, `createPrivateBook()`.
- `src/lib/catalogue/saveCopy.ts`: the target union is widened, plus the manual branch. The copy and `savedTo` tail moves to `saveOwnedCopy()`. Comments updated.
- `tests/int/createPrivateBook.int.spec.ts`: new. 14 tests, covering every matrix row.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: 3.38 is done.

**Review.** 25 findings: low 15, false 10.

Patched (all low):
- The held-Book read moved inside the transaction (3 rows).
- The dead `includes` dedupe was removed.
- The NFD test inputs use explicit escapes.
- A test pins the check order (2 rows).

Deferred: none.

Rejected:
- Low (9):
  - Length caps (3 rows).
  - Runtime shape guards (2 rows).
  - Author count bound (2 rows).
  - Outer-transaction guard (2 rows).

  All are unlikely in use, and each fix adds guards.
- Low (1): a same-user concurrent duplicate ISBN. It is documented under AD-19.
- False (10): the toast echoes no title, and the intent rows are settled by the spine and the slicing (see the log).

**Follow-up review:** not recommended. Patched entries: high 0, medium 0, low 4.

**Verification.** Run in worktree `story-3-38-manual-entry`, Postgres on `localhost:5436`:
- `npx eslint src tests`: 0 errors (36 warnings, already present).
- `npx tsc --noEmit`: clean.
- `npm run test:unit`: 522/523 in the full run. `scanScreen.unit.spec.ts` "pushes the Answer address…" timed out under load from parallel worktrees, as in 3.36. It passed 7/7 on its own, twice, and in one full run.
- `npm run test:int`: 331 passed, 1 skipped. `createPrivateBook` 14/14, `saveCopy` 17/17.
- No change under `src/collections`, `src/migrations` or `payload-types.ts`.

**Residual risks.**
- A shared Book that another user commits between the in-transaction read and the private create is still missed (read committed). The user then holds a private Book behind the shared one, and 3.39's merge path ("copies move, private Book deleted") resolves it on the next save.
- 3.49 must check input shape and length at the action boundary. `normaliseManual` assumes typed strings, and an author over 200 characters fails on `name`.

**Rebase onto 3.37 and 3.44 (2026-10-20).** 3.37 merged first, so this story took over its Undo:
- `createPrivateBook()` now returns `Undone<{ id }>`. Its restore deletes the private Book, then the authors it created, each only when `isUnreferenced()` allows. It uses `deleteRow()`, now exported from `ensureSharedBook.ts`.
- `saveCopy` runs both paths through `withUndo()`. The `saveOwnedCopy()` tail returns the copy's restore followed by the Book's.
- The 'cannot be called inside one' rule holds again on every path, because `withUndo()` refuses an outer transaction.
- A new test covers Undo of a manual save: the copy, the private Book and the new author are deleted, and a matched shared author stays.

Checks after the rebase:
- eslint: 0 errors. tsc: clean.
- `test:int`: 337 passed, 1 skipped (`saveCopy` 22/22, `createPrivateBook` 15/15).
- `test:unit`: 537 passed.
