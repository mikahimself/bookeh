---
title: 'Story 4.9: [D22] Edit from the save toast'
type: 'feature'
created: '2026-10-21'
status: 'done'
baseline_revision: 'bed66d461325b0fffb35f39cfc9aef8f10d9ea7f'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** The save toast reads "Saved to {location} · Undo" with no Edit, and Edit book cannot change a copy. So a copy cannot be marked ordered or moved right after it is added (FR-13, FR-28).

**Approach:** The save toast gets an Edit Link to `/books/{bookId}/edit?copy={copyId}`. With `?copy=` naming one of the viewer's copies of that Book, Edit book's first screen shows a Status text switch (owned / ordered) and a Location combobox with inline add, starting at the saved values. Save sends the change as `EditBookInput.copy` (already in the spine's Shared shapes), and `editBook()` writes it in the same transaction as the Book edits, through `setStatus` and `moveCopies`.

## Boundaries & Constraints

**Always:**
- Toast: `ToastInput` success gains `edit?: string` (an href). The provider shows an Edit `TextLink` before Undo while the toast is not leaving. Tapping it dismisses the toast and navigates. `useAddToLibrary` passes `/books/${bookId}/edit?copy=${copyId}` from `SaveResult`.
- Page: `?copy=` is used only when it is digits and appears in `getHoldings(ctx, [bookId])` for this Book. Otherwise there are no copy fields, and there is no error. Props: `copy: { id, status, location: number | null }`, where an ordered copy's `location` is the user's default location (what owned would give it), plus `locations` from `listLocations(ctx)`.
- The change is sparse, compared with the saved copy:
  - ordered: `{ id, status: 'ordered' }`, or nothing if the copy was already ordered.
  - owned, after ordered: `{ id, status: 'owned', location }` with the location as shown (`Ref | null`).
  - owned, after owned: `{ id, location }` only when the location differs (a `{ create }` always differs).
- Choosing ordered hides the combobox and keeps its value, so switching back to owned shows it again.
- The change lives in the draft as the key `copy` (`Draft = BookEdits & { copy?: EditBookInput['copy'] }`). It counts toward `dirty` and the "Discard changes?" guard, and it survives sign-in through `sessionStorage`. A restored `copy` whose `id` is not the screen's copy is dropped. Save sends `{ bookId, edits, copy }`, with `edits` the draft without `copy`.
- `editBook()`: inside its transaction, after `requireOwnBook` and the Book's edits, `copy` is written:
  - `status` → `setStatus(tx, id, { status, location })`, where `location` is `undefined` when it is absent.
  - `location` alone → `moveCopies(tx, [id], location)`, discarding the restore.
  - `ordered` together with `location` → `VALIDATION` on `location` before any read.
  - An empty edit with a `copy` still writes the copy. Any failure rolls back everything.
- `editBookAction` checks `copy` as client input: `undefined`, or a plain object with `id` a positive safe integer, `status` `undefined | 'owned' | 'ordered'`, and `location` `undefined | null | positive safe integer | { create: string }`. Anything else is `VALIDATION` on `copy`.
- A `location` mark shows under the combobox. Save closes with "Saved" (`closeTask(null)`, as in 4.7). Opened from the Scan toast, history back is Scan.
- Interface text in English and Finnish, tokens only.

**Never:**
- No change to the spine: `EditBookInput.copy` already matches it.
- No change to `setStatus`, `moveCopies` or `requireOwnBook`, and no Undo on Edit book.
- No copy note or removal on Edit book (Book detail, Epic 5), no tags (Epic 9), no Ordered heading (Story 8.2).
- No new Playwright test.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Toast Edit | save returns `{ bookId: 7, copyId: 9, savedTo: Tampere }` | toast "Saved to Tampere" with Edit → `/books/7/edit?copy=9`; tapping Edit dismisses the toast | No error expected |
| Mark ordered | copy 9 owned at Tampere; tap "ordered", Save | location hidden; `editBookAction({ bookId: 7, edits: {}, copy: { id: 9, status: 'ordered' } })`; "Saved", back to Scan | No error expected |
| Move | copy 9 owned at Tampere; choose Mökki (id 4) | draft `copy: { id: 9, location: 4 }`; X asks "Discard changes?" | No error expected |
| Back and forth | ordered, then owned again | the draft has no `copy` | No error expected |
| One transaction | `editBook` with `edits: { title: 'X' }`, `copy: { id, status: 'ordered', location: 4 }` | `VALIDATION` on `location`; title unchanged | rejected |
| Foreign copy param | `?copy=` of another Book or another user | no copy fields | none |

</intent-contract>

## Code Map

- `src/app/(frontend)/components/toast/store.ts:3` -- `ToastInput`. Add `edit?: string` to success.
- `src/app/(frontend)/components/toast/ToastProvider.tsx:116` -- `actions`, currently Undo or Reload. Render Edit (`TextLink`, `onClick={store.dismiss}`) before Undo.
- `src/app/(frontend)/components/Link.tsx` -- `TextLink` (NextLink). The push is depth-stamped by `navigation.ts`, so Edit book's history back lands on `/scan`.
- `src/app/(frontend)/scan/useAddToLibrary.ts:76` -- `show({...})` for the save. `result.data` has `bookId` and `copyId` (`SaveResult`, `src/lib/catalogue/saveCopy.ts:33`).
- `src/lib/catalogue/editBook.ts:38` -- `EditBookInput = { bookId; edits }`. Add `copy?: { id: number; status?: 'owned' | 'ordered'; location?: Ref | null }`. The transaction returns early on `keys.length === 0` and on the private-Book branch. Restructure it so the copy write runs after the Book write in every branch.
- `src/lib/copies/updateCopy.ts:17` -- `setStatus(ctx, copyId, CopyStatus)`. It joins the caller's transaction and checks ownership. Owned with an `undefined` location gives the default location.
- `src/lib/copies/moveCopies.ts:39` -- `moveCopies(ctx, ids, Ref | null)`. It refuses an ordered copy with `VALIDATION` on `location`. Read-only.
- `src/lib/copies/locations.ts` -- `CopyStatus`, `listLocations(ctx): LocationOption[]`.
- `src/lib/books/holdings.ts:48` -- `getHoldings(ctx, ids)` returns `Map<bookId, Holdings>` (`copies: CopyLine[]`, with `copyId`, `status` and `location: Named | null`).
- `src/app/(frontend)/books/[bookId]/edit/page.tsx` -- add `searchParams`. `ctx.user.defaultLocation` is `number | UserLocation | null | undefined`.
- `src/app/(frontend)/books/[bookId]/edit/actions.ts` -- `editBookAction` input checks. Add `copy`.
- `src/app/(frontend)/books/[bookId]/edit/draft.ts` -- `Draft = BookEdits`. Widen it with `copy`. `setEdit` is generic over `keyof Draft`.
- `src/app/(frontend)/books/[bookId]/edit/EditBookScreen.tsx` -- the restored draft, `edit`, `save` (`edits: draft`) and the marks. Render the copy fields between the header and `MoreDetails`.
- `src/app/(frontend)/components/TextSwitch.tsx`, `components/ui/Combobox.tsx` -- `Combobox` takes `value: Ref | null`, `options: { id, label }[]` and `error`. `(sections)/settings/DefaultLocationField.tsx` shows the usage.
- `src/app/(frontend)/scan/answer.ts:223` -- `copyLines` already renders an ordered copy as "Ordered" (`tests/unit/answer.unit.spec.ts:244`). The Answer AC needs no code.
- Mockup `key-scan-phone.html:101`: label "Status", then the switch Owned / Ordered, then the field "Location", then More details.
- Tests: `tests/unit/toastUndo.unit.spec.ts` (ToastProvider harness), `tests/unit/editBookScreen.unit.spec.ts` (`open()` harness), `tests/int/editBook.int.spec.ts` (`holdCopy`, two users).

## Tasks & Acceptance

**Execution:**
- `src/lib/catalogue/editBook.ts` -- `copy` on `EditBookInput`, and the write order as in Always. Extend the doc comment. -- one transaction.
- `src/app/(frontend)/books/[bookId]/edit/actions.ts` -- the `copy` input check. Pass `copy` through. -- client input.
- `src/app/(frontend)/components/toast/store.ts`, `ToastProvider.tsx`, `src/app/(frontend)/scan/useAddToLibrary.ts` -- toast Edit. -- entry point.
- `src/app/(frontend)/books/[bookId]/edit/draft.ts` -- widen `Draft`. -- persistence.
- `src/app/(frontend)/books/[bookId]/edit/CopyFields.tsx` -- client component: the Status `TextSwitch` and the Location `Combobox` (hidden when ordered), with props `saved`, `locations`, `value` (the draft's `copy`), `error` and `onChange(copy | undefined)`. It owns the shown status and location and derives the sparse change. -- the fields.
- `src/app/(frontend)/books/[bookId]/edit/EditBookScreen.tsx`, `page.tsx` -- props, restore filter, `edit('copy', …)`, Save payload. Update the doc comments. -- wiring.
- `messages/en.json`, `messages/fi.json` -- `toast.edit` "Edit" / "Muokkaa"; `editBook.status` "Status" / "Tila"; `editBook.owned` "Owned" / "Oma"; `editBook.ordered` "Ordered" / "Tilattu"; `editBook.location` "Location" / "Sijainti".
- `tests/int/editBook.int.spec.ts` -- (a) a title edit with `copy: { status: 'ordered' }` writes both, and the copy has no location; (b) `copy: { location: { create } }` moves an owned copy; (c) the One transaction row. -- AC and the transaction rule.
- `tests/unit/toastUndo.unit.spec.ts` -- the Toast Edit row. `tests/unit/editBookScreen.unit.spec.ts` -- the Mark ordered, Back and forth, and Move rows. Drive Move through `onChange` if the combobox is impractical in jsdom.

**Acceptance Criteria:**
- Given the save toast, when I tap Edit, then Edit book opens at `/books/{bookId}/edit?copy={copyId}` with the copy's status and location on the first screen, showing their saved values.
- Given Save with Book edits and a copy change, when it runs, then `editBook` writes both in one transaction through `setStatus` / `moveCopies`, and a failure leaves both unchanged.
- Given ordered is chosen, then the location is hidden, and Save leaves the copy with no location; Save returns to Scan with "Saved".
- Given a copy set to ordered, when the Book is scanned again, then the In library Answer shows the line "Ordered" (existing `copyLines`).

## Spec Change Log

## Review Triage Log

### 2026-10-21 — Review pass
- verdicts: 29 findings — high 0, medium 0, low 23, false 6, maybe-false 0
- findings:
  - `[low]` `[reject]` (blind) `editBook()` does not check that `copy.id` is a copy of `bookId`. No UI sends it: the page offers only this Book's copy, and the restore drops another copy's change. A crafted request can only change a copy the viewer owns anyway. The fix is an extra guarded read.
  - `[low]` `[reject]` (blind) A stored `{"copy": null}` or a malformed `copy` crashes the screen or fails Save with no mark. Only corrupted storage reaches it, since the screen never writes such a value. 4.7 and 4.8 rejected the same class, and Discard clears it.
  - `[low]` `[patch]` (blind) Edit stays tappable while Undo is in flight, so it can open Edit book for a copy being deleted. Fix: Edit is hidden while `undoPending`.
  - `[low]` `[reject]` (blind) A copy that is gone after render fails every Save with `NOT_FOUND`, rolling back the Book edits. It needs the Undo race (now closed) or a removal in another tab, which Phase 1 has no UI for before Epic 5. Handling it needs new branches.
  - `[low]` `[reject]` (blind) Tapping Edit dismisses the toast, so its Undo is gone, while EXPERIENCE.md gives a toast that leaves Scan the usual 8 seconds. The user taps Edit to keep the book. Keeping Undo live over Edit book would let it delete the copy being edited, which is the race above. A deliberate spec choice.
  - `[low]` `[reject]` (blind) The location kept while ordered is local state, so after a sign-in round trip owned shows the saved location, not the one picked before. It needs a sign-out mid-edit after a move and a switch to ordered. Persisting it would add draft state.
  - `[low]` `[patch]` (blind) `savedCopy.ts` (server) imports `SavedCopy` from the `'use client'` CopyFields.tsx. Fix: the type moved to savedCopy.ts. Rejected parts: `getHoldings` reads a Book's few copies once per page load, a negligible cost; `MAX_ID` sits in savedCopy.ts, which both of its users import.
  - `[low]` `[patch]` (blind) `savedCopy`'s ordered branch (start at the default location) is untested (AC: saved values). Grouped with the matching verification row.
  - `[false]` `[reject]` (blind) The story was built despite `oversized`. Disproof: Mika dismissed acting on `oversized` (4.15 owner follow-up, 2026-10-21; 4.7 and 4.8 triage logs).
  - `[low]` `[patch]` (blind) `sprint-status.yaml` is not updated. Fix: 4.9 is set to done in the story's commit.
  - `[low]` `[reject]` (edge) `copy: null` in storage crashes the restore. Same as the second blind row.
  - `[low]` `[reject]` (edge) A restored `{ location }` change for a copy that has since been made ordered fails Save on a hidden field. It needs the status to change elsewhere between the draft and its restore, and no Phase 1 screen besides this one changes status. The guard adds a branch.
  - `[low]` `[reject]` (edge) A `fields.copy` mark shows nowhere. Only a malformed restored copy reaches it, which is the corrupted-storage class above.
  - `[low]` `[reject]` (edge) A copy of another Book. Same as the first blind row.
  - `[low]` `[patch]` (edge) Edit is tappable during Undo. Grouped with the third blind row.
  - `[low]` `[reject]` (edge) A modifier-click on Edit opens a new tab but dismisses the toast in this one. Scanning happens on the phone, and the fix adds an event branch.
  - `[low]` `[patch]` (verification) Ordered → owned through `editBook` (`setStatus` owned at the shown location) is untested (AC: status and location through `setStatus`). Fix: an int case in `with a copy`.
  - `[low]` `[patch]` (verification) `savedCopy`'s ordered branch is untested. Fix: an int case asserting the default location.
  - `[low]` `[reject]` (verification) The restore filter dropping another copy's change has no test. No AC names it and it guards no spine rule (CLAUDE.md, Tests).
  - `[low]` `[reject]` (verification) The `location` mark under the combobox has no test. No AC names it, and the 4.8 title-mark test covers the shared marks plumbing (CLAUDE.md, Tests).
  - `[low]` `[reject]` (intent) The toast → page → Save → Scan chain is tested in parts, not end to end. Playwright stays limited to scan-to-save and shop check (spine, Tests).
  - `[low]` `[patch]` (intent) An ordered saved copy and its default-location start are untested. Grouped with the matching verification row.
  - `[low]` `[reject]` (intent) Inline add is exercised at the UI only by picking an existing option. Creating by name is the Combobox's own behaviour (3.41), and `editBook` with `{ create }` is covered at the service.
  - `[false]` `[reject]` (intent) The One transaction row tests validation, not rollback. Disproof: the same test's second case fails after the Book write (another user's copy, `NOT_FOUND`) and asserts the title unchanged.
  - `[low]` `[patch]` (intent) Owned-after-ordered has no service test. Grouped with the matching verification row.
  - `[false]` `[reject]` (intent) Save goes history back rather than to Scan literally. Disproof: opened from the Scan toast, history back is `/scan`, and the screen test asserts it.
  - `[false]` `[reject]` (intent) The "Ordered" Answer line has no code change. Disproof: `copyLines` already renders an ordered copy without a location as "Ordered" (`tests/unit/answer.unit.spec.ts:244`).
  - `[false]` `[reject]` (intent) The copy fields show for any `?copy=` naming the viewer's copy, not only from the toast. Disproof: the spine route (`/books/[bookId]/edit?copy=<copyId>`) defines exactly that, and no harm follows.
  - `[false]` `[reject]` (intent) Built despite `oversized`. Same as the blind row.

## Design Notes

The change sits in the draft, not in separate state, so the 4.7 guard, the sign-in round trip and Discard cover it with no new path. Keeping the hidden location when ordered is chosen means owned → ordered → owned returns to the saved value and drops out of the draft.

## Verification

**Commands:**
- `npm run typecheck` -- expected: no errors
- `npm run lint` -- expected: no errors
- `npm run test:unit` -- expected: all pass
- `npm run test:int` -- expected: all pass

**Manual checks (if no CLI):**
- In dev, scan → Add to library → Edit on the toast: Status and Location show the saved values. Ordered then Save returns to Scan with "Saved". Rescanning shows "Ordered".

## Auto Run Result

Status: done

**Summary:** The save toast now reads "Saved to {location} · Edit · Undo". Edit opens `/books/{bookId}/edit?copy={copyId}`. When `?copy=` names one of the viewer's copies of that Book, Edit book's first screen shows the copy's Status switch (owned / ordered) and a Location combobox with inline add, starting at the saved values. Choosing ordered hides the location. The change is sparse, sits in the draft under `copy` (so the "Discard changes?" guard and the sign-in round trip cover it), and is saved as `EditBookInput.copy`. `editBook()` writes it after the Book edits, in the same transaction, through `setStatus` or `moveCopies`. Save returns to Scan with "Saved". An ordered copy already shows as "Ordered" on the In library Answer (`copyLines`, unchanged). The spine already had `EditBookInput.copy` and the route, so it was not changed.

**Files changed:**
- `src/lib/catalogue/editBook.ts`: `copy` on `EditBookInput`; the Book write moved into `writeBook()`, then `writeCopy()`; ordered with a location is `VALIDATION` on `location`.
- `src/app/(frontend)/books/[bookId]/edit/actions.ts`: client-input check of `copy`.
- `src/app/(frontend)/books/[bookId]/edit/savedCopy.ts` (new): `SavedCopy`, `MAX_ID` and `savedCopy()`, which resolves `?copy=` among the viewer's copies of this Book; an ordered copy starts at the default location.
- `src/app/(frontend)/books/[bookId]/edit/CopyFields.tsx` (new): the Status switch and the Location combobox, and the sparse change.
- `src/app/(frontend)/books/[bookId]/edit/EditBookScreen.tsx`, `page.tsx`, `draft.ts`, `MoreDetails.tsx`: the copy props, the restore filter, `copy` in the draft and in the Save payload.
- `src/app/(frontend)/components/toast/store.ts`, `ToastProvider.tsx`, `src/app/(frontend)/scan/useAddToLibrary.ts`: the toast's Edit link (hidden while Undo is in flight; tapping it dismisses the toast).
- `messages/en.json`, `messages/fi.json`: `toast.edit`, `editBook.status`, `owned`, `ordered`, `location`.
- `tests/int/editBook.int.spec.ts`: 6 new cases (ordered, move by name, rollback, ordered → owned, `savedCopy` access, `savedCopy` default location).
- `tests/unit/toastUndo.unit.spec.ts`, `editBookScreen.unit.spec.ts`: toast Edit; Mark ordered, Back and forth, Move. `addToLibrary` and `notFoundForm` expect `edit` in the toast.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: 4.9 is done.

**Review findings:** 29 in total (23 low, 6 false).
- 5 patch entries, 9 findings: Edit hidden during Undo (2); `SavedCopy` moved out of the client file; an int test for ordered → owned (2); an int test for `savedCopy`'s ordered branch (3); sprint status updated.
- 0 deferred.
- 20 rejected, each with its reason in the Review Triage Log:
  - 6 false: `oversized` (2); the One transaction row tests only validation; history back versus "returns to Scan"; the Answer's Ordered line has no code; the copy fields for any own `?copy=`.
  - 14 low:
    - a copy of another Book (2)
    - corrupted stored drafts (3)
    - a copy gone after render
    - Edit dismissing the toast's Undo
    - the location kept while ordered lost on a sign-in round trip
    - a stale restored move on a now-ordered copy
    - modifier-click on Edit
    - tests no AC names: the restore filter and the location mark (2)
    - no end-to-end test
    - inline add only tested at the service

**Follow-up review recommended:** false. No high or medium entry was patched (patched by verdict: high 0, medium 0, low 5).

**Verification:**
- `npm run typecheck`: clean.
- `npx eslint src tests`: 0 errors, 40 pre-existing warnings in `src/migrations`. The full `npm run lint` also lints the parallel worktree `.claude/worktrees/story-4-13-four-corner-crop` and reports errors there, none in this change.
- `npm run test:unit`: 726 passed.
- `npm run test:int`: 455 passed.
- Not checked in a browser.

**Residual risks:**
- The manual check is still to do in dev, at phone and wide widths: scan → Add → Edit on the toast → ordered → Save → rescan shows "Ordered".
- Tapping Edit dismisses the toast, so the add's Undo is gone. EXPERIENCE.md gives a toast that leaves Scan 8 more seconds. This was chosen so Undo cannot delete the copy being edited.
- If the copy disappears after Edit book renders (removed in another tab), every Save fails with `NOT_FOUND` until a reload drops the copy fields.
