---
title: '7.3 [H14] Entries in holdings and Book access'
type: 'feature'
created: '2026-10-27'
status: 'done'
baseline_revision: '650e40115aee11c62532b5827284abb8e097e77c'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md'
warnings: []
deferred:
  - summary: >-
      A scanned ISBN whose Book the viewer holds only through open wishlist entries shows no Answer; the scan screen resets silently.
    evidence: |-
      answer.ts:118 returns null from notInLibrary when entries exist and inLibrary needs a copy, so answerFor returns { kind: 'scan' }. Pre-existing since Story 3.45; getHoldings now fills entries, so it is reachable once Story 7.6 saves entries from the frontend, until Epic 8's On wishlist heading (Stories 8.1/8.2, already their acceptance criteria).
    location: >-
      src/app/(frontend)/scan/answer.ts:118
    severity: medium
  - summary: >-
      Removing the last copy closes Book detail even when open entries still hold the Book.
    evidence: |-
      CopyLine.tsx:142 closes on last && removed; BookDetail.tsx passes last={copies.length === 1}. Handed to Story 7.15 as an acceptance criterion in epics.md.
    location: >-
      src/app/(frontend)/(sections)/BookDetail.tsx:176
    severity: low
---

<intent-contract>

## Intent

**Problem:** `getHoldings()` returns `entries: []` always and `requireOwnBook()` counts copies only, so a Book the viewer holds only through an open wishlist entry cannot be opened and its entries are never listed (AD-7, AD-9).

**Approach:** Fill `Holdings.entries` from the viewer's open `wishlist-entries` rows (with list and recipient names), and let `requireOwnBook()` pass when the viewer has a copy or an open entry of the Book. Prove both with two users and the admin in the existing integration tests.

## Boundaries & Constraints

**Always:**
- Open means `closedAt` unset (`{ closedAt: { exists: false } }`); closed entries appear nowhere and grant no access.
- Reads go through `gateway.*` with the viewer's context; `ownerAccess` limits `wishlist-entries`, `wishlists` and `people` to the viewer's rows, admin included, so no `owner` condition (as for copies and loans).
- Entries read at `depth: 0`, oldest first, ties by id (`sort: ['createdAt', 'id']`, as copies). List and recipient names from one read each of the distinct ids (`select: { name: true }`), like locations and borrowers.
- `EntryLine` stays `{ entryId, wishlist: Named, forPerson: Named | null }`; `Holdings` shape unchanged. An entry whose list did not load is dropped (cannot happen under the FK; mirror the loan/borrower guard), a missing recipient reads as `null`.
- Entries are read for every requested Book even when the viewer has no copies (the current early return on zero copies must not skip them).
- `requireOwnBook()` stays the one gate: non-row id fails before any read; copies counted first, open entries counted only when there are no copies; `NOT_FOUND` when neither. `books` is still not read.
- Update the doc comments on `getHoldings`, `EntryLine` and `requireOwnBook` that say entries come in Epic 7.

**Never:**
- No change to the Answer (`scan/answer.ts`), Book detail, the shelf, `lookupBook`, `saveCopy` or any screen: the "On wishlists" group and the no-copies-group rule are Story 7.15, the On wishlist Answer is Epic 8.
- No `lib/wishlists`, no `visibleEntries`, no `PersonUse` change, no migration, no new collection field.
- No ARCHITECTURE-SPINE.md change: AD-7 (line 152), AD-9 (line 174) and the Shared shapes (lines 441–442) already state this rule.
- No `Promise.all` over reads that may share one transaction's connection; keep the reads sequential as the file does now.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Open entries, no copies | A has two open entries for Book W (one for Person P, one for herself), no copies | `getHoldings(asA,[W])` → `copies: []`, `entries` both in creation order: `{ entryId, wishlist: {id,name}, forPerson: {id,name} }` and `forPerson: null` | — |
| Copies and entries | A has a copy and an open entry of Book X | both `copies` and `entries` filled | — |
| Closed entry | A's entry on Book C has `closedAt` set, no copies | `entries: []`; `requireOwnBook(asA, C)` → `NOT_FOUND` | `DomainError('NOT_FOUND')` |
| Same Book twice | A has two open entries for W on one list | two lines, distinct `entryId` | — |
| Other user / admin | B and the admin ask for W | `{ copies: [], entries: [] }`; `requireOwnBook` → `NOT_FOUND` | `DomainError('NOT_FOUND')` |
| Wish-only access | A has only an open entry of W | `requireOwnBook(asA, W)` resolves | — |

</intent-contract>

## Code Map

- `src/lib/books/holdings.ts:23-29` -- `EntryLine`, `Holdings` types (keep; update `EntryLine` comment). `:32-49` doc comment ("`entries` stays empty until Epic 7") to rewrite. `:50-64` `getHoldings` returns early when there are no copies; restructure so entries are read regardless. `:66-77` locations name read and `:106-131` `openLoansOf` people read: the name-read pattern to reuse (a small private helper shared by locations, people and wishlists is welcome if the gateway generics type it cleanly; otherwise inline a third read).
- `src/lib/books/requireOwnBook.ts` -- add the open-entry count after the copies count; rewrite "Open wishlist entries join the rule in Epic 7."
- `src/collections/WishlistEntries.ts` -- fields `wishlist` (required), `book` (required), `forPerson` (optional), `closedAt`; slug `wishlist-entries`. Read-only here.
- `src/lib/payload/gateway.ts:54-73` -- `find`, `count` (typed by `AppSlug`). Read-only.
- `src/lib/payload/ref.ts` -- `idOf()` for relation values at depth 0.
- `tests/int/holdings.int.spec.ts` -- extend with an `entries` describe: fresh Books via `systemBook`, entries created through the gateway as A (`gateway.create(asA, { collection: 'wishlist-entries', data: { owner, wishlist, book, forPerson?, closedAt? } })`), a wishlist via `gateway.create(asA, { collection: 'wishlists', data: { owner, name: unique('Toiveet'), nameKey: 'ignored' } })`, a Person via `gateway.create(asA, { collection: 'people', ... })` (see `tests/int/wishlistEntries.int.spec.ts` for `personAs` and the list helper). Existing exact `toEqual` assertions on `x` stay valid only if no entries are added on `x`; use fresh Books.
- `tests/int/requireOwnBook.int.spec.ts` -- add: passes with an open entry only; `NOT_FOUND` with a closed entry only; `NOT_FOUND` for B on A's wish-only Book.
- `tests/int/wishlistEntries.int.spec.ts` -- helpers to copy (list, Person and entry creation through the gateway). Read-only.
- Callers that change behaviour without edits (wish-only Books now pass): `src/app/(frontend)/heldBook.ts` (Book detail / Edit book open), `src/lib/books/setRead.ts`, `setRating.ts`, `src/lib/catalogue/{editBook,setCover,refetchBook,lookupAgain,saveCopy}.ts`. This is the spine rule; do not edit them.

## Tasks & Acceptance

**Execution:**
- `src/lib/books/holdings.ts` -- read the viewer's open entries for `bookIds`, the distinct list names and recipient names, push `EntryLine`s onto each Book; read entries even when there are no copies; update doc comments.
- `src/lib/books/requireOwnBook.ts` -- pass on a copy or an open entry; update doc comment.
- `tests/int/holdings.int.spec.ts` -- `entries` describe covering the matrix rows for `getHoldings` (no copies, with copies, closed, same Book twice, B and admin see none).
- `tests/int/requireOwnBook.int.spec.ts` -- wish-only pass, closed-only `NOT_FOUND`, B `NOT_FOUND`.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `7-3-h14-entries-in-holdings-and-book-access: done` when the story is done.

**Acceptance Criteria:**
- Given the viewer has open entries for a Book, when `getHoldings` runs for it, then `entries` lists each open entry as an `EntryLine` (entry id, list, recipient or `null`), oldest first, whether or not the viewer has copies.
- Given a Book the viewer holds only through an open entry, when `requireOwnBook` runs, then it resolves; given only closed entries, it fails with `NOT_FOUND`.
- Given user A's entries, when user B or the admin calls `getHoldings` or `requireOwnBook` for that Book, then no entry of A's appears and access fails with `NOT_FOUND` (two-user test).

## Spec Change Log

## Review Triage Log

### 2026-10-27 — Review pass
- verdicts: 16 findings — high 0, medium 1, low 9, false 6, maybe-false 0
- findings:
  - `[low]` `[patch]` Blind: no admin check of `requireOwnBook` on a wish-only Book, though the AC names B or the admin — added the admin assertion to the wish-only `NOT_FOUND` test.
  - `[low]` `[patch]` Blind: caller doc comments still describe the copy-only gate (`saveCopy.ts:79`, `setRating.ts:10`, `edit/page.tsx:40`) — reworded to "a copy or an open wishlist entry".
  - `[false]` `[reject]` Blind: a missing recipient reads as the viewer's own wish — `forPerson` is an `ownedRelation` to the viewer's Person under a foreign key, so the Person row exists and the viewer's `people` read returns it; the `?? null` branch is unreachable.
  - `[low]` `[reject]` Blind: every `getHoldings` caller pays one more query on the shelf path — one indexed `wishlist-entries` find per page; the spine (AD-9) makes `getHoldings` the one reader of copies and entries for shelf rows too; an opt-in flag adds a parameter for no measured cost.
  - `[low]` `[reject]` Blind: a `{ bookId }` save of a wish-only Book makes a copy and leaves the entry open — Story 7.7's AC ("When `saveCopy` runs for a Book … closes my open entries"); no screen offers that save for a wish-only Book (Add another copy is on the In library Answer, which needs a copy).
  - `[low]` `[defer]` Blind: removing the last copy closes Book detail although open entries still hold the Book (`CopyLine.tsx:142`, `last={copies.length === 1}`) — reachable only through admin-made entries until 7.6; handed to Story 7.15 as an acceptance criterion in `epics.md`.
  - `[low]` `[patch]` Blind: `getHoldings` doc does not state the `wishlist-entries` access rule; "in the same order" is vague — comment now says the gateway reads of `wishlist-entries` and `wishlists` reach the viewer's rows alone and "oldest first, ties by id".
  - `[false]` `[reject]` Blind: the "Same Book twice" matrix row is not tested in its intended form — the row is two entries for one Book on one list yielding two lines with distinct ids; the first entries test asserts exactly that (the differing `forPerson` does not change the row).
  - `[low]` `[reject]` Blind: wishlist/entry fixtures repeated across three test files instead of `tests/helpers` — developer-only, three short blocks; a shared helper is a refactor beyond a direct correction.
  - `[medium]` `[defer]` Edge: a scanned Book held only through open entries gets no Answer (`answer.ts:118` returns `null` from `notInLibrary`, `inLibrary` needs a copy, so `{ kind: 'scan' }`) — pre-existing design from Story 3.45 made reachable by this story; reachable from the frontend once 7.6 saves entries, until Epic 8's On wishlist heading (Story 8.1/8.2, already their AC). Recorded in `deferred`.
  - `[false]` `[reject]` Edge: missing recipient reported as own wish — same refutation as the Blind row.
  - `[low]` `[patch]` Edge: admin `requireOwnBook` not checked — same patch as the Blind row.
  - `[low]` `[patch]` Verification gap (other): stale copy-only comments in `saveCopy.ts` and `setRating.ts` — same patch as the Blind row.
  - `[false]` `[reject]` Intent: the "so that" clause (open and list entries on a screen) is untested at the screen surface — the story's ACs name `getHoldings` and `requireOwnBook`; the screen group is Story 7.15's AC, the Answer Epic 8's.
  - `[false]` `[reject]` Intent: `visibleEntries` for Lookup's own-library results is not built — spine AD-7 places it with Lookup (Epic 8); 7.3's ACs do not ask for it.
  - `[false]` `[reject]` Intent: the `namesOf()` refactor is beyond the intent — behaviour-preserving on the location and borrower reads; the existing holdings tests for both pass unchanged.

## Design Notes

**Copies first in `requireOwnBook`.** The common case holds a copy, so the copy count stays the only query for it; the entry count runs only when that is zero.

**Wish-only Books open now.** Once this lands, a Book held only through an entry passes every `requireOwnBook` gate: Book detail opens (with an empty "Your copies" heading until 7.15), read/rating and Edit book work (spine AD-6 note: "read/tags work for wishlist-only Books"), and the Answer shows no heading for it (`answer.ts:118` returns `null` from `notInLibrary` when entries exist) until Epic 8's On wishlist Answer. Entries can be made only through the admin until 7.6, so neither gap is reachable from the frontend yet.

## Verification

**Commands:**
- `npm run typecheck` -- expected: clean (also `npx tsc --noEmit --incremental false`).
- `npm run lint` -- expected: 0 errors.
- `npm run test:unit` -- expected: all pass.
- `npm run test:reset && npm run test:int` -- expected: all pass, including `holdings.int.spec.ts` and `requireOwnBook.int.spec.ts`.

## Auto Run Result

**Summary.** Open wishlist entries now count as holding a Book. `getHoldings()` fills `entries` with the viewer's open entries (`closedAt` unset), oldest first, with list and recipient names, whether or not the viewer has copies. `requireOwnBook()` passes on a copy or, when there is none, on an open entry; closed entries grant nothing. No spine change: AD-7, AD-9 and the Shared shapes already state the rule.

**Files changed.**
- `src/lib/books/holdings.ts` -- entries read after copies (no early return on zero copies); private `namesOf()` for the location, borrower, list and recipient name reads; doc comments.
- `src/lib/books/requireOwnBook.ts` -- copy count, then open-entry count; doc comment.
- `src/lib/catalogue/saveCopy.ts`, `src/lib/books/setRating.ts`, `src/app/(frontend)/books/[bookId]/edit/page.tsx` -- doc comments only: the gate is a copy or an open entry (review patch).
- `tests/int/holdings.int.spec.ts` -- `entries` describe: no copies (recipient and own, same Book twice), copies and entries together, closed left out, B and admin see none.
- `tests/int/requireOwnBook.int.spec.ts` -- wish-only passes, closed-only `NOT_FOUND`, B and admin `NOT_FOUND` on A's wish-only Book.
- `_bmad-output/planning-artifacts/epics.md` -- Story 7.15 gains the AC that removing the last copy keeps Book detail open while entries remain (handed on by review).
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 7.3 done.

**Review.** One pass, 16 findings (medium 1, low 9, false 6). Patched 3 entries (low: admin `requireOwnBook` assertion, stale copy-only comments in three callers, `getHoldings` doc wording). Deferred 2 (medium: wish-only Book gets no Answer on scan, until Epic 8; low: last-copy removal closes Book detail, handed to 7.15). Rejected: the shelf-query cost (spine makes `getHoldings` the one reader), the `{ bookId }` save leaving entries open (7.7's AC), test-helper consolidation, and the false rows, each with its reason in the triage log.

**Follow-up review:** not recommended. Patched entries this pass: high 0, medium 0, low 3.

**Verification.**
- Implementer: `tsc --noEmit --incremental false` clean; lint 0 errors; `test:int` 615 passed (73 files); `test:unit` 968 passed (one earlier run had 2 failures in an untouched file, not reproduced in two reruns).
- Re-run after implementation and after the review patches: `tsc --noEmit --incremental false` clean; lint 0 errors (56 warnings, pre-existing); `test:unit` 968 passed; `test:reset && test:int` 615 passed (73 files).
- Matrix audit: all 6 rows covered by passing tests.

**Residual risks.**
- From Story 7.6 on, scanning a Book held only through open entries shows no Answer (`answer.ts:118`, `{ kind: 'scan' }`) until Epic 8's On wishlist heading (8.1/8.2).
- A wish-only Book's Book detail shows an empty "Your copies" heading until 7.15 (already its AC); removing the last copy of a wished Book closes Book detail until 7.15 (now its AC).
- `epics.md` changed, so `epic-7-context.md` is stale and will be recompiled on the next run.
