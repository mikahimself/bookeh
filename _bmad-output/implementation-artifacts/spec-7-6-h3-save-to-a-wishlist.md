---
title: '7.6 [H3] Save to a wishlist'
type: 'feature'
created: '2026-10-27'
status: 'done'
baseline_revision: 'f63f0b5cc23680179baf6e9ea3b449aafd64ad08'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      A private Book held only by a wishlist entry blocks the private-Book merge, so a later isbn13 save of that ISBN fails.
    evidence: |-
      saveEntry with a manual target and an ISBN creates a private Book referenced only by the entry. Once a shared Book exists for the ISBN, an isbn13 save takes settleHeldBook's merge branch, which deletes the private Book only when nothing references it, and the entry still does, so the save throws and rolls back. Story 7.7's acceptance criteria move the user's entries to the shared Book before the merge.
    location: >-
      src/lib/catalogue/sharePrivateBook.ts:261-272
    severity: medium
---

<intent-contract>

## Intent

**Problem:** Add to wishlist (7.14) needs a save that ensures the Book exactly as Add to library does and then puts it on a list instead of the shelf. `lib/catalogue` has only `saveCopy`, and nothing in `lib/wishlists` creates an entry (AD-11, AD-18, FR-21).

**Approach:** Split `saveCopy`'s Book-ensuring path (`{ isbn13 }` / `{ bookId }` / `{ manual }`, held outcome, share/merge, cover, `requestId` memory) into a private helper that takes the "place" step, and add `saveEntry(ctx, input)` beside `saveCopy` in `src/lib/catalogue/saveCopy.ts`. Its place step is a new `createEntry()` in `lib/wishlists`, which resolves the wishlist `Ref` and inserts an open entry with no recipient; its restore deletes the entry, then runs the Book's restore.

## Boundaries & Constraints

**Always:**
- `saveCopy` behaviour, errors and doc comment stay as they are (the refactor is structural); its existing tests pass unchanged apart from the input type name and `oncePerRequest`'s new `kind` argument.
- `saveEntry` follows every Book rule of `saveCopy` for each target: `INVALID_ISBN` / `VALIDATION` / `RATE_LIMITED` / `NOT_FOUND` at the same points, held outcome first and sources at most once before the transaction, `requireOwnBook()` for `{ bookId }`, `settleHeldBook()` for a held `{ isbn13 }` Book, `createPrivateBook()` for `{ manual }`. One `withUndo` transaction: Book, then `createEntry()`.
- `createEntry(ctx, { wishlist: Ref, bookId })` in `src/lib/wishlists/entries.ts`: one `withTransaction` joining the caller's; `resolveWishlist()` first (its `VALIDATION` on `wishlist` unchanged), then the list's name read with `owner = tx.user.id`, then `gateway.create` on `wishlist-entries` with `owner`, `wishlist`, `book` only (no `forPerson`, no `closedAt`). A Book the user cannot read fails through `readableRelation` as `createCopy` does. Returns `Undone<{ entryId: number; wishlist: Named }>`; the restore deletes the entry through the gateway as the restoring user, `count` first (a missing entry is a no-op), whether it is open or closed by then. A list created by the `Ref` stays after Undo (AD-18).
- `saveEntry` returns `Undoable<EntrySaveResult>`, `EntrySaveResult = { bookId: number; entryId: number; savedTo: Named }` (the list). Its restore: the entry, then the Book's restore (Book, authors, series, media only when `isUnreferenced()`).
- `oncePerRequest(ctx, kind, requestId, run)` keys the memory by user, kind (`'copy' | 'entry'`) and `requestId`, so a repeat returns the first result of the same function and never a result of the other shape. `saveEntry` repeats share the first result and Undo token exactly like `saveCopy` (seconds left recomputed).
- Types: `SaveTarget` (the three targets), `SaveInput` = the spine's shape (`save: { kind: 'copy' } | { kind: 'entry'; wishlist: Ref }`), `CopySaveInput` / `EntrySaveInput` its two narrowings; `saveCopy` takes `CopySaveInput`, `saveEntry` takes `EntrySaveInput`. `SaveResult` stays the copy result. The "narrowed to what exists now" comment goes.
- Doc comments in the existing style: `saveEntry` refers to `saveCopy`'s for the shared Book rules and states only what differs; `createEntry` names AD-18, FR-38.
- Spine in this commit: source-tree `wishlists/` line gains `createEntry`; AD-11's `requestId` bullet says a repeat "of the same kind of save".

**Never:**
- No action, screen, toast or i18n string (7.14). No migration or collection change. No `closeEntriesForBook` (7.7), no moving entries on a private-Book merge (7.7), no recipient (7.9). `saveEntry` never closes entries and never creates a copy or a `user-books` row.
- No direct `wishlist-entries` write outside `lib/wishlists`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| ISBN miss | new ISBN, sources found, own list L by id | shared Book with cover; one open entry (no `forPerson`, no `closedAt`) on L; no copy; `savedTo` = L | — |
| Held ISBN | shared Book exists | entry for it; sources not asked | — |
| By id | Book held by a copy; Book held only by an entry; Book not held | entry created for the first two | third: `NOT_FOUND`, nothing written |
| Manual | `{ manual: { title, authors } }`, no ISBN | private Book + entry | — |
| New list by name | `{ create: 'Joulu' }`, none exists; then `{ create: 'joulu' }` | list created, entry on it; second save reuses it | — |
| Bad Ref | another user's list id; `{ create: '  ' }` | no Book, entry or list written | `VALIDATION`, `fields.wishlist` |
| Repeat | same `requestId` twice | same `entryId`, `undoToken`; one entry | — |
| Kind apart | `saveCopy` then `saveEntry` with one `requestId` | both run: one copy, one entry | — |
| Undo | undo the ISBN-miss save | entry, Book, created author, series and media gone; list L stays | — |
| Undo of new list | undo the `{ create }` save | entry gone, list stays | — |

</intent-contract>

## Code Map

- `src/lib/catalogue/saveCopy.ts:20-33` -- `SaveInput`, `SaveResult`, the outdated "narrowed" comment. `:112-119` `saveCopy` with the `oncePerRequest` + `storedAt` seconds recompute (share it). `:121-180` `save()`: the three target branches, each ending in `saveOwnedCopy(tx, bookId, book)` -- turn into `saveBook(ctx, target, place)` where `place(tx, bookId)` returns `Undone<R>` and the helper composes `place`'s restore before the Book's (`book?.restore`). `:187-214` `saveOwnedCopy` then drops its `book` parameter.
- `src/lib/catalogue/saveRequests.ts:28-55` -- `oncePerRequest`; add `kind` to the key (`${user}:${kind}:${requestId}`), length check on `requestId` unchanged.
- `src/lib/copies/createCopy.ts:31-55` -- golden pattern for `createEntry`: `withTransaction`, `gateway.create` with `owner`, restore via a `count`-first delete.
- `src/lib/wishlists/wishlists.ts:73-92` -- `resolveWishlist(ctx, ref)`: runs on the caller's context, errors on `wishlist`. Read-only.
- `src/collections/WishlistEntries.ts` -- fields `owner`, `wishlist` (required), `book` (required, `readableRelation`), `forPerson`, `closedAt`. Read-only.
- `src/lib/books/requireOwnBook.ts` -- passes on a copy or an open entry. Read-only.
- `src/lib/books/effectiveBook.ts:13` -- `Named`.
- `eslint.config.mjs:23` -- `catalogue` may import `wishlists` already; no change.
- `tests/int/saveCopy.int.spec.ts:1-200` -- harness: `vi.mock('@/lib/metadata/lookup')`, `found(isbn, names)`, `fetch` spy returning a sharp JPEG, `freshUser`, `booksWithIsbn`, `countByName`, `coverOf` + `mediaIds`/`filenames` cleanup (`:678-701`), `undo(ctx, token)`. `:645-655` calls `oncePerRequest(ctx, id, run)` directly -- add the `kind` argument. `:87`, `:332` use `SaveInput` -- becomes `CopySaveInput`.
- `tests/int/sharePrivateBook.int.spec.ts:22,70`, `tests/int/createPrivateBook.int.spec.ts:18,38` -- `SaveInput` annotations -- become `CopySaveInput`.
- `src/app/(frontend)/scan/actions.ts` -- calls `saveCopy` with literal `save: { kind: 'copy' }`; should compile unchanged.
- `ARCHITECTURE-SPINE.md:197` (AD-11 `requestId` bullet), `:600` (`wishlists/` line); `:473-478` `SaveInput`/`SaveResult` already match.

## Tasks & Acceptance

**Execution:**
- `src/lib/wishlists/entries.ts` -- new: `createEntry`.
- `src/lib/catalogue/saveRequests.ts` -- `kind` in the key and doc comment.
- `src/lib/catalogue/saveCopy.ts` -- types, `saveBook` helper, `saveEntry`, `saveOwnedCopy` without `book`.
- `tests/int/saveEntry.int.spec.ts` -- new: one test per matrix group (ISBN miss + held; by id three cases; manual; new list by name + reuse; bad Ref two cases; repeat + kind apart; Undo of ISBN miss; Undo of new list).
- `tests/int/saveCopy.int.spec.ts`, `tests/int/sharePrivateBook.int.spec.ts`, `tests/int/createPrivateBook.int.spec.ts` -- type name and `oncePerRequest` argument only.
- `ARCHITECTURE-SPINE.md` -- the two lines above.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `7-6-h3-save-to-a-wishlist: done` when done.

**Acceptance Criteria:**
- Given `saveEntry` with `save: { kind: 'entry', wishlist: Ref }`, when it runs for an `{ isbn13 }`, `{ bookId }` or `{ manual }` target, then in one transaction it ensures the Book as `saveCopy` does and creates an open entry with no recipient, returning the list as `savedTo`.
- Given a repeated `requestId`, when `saveEntry` runs again, then it returns the first result and writes nothing.
- Given a saved entry, when its Undo runs, then the entry is deleted along with any Book, author, series or media row the save created that nothing else references; an integration test undoes it.
- Given the existing `saveCopy` suites, when run, then they pass.

## Spec Change Log

## Review Triage Log

### 2026-10-27 — Review pass
- verdicts: 17 findings — high 0, medium 1, low 10, false 6, maybe-false 0
- findings:
  - `[low]` `[patch]` Blind: spine Shared shapes still show one `SaveResult` with optional `copyId`/`entryId` while the code has `SaveResult` and `EntrySaveResult` — spine line replaced by the two shapes (CLAUDE.md: a contract change updates the spine).
  - `[low]` `[reject]` Blind: a bad wishlist `Ref` is found only after a source lookup and cover download — real but documented in Design Notes; Answers save with a held outcome and the picker sends valid refs, so it is rarely met, and the fix is an extra pre-check branch.
  - `[false]` `[reject]` Blind: Undo deletes an entry already closed as bought — nothing can close an entry yet (`closeEntry` is 7.8); the restore deletes a row only, and a bought copy stays as a real copy either way.
  - `[low]` `[reject]` Blind: bad-`Ref` test does not assert the cover/series rollback — test-only; cover rollback is shared `saveBook` code covered by `saveCopy.int.spec.ts:468`; names no criterion (CLAUDE.md, Tests).
  - `[low]` `[reject]` Blind: `createEntry` reads the list again for its name, with an unreachable throw — one indexed read per save; the fix changes `resolveWishlist`'s public return type.
  - `[false]` `[reject]` Blind: `kind` is not type-linked to the result type — only two private callers (`saveCopy`, `saveEntry`), each passing its own literal; no caller can mismatch today, and a type map is an abstraction for later.
  - `[low]` `[patch]` Blind: `oncePerRequest` doc comment has one over-long line — rewrapped.
  - `[low]` `[reject]` Blind: repeat test does not check the Undo countdown — test-only; `remembered()` is shared and `saveCopy.int.spec.ts:807` covers the countdown.
  - `[low]` `[reject]` Blind: `Named` redeclared in `entries.ts` — lint forbids `wishlists` importing `books`; `lib/people` and `lib/loans` do the same, and moving `Named` is a cross-service refactor.
  - `[medium]` `[defer]` Edge: a private Book held only by an entry (manual save with ISBN) makes a later `{ isbn13 }` save fail when the private-Book merge runs, since the entry still references it — real and reachable from this story; moving entries on the merge is Story 7.7's own AC ("my entries for it move to the shared Book first"), so the intent hands it there.
  - `[low]` `[patch]` Verification gap: no test undoes a `saveEntry` whose entry is already gone (AD-20) — added: ISBN-miss save, `deleteWishlist`, `undo` resolves and the created Book, author, series and media are gone.
  - `[false]` `[reject]` Intent: `requestId` memory narrowed to per kind — a deliberate, documented choice (Design Notes), the spine updated in the same commit; the AC text holds under it.
  - `[false]` `[reject]` Intent: no tappable surface ships — the AC is service-level; Add to wishlist is Story 7.14.
  - `[low]` `[reject]` Intent: auto-share, pick/candidate, rate limit and manual-with-ISBN not tested through `saveEntry` — the paths are the shared `saveBook` code, tested through `saveCopy`; no criterion named.
  - `[low]` `[reject]` Intent: Undo's keep-when-referenced side not tested through `saveEntry` — same shared restore, covered by `saveCopy.int.spec.ts:722-806`.
  - `[false]` `[reject]` Intent: `user-books` cleanup and entry closing unexercised — no save creates a `user-books` row; closing on a copy save is 7.7.
  - `[false]` `[reject]` Intent: `saveEntry` placed in `saveCopy.ts` — descriptive; meets "in `lib/catalogue`", reasoned in Design Notes.

## Design Notes

**`saveEntry` in `saveCopy.ts`.** Both functions share every private step (targets, held outcome, cover, merge, request memory). A second file would need those exported for one caller; the spine lists functions, not files.

**Request memory per kind.** The id identifies the press, and one press is one kind of save. Keying by kind keeps a wrong-shaped cached result from ever reaching a caller; a client that reuses an id across kinds gets two saves, which is its own bug.

**Bad `Ref` on an ISBN miss.** The list is resolved inside the transaction (a created list must roll back with a failed save), so a foreign id or blank name on a source miss is found after the lookup and cover download; the rollback removes the cover. Answers save with a held outcome, so in practice no source is asked.

## Verification

**Commands:**
- `npx tsc --noEmit --incremental false` -- expected: clean.
- `npm run lint` -- expected: 0 errors.
- `npm run test:reset && npm run test:int` -- expected: all pass, including `saveEntry.int.spec.ts`.

## Auto Run Result

**Summary.** `saveEntry` in `lib/catalogue` (AD-11, FR-21) saves a Book onto a wishlist. For every target (`{ isbn13 }`, `{ bookId }`, `{ manual }`) it ensures the Book exactly as `saveCopy` does, because both now share a private `saveBook(ctx, target, place)`. In the same `withUndo` transaction it creates an open entry with no recipient, through the new `createEntry()` in `lib/wishlists` (the only insert into `wishlist-entries`). It returns the list as `savedTo`. A repeated `requestId` returns the first result; the request memory is now kept per kind of save. Undo deletes the entry, then any Book, author, series or media row that nothing references. A list created through the `Ref` stays.

**Files changed.**
- `src/lib/wishlists/entries.ts` -- new: `createEntry` and its restore.
- `src/lib/catalogue/saveCopy.ts` -- `SaveTarget`, `CopySaveInput`, `EntrySaveInput`, `EntrySaveResult`; shared `saveBook` and `remembered`; `saveEntry`.
- `src/lib/catalogue/saveRequests.ts` -- `oncePerRequest` keyed by kind.
- `tests/int/saveEntry.int.spec.ts` -- new: 10 integration tests.
- `tests/int/saveCopy.int.spec.ts`, `sharePrivateBook.int.spec.ts`, `createPrivateBook.int.spec.ts` -- input type name, `oncePerRequest` kind argument.
- `ARCHITECTURE-SPINE.md` -- AD-11 `requestId` bullet, Shared shapes `SaveResult` / `EntrySaveResult`, `wishlists/` source-tree line.
- `sprint-status.yaml` -- 7.6 done.

**Review.** One pass, 17 findings (medium 1, low 10, false 6). Patched 3 (all low): the spine's Shared shapes now match the code, the `oncePerRequest` doc comment is rewrapped, and a new test undoes a save whose entry is already gone (AD-20). Deferred 1 (medium): a private Book held only by an entry blocks the private-Book merge. That is Story 7.7's own AC. Rejected, each with its reason in the triage log: catching a bad `Ref` only after a lookup (documented, rare); Undo of a closed entry (nothing closes entries yet); `createEntry`'s second read; `kind` not tied to the result type; `Named` redeclared (lint rule); and test-only findings on shared code already covered through `saveCopy` (cover rollback, countdown, auto-share, pick, referenced-row Undo); plus the descriptive intent rows.

**Follow-up review:** not recommended. Patched entries this pass: high 0, medium 0, low 3.

**Verification.** Run after implementation and again after the patches: `tsc --noEmit --incremental false` clean; lint 0 errors (56 existing warnings); `test:reset && test:int` 632 passed (75 files). Matrix audit: all 10 rows covered by passing tests in `saveEntry.int.spec.ts`.

**Residual risks.**
- Deferred to 7.7: an `{ isbn13 }` save fails while the user's private Book with that ISBN is still referenced by an entry and a shared Book exists (merge refuses).
- A bad wishlist `Ref` on a source miss uses up one lookup and downloads a cover before failing; the rollback removes the cover.
- No action or screen yet; 7.14 wires `saveEntry` in.
