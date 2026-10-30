---
title: '7.17 [K23] Wishlist and loan clean-up'
type: 'refactor'
created: '2026-10-30'
status: 'done'
baseline_commit: 'a1009cacefcd99fd2aa2f890f254d7eedd43f44e'
route: 'dispatch'
review_loop_iteration: 0
followup_review_recommended: false
warnings: ['oversized']
deferred: []
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Seams between wishlists, scanning and loans let the screens disagree (Epic 7 retro items 73, 78, decisions 1–2; Epic 6 retro items 65, 67, decisions 1, 2, 4):
- A scan of a Book held only through open entries lands on a bare Scan, with no Answer.
- Bought or Ordered on one of my own entries leaves my other own entries for the same Book open, while a save closes them all.
- On the Not found form, Add to library stays live while Add to wishlist runs, so Enter can make a second private Book.
- Edit book can set a lent copy to Ordered, which the Lent marker rows can't show.
- Lend's Undo deletes a loan that has been returned since, erasing history.
- `receiveCopy.ts` and `createCopy.ts` count loans without an `owner` filter.
- The Lend picker's date default and `max` come from the server render, so Book detail open past midnight offers yesterday.

**Approach:** Close each seam where it lives: `notInLibrary()` answers for entry-only holdings; `closeEntry()` closes through `closeEntriesForBook()` for an own entry; `setStatus()` refuses Ordered on a copy with an open loan; Lend's restore refuses a returned loan; the loan counts filter on `owner`; the Lend picker reads today in Helsinki at each open. The spine's AD-18, AD-20, `copies.status` rule and Design Paradigm follow in the same commit.

## Boundaries & Constraints

**Always:**
- Entry-only holdings (my own entries or ones for a Person) answer Not in library with Add to library and Add to wishlist. Add to library from it closes only my own open entries (Story 7.7's rule, unchanged in `saveCopy`).
- `closeEntry()` on an entry with no recipient closes every one of my open no-recipient entries for its Book, across lists, through `closeEntriesForBook()` in its transaction, and creates exactly one copy. Its restore deletes the copy, then reopens every entry it closed. An entry for a Person closes alone and makes no copy.
- `setStatus(…, { status: 'ordered' })` on a copy with an open loan fails with `VALIDATION` on `status`, nothing written. A returned loan does not refuse.
- The status error renders under the Status switch (EN + FI, terse, says to return the copy first), not under Location.
- Lend's restore on a loan with `returnedOn` set fails with `UNDO_FAILED`; the loan stays as it is.
- Every loan read filters on `owner` (FR-48).
- `lib/loans/dates` joins the client allowlist (ESLint rule, its messages, the spine's Design Paradigm line).
- Spine updates (AD-18 `closeEntry()`, AD-20 refusals, `copies.status`, Design Paradigm) land in this commit.

**Never:**
- No On wishlist heading on the Answer (Story 8.2).
- No foreign-key changes (Story 7.18).
- No new Undo for setStatus, no migration.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Entry-only scan | `existing`, no copies, ≥1 entry | `{ kind: 'notInLibrary' }` | — |
| Bought own, two lists | two own open entries, no recipient | both closed, one owned copy; Undo deletes the copy, reopens both | — |
| Bought for a Person | Person entry + own entry for same Book | Person entry closed, no copy, own entry open | — |
| Ordered on lent copy | copy with open loan | nothing saved | `VALIDATION` `{ status }` |
| Ordered after return | copy with only a returned loan | copy ordered, location cleared | — |
| Lend Undo after Return | loan returned since lend | loan kept, returned | `UNDO_FAILED` |
| Received Undo after a returned loan | copy received, lent, returned | copy back to ordered | — |
| Save Undo after a returned loan | saved copy, lent, returned | copy kept | `UNDO_FAILED` from the explicit check (DomainError), not the FK |

</frozen-after-approval>

## Code Map

- `src/app/(frontend)/scan/answer.ts:114-119` -- `notInLibrary()`: drop the `mine.entries.length > 0` exclusion; fix the doc. `inLibrary()` doc's "held only by wishlist entries is On wishlist's" sentence becomes "answers Not in library until Story 8.2's On wishlist heading".
- `tests/unit/answer.unit.spec.ts:177-179,420-426` -- the entry-only cases expect the Answer, not `null` / `{ kind: 'scan' }`.
- `src/lib/wishlists/entries.ts:134-199` -- `closeEntry()`: after the open-entry find, for `forPerson == null` call `closeEntriesForBook(tx, bookId)` (it closes this entry too) instead of the single `updateByID`; restore = copy restore, then `closed.restore`. Person entry keeps the single close. Update doc.
- `tests/int/closeEntry.int.spec.ts:121-136` -- first case asserts `other` stays open; now both close. Add: undo across two lists reopens both; Person entry closes alone leaving an own entry open.
- `src/lib/copies/updateCopy.ts:18-29` -- `setStatus()`: for `ordered`, count the copy's open loans (`owner` filter, `returnedOn` absent) after `requireOwnCopy`; >0 → `DomainError('VALIDATION', { fields: { status: 'VALIDATION' } })`.
- `src/lib/catalogue/editBook.ts:157-165` -- doc: Ordered on a lent copy fails on `status`.
- `tests/int/copyWrites.int.spec.ts` -- two cases: open loan refuses, nothing changes; returned loan allows. Reuse `personOf`, `loanOf`.
- `src/app/(frontend)/books/[bookId]/edit/CopyFields.tsx` -- new `statusError?: string` rendered under the TextSwitch as `<p id className="text-meta">`, linked by `aria-describedby`.
- `src/app/(frontend)/components/TextSwitch.tsx` -- optional `describedBy` → `aria-describedby` on the group.
- `src/app/(frontend)/books/[bookId]/edit/EditBookScreen.tsx:172-173,283-290` -- `editCopy` clears `status` as well as `location`; pass `statusError={marks.status && t('editBook.returnFirst')}`.
- `messages/en.json`, `messages/fi.json` (`editBook`) -- `returnFirst`: "Lent out. Return it first." / "Lainassa. Palauta se ensin."
- `src/lib/loans/loans.ts:173-176` -- `deleteLoan()` (Lend's restore): read the loan; gone → skip; `returnedOn` set → `UNDO_FAILED`. Doc of `lendCopy()`.
- `tests/int/loansService.int.spec.ts` -- one case: lend, return, undo the lend → `UNDO_FAILED`, loan kept returned.
- `src/lib/copies/receiveCopy.ts:83-86`, `src/lib/copies/createCopy.ts:52` -- add `{ owner: { equals: ctx.user.id } }` to the loan counts.
- `tests/int/receiveCopy.int.spec.ts` -- one case: receive, lend, return, Undo succeeds (ordered, no location).
- `tests/int/saveCopy.int.spec.ts:771-793` -- sibling case: lend, return, Undo → `UNDO_FAILED` from a `DomainError` (warn spy, as the existing case).
- `src/app/(frontend)/scan/NotFoundForm.tsx`, `AddToWishlist.tsx` -- `AddToWishlist` gets `onBusyChange?(busy)`; busy = save pending, or latched after a non-`stay` success. `NotFoundForm` keeps `wishing` state, disables Add to library with `pending || wishing` and its `submit` returns early while `wishing`.
- `tests/unit/notFoundForm.unit.spec.ts` -- one case: wishlist save held pending → Add to library disabled, Enter submits nothing.
- `src/app/(frontend)/(sections)/LendPicker.tsx` -- drop `today` prop; state `today` set to `helsinkiToday()` at each open (in the existing open-reset block), used for default and `max`.
- `src/app/(frontend)/(sections)/CopyLine.tsx:244-278`, `BookDetail.tsx:9,53,97,150` -- drop `today` plumbing; doc no longer says today is read.
- `tests/unit/lendPicker.unit.spec.ts` (new) -- clock at 23:50 Helsinki, open → date = that day; close, clock past midnight, open → new day and `max`.
- `eslint.config.mjs:93-115` -- add `lib/loans/dates` to `pure` and to both messages and description.
- `tests/unit/clientLibImports.unit.spec.ts` -- message text assertions, if any, follow.
- `_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md` -- line 64 (Design Paradigm allowlist), line 160 (`copies.status`: an ordered copy is never lent; Ordered on a lent copy is refused), line 251 (AD-18 `closeEntry()` closes through `closeEntriesForBook()` for own entries), line 283 (AD-20: Lend's restore refuses a returned loan).

## Tasks & Acceptance

**Execution:**
- [x] `src/app/(frontend)/scan/answer.ts` + `tests/unit/answer.unit.spec.ts` -- entry-only → Not in library -- AC 1.
- [x] `src/lib/wishlists/entries.ts` + `tests/int/closeEntry.int.spec.ts` -- close own entries together -- FR-28, decision 1.
- [x] `src/app/(frontend)/scan/AddToWishlist.tsx`, `NotFoundForm.tsx` + `tests/unit/notFoundForm.unit.spec.ts` -- disable Add to library while wishing.
- [x] `src/lib/copies/updateCopy.ts`, `editBook.ts` doc + `tests/int/copyWrites.int.spec.ts` -- refuse Ordered on lent copy.
- [x] `TextSwitch.tsx`, `CopyFields.tsx`, `EditBookScreen.tsx`, `messages/*.json` -- status error under the switch.
- [x] `src/lib/loans/loans.ts` + `tests/int/loansService.int.spec.ts` -- Lend Undo refuses a returned loan.
- [x] `src/lib/copies/receiveCopy.ts`, `createCopy.ts` -- `owner` on loan counts.
- [x] `tests/int/receiveCopy.int.spec.ts`, `tests/int/saveCopy.int.spec.ts` -- AD-20 returned-loan cases.
- [x] `LendPicker.tsx`, `CopyLine.tsx`, `BookDetail.tsx` + `tests/unit/lendPicker.unit.spec.ts` -- today at open.
- [x] `eslint.config.mjs` (+ its unit spec if messages are pinned) -- allowlist `lib/loans/dates`.
- [x] `ARCHITECTURE-SPINE.md` -- AD-18, AD-20, `copies.status`, Design Paradigm.
- [x] `sprint-status.yaml` -- 7-17 to review (the workflow's target); retro items 65, 67, 73, 78 done with a resolution.

**Acceptance Criteria:**
- Given a scan of a Book I hold only through open entries, when the lookup returns, then the Not in library Answer shows with Add to library and Add to wishlist; Add to library closes my own entries and leaves Person entries open.
- Given the Not found form, when the wishlist press is pending, then Add to library is disabled and Enter creates nothing.
- Given Edit book on a lent copy, when I choose Ordered and Save, then the error shows under the Status switch in the current language and nothing is saved.
- Given Book detail left open past midnight, when I open Lend, then the date and its `max` are the new Helsinki day.
- Given the spine, when the story is done, then AD-18, AD-20, `copies.status` and the Design Paradigm allowlist state the new rules.

## Implementation Notes

- Implemented in the main session, not a dispatched subagent: the investigation was already in context.
- `notInLibrary()` drops only the entries exclusion; `answerFor()` keeps its `{ kind: 'scan' }` fallback, now reached only by an `existing` Book with no ISBN.
- `closeEntry()`: the Person branch keeps its single `updateByID`; the own branch calls `closeEntriesForBook()` before `createCopy()`, so the AD-16 rollback case (`createCopy` mocked to fail) still sees the entry closed inside the transaction.
- `setStatus()` counts open loans (owner-filtered) only for `ordered`. `editBook()` passes the `VALIDATION` through unchanged; `EditBookScreen` shows `marks.status` as `editBook.returnFirst` under the switch (`TextSwitch` gained `describedBy`). Either copy field clears both copy marks.
- `deleteLoan()` (Lend's restore) is a find with `select: { returnedOn }` in place of `loanExists()`, which `reopenLoan()` still uses.
- `AddToWishlist` reports `pending || leaving` through `onBusyChange`; `leaving` is set on a non-`stay` success and cleared on effect cleanup, so an Activity-revived Not found form is live again. `NotFoundForm.submit` also returns early while wishing, since Enter can submit past a disabled button.
- `LendPicker` holds `today` in state, set with `lentOn` in the open-reset block; `BookDetail` and `LendCopy` no longer pass it.
- EXPERIENCE.md's Bought and Ordered rows (toast Undo and opened-entry table) now say every own entry the press closed reopens / closes; the PRD's FR-28 wording already allows it.
- Not done: no data fix for copies that were set to Ordered while lent before this story (no migration in scope); a single-user tailnet DB, so the owner can check with one query if needed.
- Epic 7 context was compiled 2026-10-28, before `epics.md` gained 7.16–7.27; not recompiled, as 7.16 did not. This spec read the spine and code directly.

## Spec Change Log

## Review Triage Log

One inline pass over the diff with the blind, edge-case and verification-gap lenses (no reviewer subagents were launched: the user had not asked for subagents).

- `low` patch — EXPERIENCE.md's Bought / Ordered rows said Undo "reopens the entry" and Bought "closes the entry"; with decision 1 they close and reopen every own entry. Rows reworded.
- `low` reject — copies set to Ordered while lent before this story stay so; a fix is a data migration outside the intent, and one user would meet it only on a copy they know about. Noted in Implementation Notes.
- `false` — `useState(helsinkiToday)` could mismatch on hydration: the date field renders only inside the open Sheet/Dialog, and the picker mounts closed.
- `false` — `marks.status` could collide with a More details field: no Book field is named `status`.
- `false` — the Not found unit case would pass without the fix: before it, Add to library was disabled only by its own `pending`, so the `waitFor` on `disabled` times out and the submit reaches `saveManualAction`.
- `false` — reopening entries on a closed-entry Undo could reopen one the user removed since: `reopenEntries()` finds first and skips rows that are gone.

## Design Notes

`closeEntry()` own-entry branch, sketch:

```ts
if (entry.forPerson != null) { /* single close as today */ }
const bookId = idOf(entry.book)
const closed = await closeEntriesForBook(tx, bookId) // includes entryId
const copy = await createCopy(tx, …)
restore: async (rtx) => { await copy.restore(rtx); await closed.restore(rtx) }
```

Busy reporting from `AddToWishlist` uses an effect on `busy`, so the parent's state follows React's own pending flag; the latched-after-success part keeps Add to library dead during the navigation back, which is the window where a tap would add a second private Book.

## Verification

**Commands:**
- `npm run lint` -- expected: clean
- `npm run typecheck` -- expected: clean
- `npm run test:unit` -- expected: all pass
- `npm run test:int` -- expected: all pass (needs Postgres)

## Auto Run Result

Lanes, local Postgres 16 with ICU fi-FI databases:
- `npm run lint`: 0 errors (56 pre-existing warnings in migrations). `npm run typecheck`: clean.
- `npm run test:unit`: 75 files, 1048 tests passed.
- `npm run test:int`: 668 of 670 passed. `collation.int.spec.ts` fails here only because this container's `template1` is not ICU fi-FI (CI's image is); `shelfTiming.int.spec.ts` text search took 2990 ms under the parallel lane and passed alone (4/4).
- Every I/O matrix row has a passing case: `answer.unit` (entry-only), `closeEntry.int` (own across two lists, Undo across two lists, Person alone), `copyWrites.int` (open loan refuses, returned allows), `loansService.int` (Lend Undo after Return), `receiveCopy.int` and `saveCopy.int` (returned-loan Undo).

Playwright walk (`tests/e2e/k23.walk.spec.ts`, git-ignored, against the e2e server with `BOOKEH_SOURCES=fixture`), passed in 35 s:
1. Sapiens scanned, Add to wishlist with no lists, "Walk list" typed: back on Scan, toast "Added to Walk list".
2. Scanned again: "Not in library" heading with Add to library and Add to wishlist. Add to library saved it; toast Edit link `/books/18427/edit?copy=20471`.
3. Book detail: Your copies shown, no On wishlists group (the own entry closed). Lend opened with Lent on `2026-10-30` and `max` `2026-10-30` (Helsinki today). Lent to "Walk Person".
4. Edit book for that copy: Ordered, Save: "Lent out. Return it first." under the Status switch (the group's `aria-describedby` names it), toast "Check the marked fields.", nothing saved.

