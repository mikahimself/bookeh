---
title: 'Story 3.35: [D4] Save a copy'
type: 'feature'
created: '2026-10-20'
baseline_revision: '17d2e0c2f0caeb89905804355782fb0118fc3919'
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

**Problem:** The pieces of a save exist (`downloadCover` 3.32, `ensureSharedBook` 3.31, `createCopy` 3.33/3.34), but nothing composes them. FR-21 and AD-11 need Add to library to be one call that saves the Book and an owned copy at the default location in one transaction, or nothing at all.

**Approach:** Add `saveCopy(ctx, SaveInput): Promise<SaveResult>` in `lib/catalogue`. It resolves an `{ isbn13 }` target to a Book the user may hold: the shared Book with that ISBN, else the user's own private Book, else a shared Book ensured from the server-held outcome. When a Book has to be ensured, it downloads the cover first. Then, in one `withTransaction`, it ensures the Book, creates the owned copy and reads back the copy's location for `savedTo`.

## Boundaries & Constraints

**Always:**
- `src/lib/catalogue/saveCopy.ts` exports `SaveInput`, `SaveResult` and `saveCopy`. The types are the spine's shapes, narrowed to what exists now (the same precedent as `LookupTarget`):
  - `SaveInput = { requestId: string; target: { isbn13: string }; save: { kind: 'copy' } }`
  - `SaveResult = { bookId: number; copyId: number; savedTo: Named | null }`, with `Named` from `lib/books/effectiveBook`
  - A comment says that `{ bookId }` arrives with `requireOwnBook()` (Story 4.1), `{ manual }` with 3.38, `pick` with 3.53, entries with Epic 7, and `requestId` handling with 3.36.
- `target.isbn13` is normalised with `normaliseIsbn` first. Text that is not an ISBN throws `INVALID_ISBN` before any read.
- Book resolution: the shared Book with the ISBN. Else the context user's own private Book with it (`createdBy` = the user; the admin gets no other user's private Book). Else `ensureSharedBook(tx, isbn13, cover)` inside the transaction. Another user's private Book with the ISBN is never used and never touched.
- `downloadCover(ctx, isbn13)` (default policy) runs before the transaction, and only when no shared or own private Book was found. An existing Book gets no download and no source call from `saveCopy`.
- Inside one `withTransaction(ctx, …)`: ensure the Book when needed, then `createCopy(tx, { bookId, status: 'owned' })` with `location` omitted (the default location, or none without a default). Then one gateway read of the new copy gives `savedTo` as the location's `{ id, name }`, or `null`.
- Errors pass through unchanged: `NOT_FOUND` when no source knows the ISBN, a plain `Error` when the sources are unavailable, the `ValidationError` from `createCopy`. Any failure inside the transaction rolls back every Book, author, series, media and copy row it wrote, and `ensureSharedBook`'s `onRollback` removes the downloaded file.
- A shared helper `findBookByIsbn(ctx, isbn13)` in `src/lib/catalogue/findBookByIsbn.ts` holds the one query that `lookupBook` already runs inline: shared or own private, shared first, `{ id, visibility }` or `undefined`. `lookupBook` calls it, with no change in behaviour.
- The doc comment on `saveCopy` cites AD-11, FR-21 and AD-14, states the resolution order, and says that `saveCopy` opens the transaction (it cannot be called inside one, since `downloadCover` refuses).

**Never:**
- No auto-share of a private Book (3.39), no manual target (3.38), no `pick` (3.53), no `requestId` memory (3.36), no Undo or `Undone<T>` (3.37), no server action or UI (3.46).
- No `user-books` write. A save creates no override row until auto-share needs one.
- No change to `createCopy`'s signature or return type, `ensureSharedBook`, `downloadCover`, any collection, or any migration.
- No test-only parameter on `saveCopy`. Tests fake `lookupSources` and `fetch`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| New ISBN, default set | No Book with the ISBN; outcome `found` with an `api.finna.fi` cover URL and a new author and series; the user has `defaultLocation` L | A new shared Book with the cover's `media` row, shared author and series; one owned copy at L; result `{ bookId, copyId, savedTo: { id: L, name } }` | No error expected |
| No default | As above, but the user has no default | Copy with no location; `savedTo: null` | No error expected |
| Shared Book exists | A shared Book with the ISBN | Copy on that Book; no new Book; `lookupSources` and `fetch` not called | No error expected |
| Own private Book | Only the user's private Book with the ISBN | Copy on the private Book; no shared Book created; `lookupSources` and `fetch` not called | No error expected |
| Shared and own private | Both exist | Copy on the shared Book | No error expected |
| Another user's private Book | Only user B's private Book with the ISBN; outcome `found` | A new shared Book; copy on it; B's Book unchanged | No error expected |
| Invalid ISBN | `isbn13: 'abc'` | Nothing read or written | `DomainError` `INVALID_ISBN` |
| Unknown ISBN | Outcome `none` | No Book, no copy | `DomainError` `NOT_FOUND` |
| Failure after creates | New ISBN with cover, new author and series; `ctx.user.defaultLocation` names a location that does not exist | No Book, author, series, media or copy row with these names or this ISBN; the cover file is gone from the media directory | `ValidationError` on `location`; transaction rolled back |

</intent-contract>

## Code Map

- `src/lib/catalogue/ensureSharedBook.ts`: `ensureSharedBook(ctx, isbn13, cover?)` joins the caller's transaction (`withTransaction`). It registers `onRollback(tx, discardCover)` and returns `{ id, created }`. It re-checks for a shared Book itself, which covers a race with a concurrent create.
- `src/lib/catalogue/covers.ts:108`: `downloadCover(ctx, isbn13, policy = coverPolicy)` throws inside a transaction and returns `undefined` for an existing shared Book, a non-`found` outcome or no cover URL. `COVER_HOSTS` is `api.finna.fi` and `books.google.com`, https only.
- `src/lib/copies/createCopy.ts:26`: `createCopy(ctx, NewCopy): Promise<number>` joins the transaction. `location` omitted means `ctx.user.defaultLocation`, an id or a populated object.
- `src/lib/catalogue/lookupBook.ts:104-121`: the inline shared-or-own-private `gateway.find` (with `limit: 2` and `select: { visibility: true }`) that moves into `findBookByIsbn`; then `docs.find(shared) ?? docs[0]`.
- `src/lib/payload/transaction.ts`: `withTransaction` opens or joins, and joined `onRollback` callbacks run on the opener's rollback.
- `src/lib/payload/gateway.ts`: `findByID` with `select`/`populate`/`depth` (Payload Local API options pass through). Read the copy with `select: { location: true }`, `populate: { locations: { name: true } }` and `depth: 1`, so the Book is not populated.
- `src/lib/books/effectiveBook.ts:12`: `Named`. `src/fields/isbn.ts`: `normaliseIsbn`.
- `eslint.config.mjs:22`: `catalogue` may import `copies`, `books`, `metadata`, `payload` and `undo`.
- `tests/int/ensureSharedBook.int.spec.ts` and `tests/int/covers.int.spec.ts`: the precedents for `vi.mock('@/lib/metadata/lookup', …)`, `found(...)` outcomes, `randomIsbn()`, `contextFor`/`createUser`, `mediaDir`, and cleanup of media files and rows. The cover test builds a JPEG with `sharp`.
- `tests/int/lookupBook.int.spec.ts`: must still pass unchanged after the refactor.
- `tests/helpers/harness.ts:38`: `contextFor(user)` uses the given user object as `ctx.user`. A spread user with a made-up `defaultLocation` gives the failure-after-creates row.

## Tasks & Acceptance

**Execution:**
- `src/lib/catalogue/findBookByIsbn.ts` -- new: `findBookByIsbn(ctx, isbn13)`, the query moved out of `lookupBook` -- one definition of "a Book this user may hold for an ISBN" for lookup and save.
- `src/lib/catalogue/lookupBook.ts` -- use `findBookByIsbn`; no behaviour change.
- `src/lib/catalogue/saveCopy.ts` -- new: types and `saveCopy` as in Always -- FR-21, AD-11.
- `tests/int/saveCopy.int.spec.ts` -- new: one test per matrix row. Fake `lookupSources` with `vi.mock` and `fetch` with `vi.spyOn(globalThis, 'fetch')` returning a small JPEG. Clean up the media files and rows the tests create -- the epic's AC asks for integration proof of the transaction.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- set `3-35-d4-save-a-copy` to its final status.

**Acceptance Criteria:**
- Given `npx eslint src tests`, `npx tsc --noEmit`, `npm run test:unit` and `npm run test:int`, when they run, then all pass with 0 lint errors.
- Given `grep -rn "createdBy: { equals: ctx.user.id }" src/lib/catalogue`, when it runs, then the only match is in `findBookByIsbn.ts`.

## Spec Change Log

## Review Triage Log

### 2026-10-20 — Review pass
- verdicts: 18 findings — high 0, medium 0, low 9, false 9, maybe-false 0
- findings:
  - `[low]` `[reject]` blind: the cover (from `downloadCover`'s `lookupSources` call) and the Book values (from `ensureSharedBook`'s call) can come from two different outcomes when a partial `found` was not cached. Real only when a source fails on one call and answers on the next, seconds apart. Even then the best candidate stays the first source's record, so at worst the cover is missing or gap-filled. Fixing it means changing the signatures of two services frozen by this spec.
  - `[low]` `[reject]` blind: on a cache miss, `ensureSharedBook` asks the sources while the save's transaction is open. This is `ensureSharedBook`'s design from 3.31 ("re-fetched on cache miss"). In everyday use the Answer's lookup has just warmed the cache, and the fix means reshaping two services.
  - `[low]` `[reject]` blind: `saveCopy` does not call `limitLookups`, so a save for an ISBN never looked up reaches the sources unmetered. Only a misbehaving client on the single-user tailnet does that; the UI always looks up first, and a `none` outcome is cached. The fix adds a rate-limit policy for saves that neither the spine nor the story defines. Recorded under residual risks.
  - `[false]` `[reject]` blind: `savedTo` would silently become `null` for an unpopulated location. The location was validated by `ownedRelation` as the user's own in this transaction, so `depth: 1` with `populate` always returns the object. No reachable path yields a bare id.
  - `[false]` `[reject]` blind: sprint status `done` ahead of the spec. Finalize sets the spec to `done` and commits both together.
  - `[low]` `[reject]` blind: the shared-Book query runs up to three times on the new-Book path. Each is an indexed single-row read, a negligible cost; removing one means changing `downloadCover`'s signature.
  - `[false]` `[reject]` blind: no test of a source failure after the cover download. The bad outcome (a leftover file or row) does not occur: `ensureSharedBook` registers `onRollback(discardCover)` before its first read, so any later throw removes the file. `covers.int.spec.ts` "removes the file when the save rolls back" covers that path.
  - `[low]` `[reject]` edge: a held Book deleted between the read and `createCopy` makes the save fail with `ValidationError` on `book` instead of resolving again. That needs an admin delete or a 3.39 merge within milliseconds. The failure is loud and a retry succeeds.
  - `[low]` `[reject]` edge: `saveCopy` called inside a transaction joins it when the Book is held, but throws from `downloadCover` when it is not. No caller exists, and the doc comment says it opens its own transaction. 3.37 moves the transaction into `withUndo` inside `saveCopy`.
  - `[low]` `[reject]` edge: the grep acceptance criterion also matches `findOrCreateByName.ts:61` (the author/series name lookup, which predates this story). The fix is an edit to this build's spec. In spirit the check holds: `findBookByIsbn.ts` is the only Book query with that predicate.
  - `[false]` `[reject]` intent: the user-facing Add to library is not built. The epic's 3.35 AC is service-level; 3.46 builds the action and the button.
  - `[low]` `[reject]` intent: no test runs `lookupBook` then `saveCopy` through the real cache. A coverage ask with no defect named; the cache is tested with `lookupSources` (3.9).
  - `[false]` `[reject]` intent: `{ bookId }` is refused only at the type level. The AC says "not accepted yet" and the type does not accept it; the 3.46 action parses untrusted input.
  - `[low]` `[reject]` intent: only one failure point after writes is tested. A coverage ask; failures inside `ensureSharedBook` and their rollback are tested in `ensureSharedBook.int.spec.ts` and `covers.int.spec.ts`.
  - `[false]` `[reject]` intent: the cover-first order is not asserted directly. `downloadCover` throws inside a transaction (`covers.ts`), so the order is enforced; its test "refuses to run inside a transaction" covers that.
  - `[false]` `[reject]` intent: the `lookupBook` refactor relies on the existing suite. That suite covers the moved rules (shared first, never another user's private Book, admin included) and passed unchanged.
  - `[false]` `[reject]` intent: the spine pieces of AD-11 (`closeEntriesForBook`, the full target union, `requestId`) are deferred. The epic sequences them into Epic 7, 3.36, 3.38 and 3.53.
  - `[false]` `[reject]` intent: the bookkeeping disagrees (sprint `done`, spec `in-review`). Same as the blind row; Finalize sets both.

## Design Notes

**Why resolve outside the transaction.** `downloadCover` must run before the transaction opens (AD-14). Whether to download depends on whether a Book already exists, so `findBookByIsbn` runs first, on the plain context. A Book that appears between that read and the transaction is handled: a shared one is found again by `ensureSharedBook`, which discards the cover. A private one cannot appear here, since only the user's own save (3.38) creates one.

**Why read the copy back for `savedTo`.** 3.34 left `createCopy`'s return type to this story. One `findByID` with a populated location name keeps `createCopy` returning an id for its 16 existing call sites, and gives the name the toast needs ("Saved to {location}").

```ts
const copy = await gateway.findByID(tx, {
  collection: 'copies', id: copyId, depth: 1,
  select: { location: true }, populate: { locations: { name: true } },
})
```

## Verification

**Commands:**
- `npx eslint src tests` -- expected: 0 errors.
- `npx tsc --noEmit` -- expected: clean.
- `npm run test:unit` -- expected: all pass.
- `npm run test:int` -- expected: all pass, `saveCopy` and `lookupBook` included. Needs the worktree's Postgres on `localhost:5436` through `.env`.

## Auto Run Result

**Summary.** `saveCopy(ctx, SaveInput)` in `lib/catalogue` is Add to library as a service.
- An `{ isbn13 }` target resolves to the shared Book, else the user's own private Book, else a shared Book that `ensureSharedBook` creates from the server-held outcome. Another user's private Book is never used, by the admin either.
- The cover is downloaded before the transaction, and only when a Book has to be created.
- One transaction ensures the Book, creates an owned copy at the default location, and reads back `savedTo` as the location's `{ id, name }` or `null`.
- Any failure rolls back every Book, author, series, media and copy row, and removes the cover file.

**Files changed.**
- `src/lib/catalogue/saveCopy.ts`: new. `SaveInput`, `SaveResult` (narrowed spine shapes) and `saveCopy`.
- `src/lib/catalogue/findBookByIsbn.ts`: new. The shared-or-own-private Book query moved out of `lookupBook`.
- `src/lib/catalogue/lookupBook.ts`: uses `findBookByIsbn`; no behaviour change.
- `tests/int/saveCopy.int.spec.ts`: new. 9 tests, one per matrix row. `lookupSources` and `fetch` are faked.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: 3.35 is done.

**Review.** 18 findings: low 9, false 9. The verification-gap layer found none.

Patched: none. Deferred: none.

Rejected:
- Low (9):
  - Cover and Book values from two outcomes. A rare partial-outcome race; the fix reshapes frozen services.
  - Sources asked inside the open transaction on a cache miss. This is `ensureSharedBook`'s design; the cache is warm in everyday use.
  - No lookup rate limit on saves. Only a misbehaving client hits it; there is no policy for it yet.
  - The shared-Book query is repeated. Negligible cost.
  - A held Book deleted mid-save. The failure is loud, and a retry works.
  - Mixed behaviour when called inside a transaction. There is no such caller, and 3.37 restructures it.
  - The grep acceptance criterion also matches `findOrCreateByName.ts:61`. The fix is a spec edit; in spirit the check holds.
  - Two coverage-only asks: lookup-to-save through the real cache, and more failure points.
- False (9):
  - `savedTo` null for an unpopulated location.
  - Sprint status ahead of the spec (2 rows).
  - A leftover file when the sources fail after the download.
  - The UI not built (3.46 builds it).
  - `{ bookId }` refused only by the type.
  - The cover order not asserted.
  - The `lookupBook` refactor untested.
  - The spine pieces deferred.

**Follow-up review:** not recommended. Patched entries: high 0, medium 0, low 0.

**Verification.** Run in worktree `story-3-35-save-copy`, Postgres on `localhost:5436`:
- `npx tsc --noEmit`: clean.
- `npx eslint src tests`: 0 errors (36 warnings, already in `src/migrations`).
- `npm run test:unit`: 521 passed.
- `npm run test:int`: 35 files passed, 1 skipped; 297 tests passed. `saveCopy` passed 9/9, `lookupBook` 16/16.
- Matrix audit: every row has a passing test.
- Playwright not run (service story).

**Residual risks.**
- A save for an ISBN that has no cached outcome asks the sources without counting toward `limitLookups`. The UI always looks up first; decide in 3.46 whether the action should meter saves.
- On a new Book, the cover and the values each come from their own `lookupSources` call. Within the 10-minute cache they are the same outcome; after a partial outcome they may differ.
- 3.37 must keep the cover download outside `withUndo`'s transaction, since `downloadCover` refuses to run inside one.
- Still no caller of `saveCopy` in `src`. 3.46's action is the first.
