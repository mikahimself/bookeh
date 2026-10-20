---
title: 'Story 3.37: [D6] Undo a save'
type: 'feature'
created: '2026-10-20'
baseline_revision: 'e0cfa53bb7aaabe7ce861a23793d9acb876cb86b'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '_bmad-output/implementation-artifacts/epic-3-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      The save restore's "already gone" branches (copy or Book deleted before the Undo) have no test.
    evidence: |-
      deleteCopy in createCopy.ts counts before deleting and deleteRow in ensureSharedBook.ts deletes by where, so a missing row must not end the undo transaction. No test undoes after the row is gone, because nothing in src deletes a copy or Book yet. Add the test with the story that introduces copy removal (Epic 4).
    location: >-
      src/lib/copies/createCopy.ts
    severity: low
---

<intent-contract>

## Intent

**Problem:** `saveCopy` (3.35, 3.36) cannot be undone. FR-15 and AD-11 require that Undo after Add to library deletes the copy, and deletes the catalogue rows the save created only when no row of any user references them.

**Approach:** Make the two writers the save calls undoable. `createCopy` and `ensureSharedBook` each return `Undone<…>` (AD-20). `saveCopy` folds both restores into its own and records the receipt with `withUndo` inside its `oncePerRequest` callback. A new read-only `isUnreferenced()` in `lib/catalogue` guards every catalogue delete.

## Boundaries & Constraints

**Always:**
- New `src/lib/catalogue/isUnreferenced.ts` exports `isUnreferenced(ctx, collection, id): Promise<boolean>`, where `collection` is `'books' | 'authors' | 'series' | 'genres' | 'media'` (AD-3).
  - It walks `ctx.req.payload.config.collections` and each one's `flattenedFields`. For every `relationship` or `upload` field whose `relationTo` equals `collection` (a string, not an array), it runs `payload.count` with `where: { [field.name]: { equals: id } }`, `overrideAccess: true` and `req: ctx.req`. It returns `false` at the first count above 0.
  - Polymorphic fields (`relationTo` arrays, such as Payload's own `payload-locked-documents`) are skipped.
  - It calls `assertLive(ctx)` before each count. It writes nothing.
- `createCopy(ctx, input)` returns `Promise<Undone<number>>`. Its restore deletes the copy through the gateway as the restoring user. When the copy is already gone (a `gateway.count` of 0), it does nothing.
- `ensureSharedBook(ctx, isbn13, cover?)` returns `Promise<Undone<FoundOrCreated>>`.
  - When it found an existing Book, the restore does nothing.
  - When it created the Book, the restore deletes, in this order and each only when `isUnreferenced()` returns true: the Book, the authors it created (`findOrCreateByName(...).created`), the series it created, and the `media` row from `attachCover`. Rows that were matched, not created, are never deleted.
  - Books, authors and series are deleted with `payload.delete({ collection, where: { id: { equals: id } }, overrideAccess: true, req: tx.req, depth: 0 })`. A row that is already gone matches nothing. A non-empty `errors` in the result throws.
  - The `media` row is deleted with `payload.db.deleteMany({ collection: 'media', where: { id: { equals: id } }, req: tx.req })`. This deletes the row and leaves the file in place, so a rolled-back restore never leaves a row without its file. `sweepOrphanMedia` removes the file on the next start. Say so in the doc comment.
- `saveCopy(ctx, input)` returns `Promise<Undoable<SaveResult>>`:
  - The transactional body runs in `withUndo(ctx, (tx) => …)` inside the `oncePerRequest` callback, after `findBookByIsbn` and `downloadCover`. A repeat therefore records no second receipt.
  - The save's restore runs the copy's restore first, then the Book's restore, so the deleted copy no longer references the Book.
  - The `oncePerRequest` callback stores the result together with `Date.now()` taken after `withUndo` resolves. Every return, the first one included, gives `undoSeconds = max(0, stored.undoSeconds - floor((now - storedAt) / 1000))`. A repeat returns the same `undoToken`.
  - The doc comment states the Undo behaviour (AD-11, AD-20).
- The restores close over ids only, never a context (AD-20). The save creates no `user-books` row (the row is lazy, AD-6), so the restore never touches `user-books`.

**Never:**
- No loan check. Loans do not exist yet; Story 6.5 adds it to `createCopy`'s restore.
- No change to `lib/undo`, `oncePerRequest`, `SaveInput`, any collection or any migration.
- No server action, toast or UI (3.46, 3.47).
- No forgetting of the `requestId` on Undo. See Design Notes.
- No Drizzle writes and no module-level state.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Undo a save that created everything | A saves a new ISBN; the save creates a Book, a new author, a new series and a cover; A undoes it with the token | The copy, the Book, the author, the series and the `media` row are gone; A has no `user-books` row for the ISBN | No error expected |
| Book another user holds | A saves a new ISBN (Book created); B saves the same ISBN; A undoes | A's copy is gone. The Book, its author, its series and its `media` row remain, and B's copy is intact | No error expected |
| Book existed before the save | A saves an ISBN whose shared Book already existed; A undoes | Only A's copy is deleted; the Book remains even though nothing references it now | No error expected |
| Repeat, then Undo | A saves with id R, then repeats R 60 s later (fake `Date`) | The repeat has the same `undoToken`, and `undoSeconds` is 60 less than the first result's | No error expected |

</intent-contract>

## Code Map

- `src/lib/undo/undo.ts`: `Restore`, `Undone<T>`, `Undoable<T>`, `withUndo` and `undo`. `withUndo` refuses a context that already has a transaction, so it must wrap only the transactional part of the save. Read-only.
- `src/lib/catalogue/saveCopy.ts:50-79`: `saveCopy` → `oncePerRequest` → `save()`. `save()` normalises, calls `findBookByIsbn`, calls `downloadCover` (which refuses inside a transaction, AD-14), then `withTransaction`. Replace that `withTransaction` with `withUndo`.
- `src/lib/catalogue/saveRequests.ts`: `oncePerRequest<T>` stores the callback's promise. Read-only. The 3.36 spec's residual risks require `withUndo` inside the callback and `undoSeconds` recomputed on a repeat.
- `src/lib/catalogue/ensureSharedBook.ts:31-105`: the authors loop at line 66 and the series at line 72 call `findOrCreateByName`, which returns `{ id, created }`. `attachCover` at line 77 creates the `media` row. The final `payload.create` creates the Book.
- `src/lib/catalogue/findOrCreateByName.ts:22`: `FoundOrCreated`.
- `src/lib/copies/createCopy.ts:26-37`: the only insert into `copies`. AD-18 makes `lib/copies` the only writer of `copies`, so the copy delete belongs in its restore.
- `src/lib/payload/gateway.ts`: `count` at line 53 and `deleteByID` at line 77, both scoped to the request user.
- `src/lib/payload/transaction.ts`: `assertLive`. A failed Payload call (for example `NotFound`) kills the transaction, which is why the deletes use `count` and `where` rather than a throwing `findByID` or `deleteByID`.
- `src/lib/catalogue/covers.ts:275`: `sweepOrphanMedia` removes files no row names, more than an hour old, and runs on start (`src/payload.config.ts:52`).
- `node_modules/payload/dist/collections/operations/deleteByID.js:90`: Payload unlinks an upload's file before the database delete, outside transaction control. This is why the `media` row goes through `payload.db.deleteMany`.
- Relations to catalogue rows today: `books.authors` (hasMany), `books.series`, `books.cover` (upload), `books.genres`, `copies.book`, `user-books.book`, `user-books.authors` and `user-books.series`. `isUnreferenced` discovers them from the config, so Epic 7's `wishlist-entries.book` is covered without a change.
- `eslint.config.mjs:21-34`: `catalogue` may import `copies` and `undo`, and `copies` may import `undo`.
- Tests that follow the return-type changes: `tests/int/createCopy.int.spec.ts`, `tests/int/copies.int.spec.ts` (createCopy: 18 call sites), `tests/int/ensureSharedBook.int.spec.ts` and `tests/int/covers.int.spec.ts` (ensureSharedBook: 13). For `saveCopy`, `tests/int/saveCopy.int.spec.ts` has the fixtures `found()`, `inputFor()`, `freshUser()`, `userWithDefault()`, `copiesOf()`, `booksWithIsbn()`, `countByName()`, `bookFor()`, and `mediaIds`/`filenames` for cleanup. The fake-`Date` precedent is in its `repeated requestId` block.

## Tasks & Acceptance

**Execution:**
- `src/lib/catalogue/isUnreferenced.ts` -- new, as in Always -- AD-3, AD-11.
- `src/lib/copies/createCopy.ts` -- return `Undone<number>` with the copy-delete restore; update the doc comment -- AD-18, AD-20.
- `src/lib/catalogue/ensureSharedBook.ts` -- track the created author ids, series id and media id; return `Undone<FoundOrCreated>` with the guarded delete restore; update the doc comment -- AD-11.
- `src/lib/catalogue/saveCopy.ts` -- `withUndo` inside the callback, fold the restores, recompute `undoSeconds`, and return `Undoable<SaveResult>`; update the doc comment -- AD-11, AD-20.
- `tests/int/createCopy.int.spec.ts`, `tests/int/copies.int.spec.ts`, `tests/int/ensureSharedBook.int.spec.ts`, `tests/int/covers.int.spec.ts` -- adapt to `.data` with no behaviour change.
- `tests/int/saveCopy.int.spec.ts` -- add `describe('undo')` with one test per matrix row, calling `undo(ctx, result.undoToken)`. Check targeted rows: the Book by ISBN, author and series by their unique names, the `media` id, the user's copies, and `user-books` for the Book. Do not use global counts, since other files write in parallel. Clean up the cover file the undo leaves behind.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- set `3-37-d6-undo-a-save` to its final status.

**Acceptance Criteria:**
- Given `npx eslint src tests`, `npx tsc --noEmit`, `npm run test:unit` and `npm run test:int`, when they run, then there are 0 lint errors and all tests pass, with the existing `saveCopy`, `createCopy` and `ensureSharedBook` tests asserting the same behaviour as before.
- Given `grep -rn "overrideAccess" src/lib/copies`, when it runs, then there is no match: the copy delete runs under the user's own access.

## Spec Change Log

## Review Triage Log

### 2026-10-20 — Review pass
- verdicts: 26 findings — high 0, medium 1, low 16, false 9, maybe-false 0
- findings:
  - `[low]` `[reject]` blind: race between A's undo and B's concurrent save of the same Book can null B's copy. `copies.book_id` and `user_books.book_id` are `NOT NULL` with `ON DELETE set null`, so the delete fails with a not-null violation and A's undo rolls back as `UNDO_FAILED`, which is harmless. A created author matched by a concurrent new Book needs two users within milliseconds on a one-user tailnet. The fix, a row lock, adds a Drizzle query.
  - `[false]` `[reject]` blind: Edit-then-Undo keeps the Book because the user's `user-books` row references it. AD-20 says a restore "never touches a row its action did not change". The edit's row is not the save's, so keeping the Book is the specified outcome. No frontend edit path exists yet (Epic 4).
  - `[low]` `[patch]` blind: the `userBooksOf` assertion in the first undo test is vacuous. Deleted the assertion and its helper.
  - `[low]` `[patch]` blind: the test "…and undoes once" never checks "once". Renamed it to what it checks. The asks for a second-undo check and a retry-after-undo test are coverage-only: `undo()`'s single use is tested in `undo.int.spec.ts`.
  - `[low]` `[reject]` blind: undone cover files stay until the startup sweep. As specified, to keep a rolled-back restore from losing a file. The files are small and the sweep runs on every deploy. The fix, a post-commit hook, is new surface in `lib/payload`.
  - `[low]` `[reject]` blind: `isUnreferenced` misses nested or polymorphic relations. None to a catalogue collection exists, and the doc names the limit. The fix adds guards for shapes the app does not use.
  - `[low]` `[reject]` blind: `undoSeconds` on a repeat can overstate the time left by up to about a second. The toast hides Undo at 0, so at most the last second's tap fails with "Couldn't undo.". The proposed deadline fix computes from the same `storedAt` and keeps the gap.
  - `[low]` `[reject]` blind: the `book!` non-null assertion. The codebase uses `!` where the branch guarantees the value (`candidates[0]!` in `ensureSharedBook`), and strict TS bans `any`, not `!`. Style only.
  - `[false]` `[reject]` blind: two ways of writing the no-op restore. No caller diverges and no rule breaks. Style without a named harm.
  - `[low]` `[reject]` edge: count-then-delete race with a concurrent Book reference. Same root as the first blind row; the outcome is `UNDO_FAILED` and a rollback.
  - `[low]` `[reject]` edge: a repeat after an Undo returns a spent token with positive seconds. Reaching it needs a retry after the client already undid with that token. Design Notes explain why that client cannot exist (the retrying client never got the token).
  - `[low]` `[reject]` edge: a receipt evicted from the 500-entry store while its `requestId` is remembered. Needs 500 undoable actions in 10 minutes from one instance.
  - `[false]` `[reject]` edge: Edit-then-Undo leaves the Book. Same as the blind row; AD-20 prescribes it.
  - `[low]` `[reject]` edge: a matched author's `sortName` refreshed by the save is not reverted. That refresh replaces an empty or derived sort name with the source's inverted form, an improvement to a shared admin-side field. Reverting it needs `findOrCreateByName` to return previous values (new surface).
  - `[low]` `[reject]` edge: a copy deleted between `count` and `deleteByID` in the restore. Only the owner can delete their copy, there is no copy-delete path yet, and the undo is that owner's own request.
  - `[low]` `[reject]` edge: the sweep skips when the `media` table is empty, so the last undone cover's file stays. Only on a library with no other cover; same root and reasoning as the cover-file row.
  - `[medium]` `[patch]` verification-gap: nothing tests that a matched (not created) author or series survives an Undo. Dropping the `created` check passes every test, and the regression would delete the admin's records. Added a test: pre-created shared author and series, save, undo, both still exist and the Book is gone.
  - `[low]` `[defer]` verification-gap: the restores' "already gone" branches are untested. No path deletes a copy or Book before an Undo yet; the test belongs with copy removal (Epic 4).
  - `[low]` `[reject]` verification-gap (other): race between an Undo and another user's save. Same root as the first blind row.
  - `[low]` `[reject]` verification-gap (other): the vacuous `user-books` assertion. Same as the blind row; patched there.
  - `[false]` `[reject]` intent: no server action, toast or UI. Stories 3.46 and 3.47 own them, and the epic AC sits at the service.
  - `[false]` `[reject]` intent: `saveCopy` returns `Undoable`, not `Undone`, and records the receipt itself. The literal shape cannot run: `downloadCover` refuses inside `withUndo`'s transaction (AD-14), and a repeat would record a second receipt. Design Notes record the reason.
  - `[false]` `[reject]` intent: `createCopy` and `ensureSharedBook` still call `withTransaction`. Inside the save they join `withUndo`'s transaction and open none; opening one is only for standalone callers (AD-16).
  - `[false]` `[reject]` intent: the `user-books` clause is not implemented. The save creates no `user-books` row (AD-6, lazy), so there is nothing to delete; touching one would break AD-20.
  - `[false]` `[reject]` intent: "database as before" is checked by targeted rows, and the cover file stays. Other test files write in parallel, so global counts would be flaky. The file is documented and handled by the sweep. Genres are never created by a save (`mapSubjectsToGenres` returns none until Epic 9).
  - `[false]` `[reject]` intent: repeat-token behaviour beyond the AC. It comes from the 3.36 residual risks and keeps a repeat from recording a second receipt.

## Design Notes

**Why `saveCopy` returns `Undoable`, not `Undone`.** The epic AC says "`saveCopy` returning `Undone<SaveResult>`". AD-20's general shape is a server action that calls `withUndo(ctx, (tx) => service(tx))`. That shape cannot hold the save: the cover download must finish before the transaction opens (AD-14, `downloadCover` refuses inside one), and the `requestId` memory must sit outside the receipt, or every repeat records a second receipt (3.36 residual risk). So the undoable unit is the transactional body. It returns `Undone<SaveResult>` to `withUndo` inside `saveCopy`, and 3.46's action calls `saveCopy` directly. `withUndo` and `undo` still own recording and running.

**Why the restore keeps the remembered `requestId`.** After an Undo, a retry with the same id within 10 minutes returns the undone result. Only a client that never got the first response retries, and that client never had a token to undo with. Forgetting the id inside the restore would also take effect when the restore rolls back.

```ts
return withUndo(ctx, async (tx) => {
  const book = held ? undefined : await ensureSharedBook(tx, isbn13, cover)
  const copy = await createCopy(tx, { bookId: held?.id ?? book!.data.id, status: 'owned' })
  // … savedTo …
  return { data: { bookId, copyId: copy.data, savedTo }, restore: async (t) => {
    await copy.restore(t)
    await book?.restore(t)
  } }
})
```

## Verification

**Commands:**
- `npx eslint src tests` -- expected: 0 errors.
- `npx tsc --noEmit` -- expected: clean.
- `npm run test:unit` -- expected: all pass.
- `npm run test:int` -- expected: all pass. Needs the worktree's Postgres on `localhost:5434` through `.env`.

## Auto Run Result

**Summary.** A save can now be undone (FR-15, AD-11, AD-20). `saveCopy` returns `Undoable<SaveResult>`: its transaction is `withUndo()`'s, inside the `oncePerRequest` callback, so a repeat returns the same `undoToken` with the seconds left now and records no second receipt. `undo(ctx, token)` deletes the copy, then the Book, authors, series and cover `media` row the save created, each only when the new `isUnreferenced()` finds no row of any user referencing it. Matched rows and a Book that existed before the save are never deleted. The undone cover's file stays until the startup sweep, so a rolled-back restore never leaves a row without its file.

**Files changed.**
- `src/lib/catalogue/isUnreferenced.ts`: new. A read-only reference check that discovers relationship and upload fields from the Payload config (AD-3).
- `src/lib/copies/createCopy.ts`: returns `Undone<number>`. Its restore deletes the copy through the gateway, and does nothing if the copy is gone.
- `src/lib/catalogue/ensureSharedBook.ts`: returns `Undone<FoundOrCreated>`. Its restore deletes, each when unreferenced, the created Book, authors, series and cover row.
- `src/lib/catalogue/saveCopy.ts`: `withUndo` inside the callback. It folds the copy and Book restores (copy first) and recomputes `undoSeconds` on every return.
- `tests/int/createCopy.int.spec.ts`, `tests/int/ensureSharedBook.int.spec.ts`, `tests/int/covers.int.spec.ts`: adapted to `.data`, with no behaviour change.
- `tests/int/saveCopy.int.spec.ts`: `describe('undo')`, 5 tests: everything created is removed; a Book another user holds survives; a Book that existed before survives; matched author and series survive; a repeat returns the same token with fewer seconds.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: 3.37 is done.

**Review.** 26 findings: medium 1, low 16, false 9.

Patched (3):
- Medium: a test that matched (not created) authors and series survive an Undo. The implementer confirmed it fails when matched rows are deleted.
- Low: deleted the vacuous `user-books` assertion and its helper.
- Low: renamed the repeat test, which claimed to check "undoes once".

Deferred (1): a test of the restores' "already gone" branches, with copy removal (Epic 4).

Rejected:
- Low (13):
  - Race between an Undo and a concurrent save of the same Book (3 rows). `NOT NULL` + `set null` makes the delete fail, so the undo rolls back as `UNDO_FAILED`.
  - Cover files stay until the startup sweep (2 rows). As designed; the files are small and every deploy sweeps.
  - `isUnreferenced` skips nested and polymorphic relations. None exist.
  - `undoSeconds` can overstate the time left by under a second.
  - The `book!` assertion. Style.
  - A spent token on a repeat after an Undo. The retrying client never had the token.
  - A receipt evicted while its id is remembered. Needs 500 actions in 10 minutes.
  - A matched author's refreshed `sortName` is not reverted. The refresh improves an admin field, and reverting it needs new surface.
  - A copy deleted between count and delete. There is no copy-delete path.
  - (The vacuous-assertion duplicate from the verification-gap layer was patched with its blind row.)
- False (9):
  - Edit-then-Undo keeps the Book (2 rows). AD-20 forbids touching rows the save did not change.
  - The no-op restore is written two ways. Style with no named harm.
  - No UI. That is 3.46 and 3.47.
  - The `Undoable` return. The literal `Undone` shape cannot hold the pre-transaction cover download.
  - `withTransaction` in the sub-writers. They join.
  - The `user-books` clause. The save creates none.
  - Targeted rows instead of a global "database as before". Other test files write in parallel.
  - Repeat-token behaviour. From the 3.36 residual risks.

**Follow-up review:** not recommended. Patched: high 0, medium 1, low 2.

**Verification.** Run in worktree `story-3-37-undo-save`, Postgres on `localhost:5434`:
- `npx tsc --noEmit`: clean.
- `npx eslint src tests`: 0 errors (36 warnings, already present in migrations).
- `npm run test:unit`: 523 passed.
- `npm run test:int`: 322 passed, 1 skipped (the migration-schema suite, which runs only with `DATABASE_PUSH=false`).
- Matrix audit: every row has a passing test in `saveCopy.int.spec.ts` → `undo`.

**Residual risks.**
- Story 6.5 must add the loan check to `createCopy`'s restore (`UNDO_FAILED` when the copy has a loan).
- 3.46's action calls `saveCopy` directly, not wrapped in `withUndo`, since `saveCopy` records the receipt itself.
- An undone cover file stays on disk until the next start, and is kept if the `media` table is then empty.
- `isUnreferenced` must learn nested or polymorphic fields if a later collection references a catalogue row that way.
- If Epic 4's Edit creates a `user-books` row within the Undo window, Undo keeps the Book, per AD-20. Revisit if that feels wrong in use.
