---
title: '5.23 [E11] Read and rating in Book detail'
type: 'feature'
created: '2026-10-23'
status: 'done'
baseline_revision: 'a2bac31164cfe0264fd17e0f793dc44acfc9460c'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Book detail shows no read flag or rating, so Mika cannot mark a Book read or rate it where he sees it (FR-29, UX-DR22). `setRead` exists (5.22); `setRating` and a reader of the viewer's `user-books` state do not.

**Approach:** Add `setRating(ctx, bookId, rating | null)` and a small `getUserBookState(ctx, bookId)` reader to `lib/books`, two server actions beside the collection page, and a client "read and rating" group in `BookDetail` (read / unread Text switch + the existing `Rating`) that saves each change at once.

## Boundaries & Constraints

**Always:**
- Group sits between the header and Your copies; no visible heading. Text switch options "read" / "unread" with `aria-label` "Read"; `Rating` labelled by a visually hidden "Rating" (`sr-only`). Stacked, so it fits the phone sheet.
- Read switch sends the tapped value (never `toggle`) through `setReadAction({ bookId, read })` → `withUndo(ctx, (tx) => setRead(tx, { bookId }, read))`. Success toast: "Marked {n} read" or "Marked {n} unread" (by the returned `read`) with the receipt's Undo.
- Rating: tapping a star, another star, or Clear calls `setRatingAction({ bookId, rating })`; no toast, no Undo. Tapping the current star does nothing (the component already does this).
- `setRating`: one `withTransaction`; `requireOwnBook` first (AD-7), then `upsertUserBook(tx, bookId, { rating })`, which moves `ratedAt` (set on a value, `null` on clear). Range and whole-number checks stay with the collection (its `ValidationError` reaches the client as `VALIDATION` via `runAction`). Returns `void`.
- Actions start with `requireUserOrThrow()` inside `runAction()`; input is `unknown`: anything but a positive safe-integer `bookId` with `read: boolean` / `rating: number | null` is `VALIDATION` before the service runs.
- Both controls show the tapped value at once and fall back to the stored value on failure (via `useSavedSwitch`). Every result goes to 5.28's `useAfterAction()` (ok reloads rows; `NOT_FOUND` toasts "Not in library"; other failures reported) — `useSavedSwitch` must not also report it.
- After a successful toast Undo while the group is mounted: `router.refresh()` and remount the group in the same transition, so the switch shows the restored flag.
- The group is keyed by `bookId`, so swapping the open Book on wide resets it.
- Strings in English and Finnish; tokens only; 44px taps on phone (existing components).

**Never:**
- No Undo or toast for rating. No select-mode Read (5.29). No tags in the reader (Epic 9): it returns `Pick<UserBookState, 'read' | 'rating'>`.
- No `user-books` write outside `upsertUserBook`. No revalidation in the actions. No markup/CSS tests, no action tests (service carries the AC test).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Rate | held Book, no row; `setRating(4)` | row created, `rating 4`, `ratedAt` set | — |
| Change | then `setRating(2)` | `rating 2`, `ratedAt` set again | — |
| Clear | then `setRating(null)` | `rating null`, `ratedAt null`, row kept | — |
| Not mine | Book the viewer holds no copy of | nothing written | `NOT_FOUND` |
| Mark read | switch unread → read | shows read; toast "Marked 1 read · Undo"; rows reload | failure: back to unread, `afterAction` reports |
| Undo | Undo on that toast | switch shows unread again | `UNDO_FAILED` toast as today |

</intent-contract>

## Code Map

- `src/app/(frontend)/(sections)/BookDetail.tsx` -- server component; insert the group after the header `div`; it already ran `heldBook()` (the gate) so the reader needs none.
- `src/app/(frontend)/(sections)/page.tsx:82` -- only render site of `BookDetail`, so actions live in `(sections)/actions.ts` (spine: single-page actions beside the page). 5.28 created that file (`removeCopiesAction`, input-check style) and wraps `BookDetail` in `ShelfActionsProvider`.
- `src/app/(frontend)/components/useSavedSwitch.ts` -- shared "saved at once" hook (Theme, Language, Visibility, Layout, Size). Today `onSaved: () => void` and it reports failures itself.
- `src/app/(frontend)/components/TextSwitch.tsx`, `components/Rating.tsx` -- reuse as is; see `FilterPanel.tsx:304` `RatingField` for wiring `Rating`.
- `src/app/(frontend)/(sections)/ShelfRows.tsx:63` -- `useAfterAction()` (5.28), reachable from Book detail; `ShelfRowsState` already reloads rows on `onUndone`.
- `tests/unit/collectionPage.unit.spec.ts:68-72` -- renders the page with `heldBook`, `getHoldings`, `(sections)/actions` and `ToastProvider` mocked; new imports in `BookDetail` must be mocked there too.
- `src/app/(frontend)/components/toast/ToastProvider.tsx` -- `useToast()` → `show`, `onUndone(listener)` (returns unsubscribe); `ToastInput.undo = { token, seconds }`.
- `src/app/(frontend)/scan/actions.ts` -- action shape (`'use server'`, `runAction`, `requireUserOrThrow`, `isSaveInput` guard); `scan/useAddToLibrary.ts:78` -- toast with Undo from an `Undoable` result.
- `src/lib/books/setRead.ts` -- `setRead(ctx, { bookId }, value)` → `Undone<{ read; count }>`; doc-comment style to copy for `setRating`.
- `src/lib/books/upsertUserBook.ts:144` -- `rating` sets `ratedAt` (or `null`); lazy row create.
- `src/lib/books/effectiveBook.ts:48` -- `UserBookState` type.
- `src/lib/undo/undo.ts:54` -- `withUndo(ctx, fn)`; refuses a ctx already in a transaction.
- `tests/int/setRead.int.spec.ts` -- seeding and `failure()` helper to mirror.
- `messages/en.json`, `messages/fi.json` -- `detail` and `toast` namespaces; `collection.read`/`unread` give "read"/"unread" ("luettu"/"lukematon").

## Tasks & Acceptance

**Execution:**
- `src/lib/books/setRating.ts` -- new `setRating()` per Always, doc comment like `setRead`'s.
- `src/lib/books/userBookState.ts` -- new `getUserBookState(ctx, bookId)`: the viewer's row (`user-books` access scopes it), `{ read: false, rating: null }` without one. Caller gates.
- `tests/int/setRating.int.spec.ts` -- Rate/Change/Clear in one case (assert `ratedAt` set, then `null`); Not mine (`NOT_FOUND`, no row).
- `src/app/(frontend)/components/useSavedSwitch.ts` -- generic result `T`; `onSaved?: (data: T) => void`; optional 4th `onFailed?: (failure) => void` that replaces the built-in report (latest call only, as now). Existing callers compile unchanged.
- `src/app/(frontend)/(sections)/actions.ts` -- add `setReadAction`, `setRatingAction` per Always beside 5.28's `removeCopiesAction`, reusing its input-check style.
- `src/app/(frontend)/(sections)/ReadAndRating.tsx` -- new client group per Always (toast, `useAfterAction()`, Undo refresh + remount).
- `src/app/(frontend)/(sections)/BookDetail.tsx` -- read state via `getUserBookState`, render `<ReadAndRating key={bookId} … />`.
- `tests/unit/readAndRating.unit.spec.ts` -- one behaviour case for AC 1 (matrix rows Mark read, Undo): tap "read" → `setReadAction({ bookId, read: true })`, toast "Marked 1 read" with the token, `afterAction` called; an `onUndone` listener run → `router.refresh()` and the switch shows unread. Mock the actions, toast and router as `collectionPage.unit.spec.ts` does.
- `tests/unit/collectionPage.unit.spec.ts` -- mock `@/lib/books/userBookState` and add the two actions to the `(sections)/actions` mock; no new cases.
- `messages/en.json`, `messages/fi.json` -- `detail.read` "Read"/"Luettu", `detail.rating` "Rating"/"Arvio", `toast.markedRead` "Marked {n} read"/"{n} merkitty luetuksi", `toast.markedUnread` "Marked {n} unread"/"{n} merkitty lukemattomaksi".
- `_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md` -- `lib/books` shared shapes: add `// setRating(ctx, bookId, rating | null): void — no Undo`; folder map line: add `getUserBookState`.

**Acceptance Criteria:**
- Given an opened Book, when I tap the other option of the read / unread switch, then it saves through `setRead` and the toast reads "Marked 1 read · Undo" (or "unread"), and Undo shows the previous state in the switch.
- Given an opened Book, when I tap a star, another star, or Clear, then the rating saves at once with `ratedAt`, with no toast and no Undo; Clear shows only while a rating is set.
- Given two copies of one Book, when I mark it read in Book detail, then one `user-books` row for that Book holds the flag (no per-copy state).
- Given `setRating(ctx, bookId, rating | null)`, when it runs, then it writes through `upsertUserBook` and an integration test shows set, change, clear and `NOT_FOUND`.
- Given this story's commit, when the spine is read, then `lib/books` lists `setRating` and `getUserBookState`.

## Spec Change Log

## Review Triage Log

### 2026-10-23 — Review pass
- verdicts: 27 findings — high 0, medium 5, low 17, false 5, maybe-false 0
- findings:
  - `[medium]` `[patch]` Blind: with `onFailed`, `useSavedSwitch` stops tracking the error toast that `afterAction` raises, so after a failed rating tap and a successful retry the error toast stays (rating success raises no toast to replace it) — `afterAction` now returns the error toast it raised (`number | null`), `onFailed` returns it, and the hook records it in `raised` as on the built-in path; 5.28's `SelectBar` ignores the return.
  - `[low]` `[reject]` Blind: on `NOT_FOUND` Book detail stays open with live controls — needs the last copy removed elsewhere (another tab) mid-view; "Not in library" still toasts and the list reloads, and a fix adds a refresh branch.
  - `[low]` `[reject]` Blind: any toast Undo remounts the group and can drop an in-flight save's shown value — needs Undo tapped within a save's round trip; the write still lands and the next open shows it; a fix needs toast identity or in-flight plumbing.
  - `[low]` `[reject]` Blind: `getUserBookState` reads the row `getEffectiveBooks` already read — one indexed lookup per open; folding it into `EffectiveBook`'s reader widens a shared API.
  - `[low]` `[patch]` Blind: spine lists `getUserBookState` only by name — added its signature and the caller-gates note under `lib/books` shared shapes.
  - `[medium]` `[patch]` Blind: the failed-save path (matrix "Mark read" failure column; "must not also report") is untested — new unit case: `NOT_FOUND` goes to `afterAction` once, `show` not called, switch back on unread.
  - `[false]` `[reject]` Blind: AC 3 (two copies, one row) has no evidence — `setRead.int.spec.ts` "Mixed toggle" marks Book x through two of its copies and checks the one row; the `(owner, book)` unique index allows no other.
  - `[false]` `[reject]` Blind: built despite `oversized` — Mika dismissed the trigger for epic-sliced stories (Epic 4 retro, P4), as in 5.10–5.20.
  - `[low]` `[patch]` Blind: `useSavedSwitch` doc comment not reflowed — reflowed.
  - `[low]` `[patch]` Blind: the test does not show `ratedAt` moves on Change — asserts the changed `ratedAt` is not earlier than the first.
  - `[low]` `[reject]` Blind: `bookInput` spreads unchecked client fields — each action reads one field and type-checks it at once; nothing else is used.
  - `[medium]` `[patch]` Edge: error toast stays after a successful retry — same root as the Blind stale-toast row; same fix.
  - `[low]` `[reject]` Edge: Undo during an in-flight save remounts from a pre-write refresh — same as the Blind in-flight row.
  - `[low]` `[reject]` Edge: `NOT_FOUND` leaves the detail showing the Book — same as the Blind `NOT_FOUND` row.
  - `[low]` `[patch]` Verification gap: `getUserBookState` untested — `setRating.int.spec.ts` now reads it for a rated and an unrated held Book.
  - `[medium]` `[patch]` Verification gap: `onFailed` path untested — same as the Blind failure-path row; same new case.
  - `[low]` `[reject]` Verification gap: Rating's client wiring untested — a two-line pass-through; the service rows carry AC 2 and the project's functional-minimum rule rejects test-only findings that name no criterion beyond them.
  - `[low]` `[reject]` Verification gap: action input checks untested — the spec's Never excludes action tests; the checks are four readable lines.
  - `[low]` `[reject]` Verification gap (other): any Undo remounts the group — same as the Blind in-flight row.
  - `[low]` `[reject]` Intent: Undo scope is app-wide, not this toast's — `onUndone` carries no toast identity; harmless remount apart from the in-flight case above.
  - `[false]` `[reject]` Intent: a superseded call's failure is not routed — the hook reports only the latest call by design (spec task "latest call only, as now"); the shown value follows the latest call, so nothing is hidden from the user.
  - `[low]` `[reject]` Intent: the Undo unit case never changes `initial`, so a refresh bringing a different value is not exercised — jsdom cannot drive the RSC refresh; left to the browser check (residual risk).
  - `[medium]` `[patch]` Intent: matrix failure column untested — same as the Blind failure-path row.
  - `[false]` `[reject]` Intent: "rows reload" only asserted through a mocked `afterAction` — the reload is 5.28's `ShelfActionsProvider`, tested there.
  - `[low]` `[reject]` Intent: Rating UI untested — same as the verification-gap Rating row.
  - `[false]` `[reject]` Intent: AC "two copies → one row" untested — same refutation as the Blind AC 3 row.
  - `[low]` `[reject]` Intent: `NaN`/fractions pass the action to the collection — the contract leaves range and whole-number checks to the collection, and the client only sends 1–5 or `null`.

## Design Notes

"Marked {n} unread" is not in EXPERIENCE.md's toast table; it is the plain counterpart of "Marked {n} read", since the switch can mark unread and Read has Undo either way.

Undo refresh: `useSavedSwitch` seeds from `initial` once, and a refresh may bring back the same server value the group was rendered with, so a prop-change key would not remount. Bump a generation key in the same transition as the refresh:

```tsx
useEffect(() => onUndone(() => startTransition(() => {
  router.refresh()
  setGeneration((g) => g + 1)
})), [onUndone, router])
```

## Verification

**Commands:**
- `npm run test:int -- tests/int/setRating.int.spec.ts tests/int/setRead.int.spec.ts` -- expected: passes
- `npm run test:unit` -- expected: passes (messages parity included)
- `npm run typecheck` -- expected: no errors
- `npm run lint` -- expected: no errors

**Manual checks (if no CLI):**
- `next dev` on the worktree DB: open a Book, switch read, see the toast, Undo flips the switch back; rate, change, Clear.

## Auto Run Result

**Summary:** Book detail now has the read / unread switch and the Rating between the header and Your copies (FR-29, UX-DR22).
- The switch saves through `setRead` on the Book, with "Marked 1 read" / "Marked 1 unread" and Undo. After an Undo, the route refreshes and the group remounts on the restored flag.
- A star, another star or Clear saves at once through the new `setRating(ctx, bookId, rating | null)`, which moves `ratedAt`. No toast, no Undo.
- Book detail reads the viewer's state with the new `getUserBookState()`.
- Every result goes through 5.28's `useAfterAction()`.

**Files changed:**
- `src/lib/books/setRating.ts` (new): `setRating()`, `requireOwnBook` then `upsertUserBook`, one transaction.
- `src/lib/books/userBookState.ts` (new): `getUserBookState()`, `{ read: false, rating: null }` without a row.
- `src/app/(frontend)/(sections)/actions.ts`: `setReadAction` (with `withUndo`), `setRatingAction`; shared `isId`/`bookInput` checks.
- `src/app/(frontend)/(sections)/ReadAndRating.tsx` (new): the client group.
- `src/app/(frontend)/(sections)/BookDetail.tsx`: reads the state and renders the group keyed by Book.
- `src/app/(frontend)/(sections)/ShelfRows.tsx`: `afterAction` returns the error toast it raised.
- `src/app/(frontend)/components/useSavedSwitch.ts`: result data to `onSaved`; optional `onFailed` replaces the built-in report and keeps the toast-withdraw rule.
- `messages/en.json`, `messages/fi.json`: `detail.read`, `detail.rating`, `toast.markedRead`, `toast.markedUnread`.
- `ARCHITECTURE-SPINE.md`: `setRating` and `getUserBookState` under `lib/books`.
- Tests: `tests/int/setRating.int.spec.ts` (new), `tests/unit/readAndRating.unit.spec.ts` (new, two cases), `tests/unit/collectionPage.unit.spec.ts` (mocks only).
- `sprint-status.yaml`: 5.23 done.

**Review findings:** one pass, 27 rows in the Review Triage Log.
- **Patched:** medium 2 entries (stale error toast after a retry, via `afterAction` returning its toast id; failed-save path untested, new unit case), low 4 (spine signature for `getUserBookState`, reader assertions, `ratedAt` moves, doc comment reflow).
- **Deferred:** none.
- **Rejected:** `NOT_FOUND` leaving the detail open, any Undo remounting the group during an in-flight save, the second row read, `bookInput`'s spread, untested Rating wiring and action checks, the unchanged-`initial` Undo case, `NaN` reaching the collection (all `low`); AC 3 evidence, `oversized`, a superseded failure, the 5.28 reload (all `false`).

**Follow-up review recommendation:** true. Two medium entries were patched on a first pass. The unverified risk: the stale-toast fix changes 5.28's `afterAction` to return a toast id and routes it through `useSavedSwitch`'s `raised` tracking, but no test shows a later success withdrawing that toast.

**Verification:**
- `npm run test:int -- tests/int/setRating.int.spec.ts tests/int/setRead.int.spec.ts tests/int/removeCopiesAction.int.spec.ts`: 13 passed, on the worktree's own Postgres (port 5470).
- `npm run test:unit`: 60 files, 860 passed.
- `npm run typecheck`: clean. `npm run lint`: 0 errors (40 existing warnings in migrations).
- Matrix audit: Rate, Change, Clear, Not mine (`setRating.int.spec.ts`); Mark read success and failure, Undo (`readAndRating.unit.spec.ts`); all ran and passed.
- Not done: the manual `next dev` check in a browser.

**Residual risks:**
- Refresh and remount after Undo are shown only in jsdom with a mocked router; Next's real router needs the browser check.
- Any toast Undo while Book detail is open remounts the group.
- A `NOT_FOUND` from these controls leaves Book detail open until closed.

