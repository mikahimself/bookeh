---
title: '7.13 [H8] Bought, Ordered and Remove'
type: 'feature'
created: '2026-10-28'
baseline_revision: '36f537cffd5fdf351d1ffd2cfc3efae5ab165b91'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** The opened wishlist entry (7.12) shows the Book, "On {list}" and For, but nothing closes or removes it. Mika cannot mark a wish bought or ordered, or drop it, so the list never reflects what is done (FR-28, UX-DR49).

**Approach:** Under For, the entry layer gets three Buttons: Bought (primary), Ordered and Remove (destructive). Bought and Ordered call a new `closeEntryAction` over the existing `closeEntry()` wrapped in `withUndo`. They toast by outcome, close the layer and land on a freshly rendered list. A toast Undo refreshes the list so the reopened entry comes back. Remove is confirmed by a dialog and calls a new `removeEntryAction` over `removeEntry()`, with no toast and no Undo.

## Boundaries & Constraints

**Always:**
- **Server actions** in `src/app/(frontend)/actions/wishlists.ts`, checking input like the file's other actions (anything else is `VALIDATION`, with nothing written). Update the file's header comment: Bought and Ordered are undoable, and Remove has no Undo.
  - `closeEntryAction(entry: unknown, as: unknown): Promise<ActionResult<Undoable<ClosedEntry>>>`: `entry` must pass `isRowId` and `as` must be `'bought'` or `'ordered'`. Returns `withUndo(ctx, (tx) => closeEntry(tx, entry, as))`. `ClosedEntry` comes from `@/lib/wishlists/entries`.
  - `removeEntryAction(entry: unknown): Promise<ActionResult<null>>`: `entry` must pass `isRowId`. Calls `removeEntry(ctx, entry)`.
- **Landing close.** `useCloseDetail()` takes an optional `to?: string`. Without it, the close behaves as today (`RemoveCopy` is unchanged). With it, the close lands on `to` the way a sheet Filter chip does: `useTaskBack`'s `leave(to)`, which goes back in history and then replaces the entry it reached with `to`. A replace is a fresh navigation, so the list is re-rendered from the server. A back/forward restore would show Next's cached list, which still has the closed entry.
  - `detailClose.ts`: the context type becomes `(to?: string) => void`.
  - `BookDetailSheet`: `close(to)` sets `landing.current = to`.
  - `BookDetailPanel`: a `landing` ref, set by `close(to)` and cleared by `Esc` and by a new `openId`. The leave calls `leave(landing.current)`.
  - Update the doc comments on all three.
- **`wishlists/[listId]/EntryActions.tsx`**, a client component with props `entryId`, `listName` and `back`. It renders, in a `flex flex-wrap gap-2` row: Button `primary` "Bought", Button `secondary` "Ordered", Button `destructive` "Remove". All three are disabled while one of its actions runs.
  - Bought / Ordered: `settleAction(closeEntryAction(entryId, as))` in a transition.
    - `ok`: `show({ kind: 'success', message, undo: { token: undoToken, seconds: undoSeconds } })`, then `closeDetail(back)`. The message is:
      - for `ordered`, `toast.ordered`;
      - for `bought` with `copyId === null` (an entry for a Person), `toast.bought`;
      - for `bought` with a copy, `toast.savedTo` with `savedTo.name`, or `toast.saved` when `savedTo` is null.
    - `NOT_FOUND`: `router.refresh()`. The page then finds no entry, and `NotOnList` toasts and replaces.
    - Any other failure: `useReportFailure()`.
  - Remove opens a `Dialog` titled `wishlists.removeTitle` (rich, with `typed` from `settings/ManagedList` for the list name) whose confirm is a destructive Button "Remove". As `RemoveCopy` does, the removal starts in the Dialog's `onClosed`, only when confirmed. Then `removeEntryAction(entryId)`:
    - `ok`: `closeDetail(back)`, with no toast.
    - `NOT_FOUND`: `router.refresh()`.
    - Anything else: report it.
- **`EntryDetail.tsx`** renders `<EntryActions entryId listName back />` after `EntryFor`, and its doc comment names the buttons.
- **Undo refresh.** Move `loans/RefreshOnUndo.tsx` to `(sections)/RefreshOnUndo.tsx` (generic doc comment: a section with no Book detail open refreshes after any toast Undo). `loans/page.tsx` imports it from there. The wishlist page mounts `<RefreshOnUndo />` when the list loaded, so an undone Bought or Ordered brings the entry back.
- **i18n** in `messages/en.json` and `fi.json`:
  - `wishlists.bought`: "Bought" / "Ostettu"
  - `wishlists.ordered`: "Ordered" / "Tilattu"
  - `wishlists.remove`: "Remove" / "Poista"
  - `wishlists.removeTitle`: "Remove from <typed>{list}</typed>?" / "Poistetaanko listalta <typed>{list}</typed>?"
  - `toast.bought`: "Bought" / "Ostettu"
  - `toast.ordered`: "Ordered" / "Tilattu"
- Design tokens only. Bought is the layer's one primary. Overlays stay one deep: the sheet opens the dialog, and nothing goes on top of it.

**Never:**
- No change in `lib/`: `closeEntry` and `removeEntry` already exist. No migration, collection or spine change.
- No Undo or toast on Remove, and no confirmation for Bought or Ordered (they have Undo).
- No `router.refresh()` before the close on success: the refreshed page would toast "Not on this list" for the entry just closed.
- No client-side REST and no Playwright test.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Bought, mine | entry 13 (no recipient), default location Hylly | `closeEntryAction(13, 'bought')`; toast "Saved to Hylly" with Undo; layer closes; lands on `/wishlists/7` (replace) | — |
| Bought, mine, no default location | `savedTo: null` | toast "Saved" with Undo | — |
| Bought, for a Person | entry 12 (for Äiti) → `copyId: null` | toast "Bought" with Undo; closes and lands | — |
| Ordered | entry 12 or 13 | toast "Ordered" with Undo; closes and lands | — |
| Undo | toast Undo after a close | `RefreshOnUndo` refreshes; the entry is back on the list | Undo failure handled by the toast |
| Entry gone meanwhile | action answers `NOT_FOUND` | no success toast; refresh → "Not on this list" | — |
| Other failure | e.g. `VALIDATION` (Book unreadable) or `INTERNAL` | layer stays; reported | `useReportFailure` |
| Remove | Remove → dialog → Remove | `removeEntryAction(13)`; no toast; closes and lands | `NOT_FOUND` refreshes; others reported |
| Remove cancelled | Remove → Cancel / Esc | nothing called; layer stays | — |
| Bad input | `entry` 0 / 1.5 / "x"; `as` "lost" / undefined | `VALIDATION`; service not called | — |

</intent-contract>

## Code Map

- `src/app/(frontend)/(sections)/wishlists/[listId]/EntryDetail.tsx` -- 7.12's entry layer (`BookDetailFrame`, `BookHeader`, `EntryFor`). Add `EntryActions` after `EntryFor`.
- `src/app/(frontend)/(sections)/wishlists/[listId]/EntryFor.tsx` -- sibling client component: `settleAction`, `useReportFailure`, `NOT_FOUND` → `router.refresh()` pattern to mirror.
- `src/app/(frontend)/(sections)/wishlists/[listId]/page.tsx` -- mount `RefreshOnUndo` in the loaded branch. `back` is already `/wishlists/${id}`.
- `src/app/(frontend)/(sections)/CopyLine.tsx:126-176` (`RemoveCopy`) -- golden pattern for the confirmed removal (`confirmed` ref, `onClosed`, destructive confirm). `:187-210` (`ReceiveCopy`) is the pattern for the undo toast (`savedTo ? toast.savedTo : toast.saved`, `undo: { token, seconds }`).
- `src/app/(frontend)/(sections)/detailClose.ts` -- `DetailCloseContext` / `useCloseDetail()`; widen to `(to?: string) => void`.
- `src/app/(frontend)/(sections)/BookDetailSheet.tsx:40-55` -- `landing` ref and `close`; set `landing.current = to` in `close`.
- `src/app/(frontend)/(sections)/BookDetailPanel.tsx:57-118` -- `leave = useTaskBack(back, true)`; `close` = `setLeaving(true)`; the leave effect calls `leave()`. Add the landing ref and pass it.
- `src/app/(frontend)/components/navigation.ts:240-290` -- read-only: `useTaskBack(fallback)(to)` goes back, then `land(to)`, which replaces on the same pathname.
- `src/app/(frontend)/(sections)/loans/RefreshOnUndo.tsx` -- move to `(sections)/RefreshOnUndo.tsx`. `loans/page.tsx:20` imports it. `CopyLine.tsx:228` and `ShelfRows.tsx:79` mention it in comments only.
- `src/app/(frontend)/actions/wishlists.ts` -- add both actions. `actions/loans.ts` shows `withUndo` and the `Undoable` return.
- `src/lib/wishlists/entries.ts` -- read-only:
  - `closeEntry(ctx, id, 'bought' | 'ordered'): Promise<Undone<ClosedEntry>>`, where `ClosedEntry` is `{ copyId: number | null; savedTo: LocationOption | null }`;
  - `removeEntry(ctx, id): Promise<void>`.
  - Both give `NOT_FOUND` for a closed, gone or foreign entry.
- `src/lib/undo/undo.ts` -- `withUndo`, `Undoable<T> = T & { undoToken; undoSeconds }`.
- `src/app/(frontend)/components/Button.tsx` -- `Button` variants `primary` / `secondary` / `destructive`.
- `src/app/(frontend)/components/ui/Dialog.tsx` -- `open`, `onOpenChange`, `onClosed`, `title`, `confirm`.
- `src/app/(frontend)/(sections)/settings/ManagedList.tsx:32` -- `typed` for rich titles.
- `tests/unit/wishlistPage.unit.spec.ts` -- extend:
  - add `closeEntryAction` and `removeEntryAction` to the actions mock;
  - add `onUndone: vi.fn(() => () => {})` to the `useToast` mock (`RefreshOnUndo` needs it);
  - fixtures `twice` (entry 13 mine, 12 for Äiti) and `forField` are already there.
  - The sheet close in jsdom lands through `router.replace('/wishlists/7', { scroll: false })` (no in-app history depth). See `collectionPage.unit.spec.ts` for a 1300px (panel) case.
- `tests/unit/wishlistActions.unit.spec.ts` -- extend: mock `closeEntry`, `removeEntry` and `@/lib/undo/undo` (`withUndo`).
- `tests/int/closeEntry.int.spec.ts` -- read-only: 7.8 already covers the close, the copy and the restore (reopen and copy removed), with Undo.
- `messages/en.json`, `messages/fi.json` -- `wishlists` and `toast` namespaces.

## Tasks & Acceptance

**Execution:**
- `src/app/(frontend)/(sections)/detailClose.ts` -- `(to?: string) => void`; doc comment.
- `src/app/(frontend)/(sections)/BookDetailSheet.tsx` -- `close(to)` sets the landing.
- `src/app/(frontend)/(sections)/BookDetailPanel.tsx` -- landing ref; `leave(landing.current)`; reset on `Esc` and on a new `openId`.
- `src/app/(frontend)/(sections)/RefreshOnUndo.tsx` -- moved from `loans/` (git mv), with a generic doc comment. `loans/page.tsx` import updated.
- `src/app/(frontend)/actions/wishlists.ts` -- `closeEntryAction`, `removeEntryAction`, header comment.
- `src/app/(frontend)/(sections)/wishlists/[listId]/EntryActions.tsx` -- new.
- `src/app/(frontend)/(sections)/wishlists/[listId]/EntryDetail.tsx` -- render `EntryActions`; doc comment.
- `src/app/(frontend)/(sections)/wishlists/[listId]/page.tsx` -- `RefreshOnUndo`; doc comment mentions Bought, Ordered and Remove closing back to a fresh list.
- `messages/en.json`, `messages/fi.json` -- new keys.
- `tests/unit/wishlistPage.unit.spec.ts` -- new cases:
  - (a) it.each over the toast table: (13, Bought, `savedTo` Hylly) → "Saved to Hylly"; (13, Bought, `savedTo` null) → "Saved"; (12, Bought, `copyId` null) → "Bought"; (13, Ordered) → "Ordered". Each calls `closeEntryAction(id, as)`, toasts with the Undo token and lands with `router.replace('/wishlists/7', { scroll: false })`, with no `router.refresh()` before it.
  - (b) `NOT_FOUND` on Bought refreshes and shows no success toast; an `INTERNAL` failure keeps the layer open (no landing, no refresh) and toasts the error.
  - (c) Remove asks in a dialog named "Remove from Christmas list?". Cancel calls nothing. Confirm calls `removeEntryAction(13)`, shows no toast and lands on the list.
  - (d) a toast Undo (the registered `onUndone` listener) refreshes the page.
  - (e) at 1300px, Bought closes the panel and lands on the list.
- `tests/unit/wishlistActions.unit.spec.ts` -- `closeEntryAction` answers `VALIDATION` and never calls `closeEntry` for `entry` 0, 1.5 or "x", or for `as` "lost" or undefined. A valid call goes through `withUndo` to `closeEntry(tx, 13, 'ordered')`. `removeEntryAction` answers `VALIDATION` for a bad id, and passes `(ctx, 13)` through for a good one.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `7-13-h8-bought-ordered-and-remove: done` when done.

**Acceptance Criteria:**
- Given an opened entry, when it renders, then Bought (the layer's one primary), Ordered and Remove (destructive) sit under For.
- Given my own entry, when I tap Bought, then the entry closes and leaves the list, an owned copy lands at the default location, and the toast reads "Saved to {location} · Undo" ("Saved · Undo" with no default location). When I tap Ordered instead, an ordered copy is made and the toast reads "Ordered · Undo".
- Given an entry for a Person, when I tap Bought or Ordered, then the entry closes with "Bought · Undo" or "Ordered · Undo", and no copy is made.
- Given either close, when it succeeds, then the layer closes (sheet or panel) and the list is re-rendered without the entry, with no "Not on this list" toast.
- Given the toast after Bought or Ordered, when I tap Undo, then the entry is back on the list and any copy the close made is gone.
- Given an opened entry, when I tap Remove, then a dialog asks to confirm. Confirming deletes the entry with no toast and no Undo, and lands on the list. Cancelling changes nothing.
- Given Book detail on `/` or `/loans`, when I remove the last copy or close it, then it behaves as before (the landing close changes nothing without `to`), and the existing suites pass.

## Spec Change Log

## Review Triage Log

### 2026-10-28 — Review pass
- verdicts: 20 findings — high 0, medium 0, low 13, false 7, maybe-false 0
- findings:
  - `[false]` `[reject]` Blind: For and Bought can run at once, so `closeEntry` may read a stale recipient — Next runs server actions one at a time from a client (as 7.12's triage recorded), so a For save settles before the close is sent; the toast follows the service's outcome either way.
  - `[low]` `[patch]` Blind: the buttons come back on while the layer slides out; a second tap gets `NOT_FOUND`, refreshes at `?entry=` and replaces "Saved to …" and its Undo with "Not on this list" — `EntryActions` keeps a `done` state set on success and disables all three on `pending || done`.
  - `[low]` `[reject]` Blind: between confirming Remove and `onClosed`, Bought or Ordered can be tapped — the modal Dialog covers the layer while it closes; reaching a button needs a tap through its exit, and the fix adds state for a path not shown reachable.
  - `[low]` `[reject]` Blind: focus drops to the body after landing, because the row the panel focuses goes with the replace — real for keyboard users, but the fix needs focus handling after a navigation (new timing plumbing in the frame); recorded as a residual risk.
  - `[low]` `[patch]` Blind: the Undo-refresh test runs with the entry open, not on the list where Undo happens (AC: Undo puts the entry back) — the case now renders `/wishlists/7` with no `entry`.
  - `[low]` `[reject]` Blind: Remove's `NOT_FOUND` and other failure paths are untested — test-only, and no acceptance criterion or spine rule names it (CLAUDE.md, Tests); the branch mirrors Bought's tested one.
  - `[low]` `[patch]` Blind: `vi.mock('@/lib/payload/context')` is declared twice in `wishlistActions.unit.spec.ts` — duplicate deleted, fixtures kept together.
  - `[low]` `[reject]` Blind: the Remove dialog names no Book and has no body — it matches the copy's Remove dialog (title only, destructive confirm), and the layer behind it already shows the Book; adding a body is a UX change no source asks for.
  - `[false]` `[reject]` Blind: the panel resets `landing` in two places, which is fragile — both resets are needed (Esc bypasses `close`, and a new `openId` cancels a pending leave at render), and no failing sequence was shown.
  - `[low]` `[reject]` Edge: X or Esc while `closeEntryAction` is pending goes back to the cached list, and the late `closeDetail(back)` is a no-op, so the closed entry stays shown — it needs a manual close within the action's round trip; tapping the stale row then shows "Not on this list". The fix adds a frame-left branch.
  - `[low]` `[reject]` Edge: the same for Remove pending after confirmation — same root and reasoning as the row above.
  - `[low]` `[reject]` Edge: `close(to)` after a drag or scrim close has already started ignores the late landing — same race as the two rows above.
  - `[low]` `[reject]` Edge (claim): "the list is re-rendered without the entry" fails when the `closing` flag is set or the frame has unmounted mid-action — same race as the rows above; the normal path is tested at both widths.
  - `[low]` `[patch]` Edge: the duplicated `vi.mock` — same fix as the Blind row.
  - `[low]` `[reject]` Verification gap: Remove's `NOT_FOUND` branch is never run by a test (filed disposition: defer) — test-only, and the matrix is not an acceptance criterion or spine rule, so CLAUDE.md's Tests rule rejects it.
  - `[low]` `[patch]` Verification gap (other): the duplicated `vi.mock` — same fix as the Blind row.
  - `[false]` `[reject]` Intent: the data effects (a copy made or not, Undo reopens it and removes the copy) are only mocked here — `tests/int/closeEntry.int.spec.ts` (7.8) covers both recipients and the restore through `withUndo`, and it ran green in this pass.
  - `[false]` `[reject]` Intent: the toast follows the outcome while the criteria phrase it by recipient — `closeEntry` makes a copy exactly when the entry has no recipient, so the two coincide; the outcome is the safer source of truth.
  - `[false]` `[reject]` Intent: "Saved" with no default location is not in the criteria — the criteria's "Saved to {location}" has no location to name; "Saved" is the Received toast's existing fallback (EXPERIENCE.md, Received), not a new behaviour.
  - `[false]` `[reject]` Intent: the landing close and the `RefreshOnUndo` move touch Book detail and Loans beyond the criteria — without `to`, the close is unchanged, and the collection and loans suites, which cover the last-copy close and Undo refresh, pass.

## Design Notes

**Why land with a replace.** Next restores back/forward navigation from its client cache (`staleTimes.md`: back/forward caching is unchanged by `staleTimes`). A plain history back after Bought would show the cached list with the entry still on it. Refreshing first is worse: the page re-renders at `?entry=13`, finds no open entry and toasts "Not on this list" over "Saved to …". The sheet's chip landing already goes back and then replaces the entry it reached. With `to = back`, that replace is a fresh render of the list on the same history slot: closing still goes back in history, and Back afterwards does not reopen the entry.

**Toast by outcome, not by recipient prop.** `copyId === null` after Bought means the entry was for a Person at the moment of closing. The client's `initial` recipient may be stale (changed in another tab), and the service is the authority.

## Verification

**Commands:**
- `npm run typecheck` -- expected: clean.
- `npm run lint` -- expected: 0 errors.
- `npm run test:unit` -- expected: all pass, including the new wishlist page and action cases.
- `npm run test:reset && npm run test:int` -- expected: all pass.

**Manual checks:**
- On a list, open your own entry and tap Bought (sheet and panel): the toast names the location, the entry leaves the list, and Undo brings it back. Then Ordered on an entry for a Person: "Ordered", and no copy appears on `/`. Remove: the dialog appears, and confirming removes the entry with no toast.

## Auto Run Result

**Summary.** An opened wishlist entry (`?entry=` on its list) now has Bought (the layer's one primary), Ordered and Remove (destructive) under For (FR-28, UX-DR49).
- **Bought / Ordered.** The new `closeEntryAction` wraps the existing `closeEntry()` in `withUndo`. The toast follows the outcome:
  - Ordered: "Ordered".
  - Bought with no copy made (an entry for a Person): "Bought".
  - Bought with a copy: "Saved to {location}", or "Saved" with no default location.
  - All of them have Undo.
- **Closing.** The layer closes and lands on the list through the new `useCloseDetail(to)`. That is a history back, then a replace, so the list renders fresh from the server rather than from Next's back/forward cache. The page's `RefreshOnUndo` brings the entry back after an Undo.
- **Remove.** A dialog ("Remove from {list}?") confirms first. Then `removeEntryAction` deletes the entry, with no toast and no Undo, and the layer lands on the list.
- **Failures.** `NOT_FOUND` refreshes into "Not on this list". Other failures are reported and the layer stays. The buttons stay disabled while an action runs and once one has succeeded.

**Files changed.**
- `src/app/(frontend)/actions/wishlists.ts` -- `closeEntryAction`, `removeEntryAction`.
- `src/app/(frontend)/(sections)/wishlists/[listId]/EntryActions.tsx` -- new: the three Buttons, the toasts and the Remove dialog.
- `src/app/(frontend)/(sections)/wishlists/[listId]/EntryDetail.tsx` -- renders `EntryActions`.
- `src/app/(frontend)/(sections)/wishlists/[listId]/page.tsx` -- mounts `RefreshOnUndo`.
- `src/app/(frontend)/(sections)/detailClose.ts`, `BookDetailSheet.tsx`, `BookDetailPanel.tsx` -- `useCloseDetail(to?)` lands on `to`. The panel's X now calls `close()`, so the click event is never passed as `to`.
- `src/app/(frontend)/(sections)/RefreshOnUndo.tsx` -- moved from `loans/`; `loans/page.tsx` imports it from there.
- `messages/en.json`, `messages/fi.json` -- `wishlists.bought|ordered|remove|removeTitle`, `toast.bought|ordered`.
- `tests/unit/wishlistPage.unit.spec.ts` -- the toast table, `NOT_FOUND` and `INTERNAL`, Remove cancel and confirm, Undo refresh, and the 1300px panel.
- `tests/unit/wishlistActions.unit.spec.ts` -- the input checks and the pass-through for both actions.
- `sprint-status.yaml` -- 7.13 done.

**Review.** One pass, 20 findings (low 13, false 7).
- **Patched (low entries; 4 rows across reviewers):**
  - The buttons stay disabled after a success, so a second tap during the slide-out cannot replace the toast and its Undo.
  - The Undo-refresh test now runs on the list with no entry open.
  - The duplicated `vi.mock` is gone.
- **Rejected, with reasons in the triage log:**
  - Concurrent For and Bought.
  - The Remove-confirm gap.
  - Focus after landing (kept as a residual risk).
  - Remove's failure paths untested (test-only).
  - The dialog body.
  - The panel's double reset.
  - Manual-close races while an action is pending (4 rows).
  - The intent auditor's four descriptive points.
- Nothing deferred.

**Follow-up review:** not recommended. Patched entries this pass: high 0, medium 0, low 3.

**Verification.** After the patches:
- `npm run typecheck`: clean.
- `npm run lint`: 0 errors (56 existing warnings).
- `npm run test:unit`: 1014 passed (71 files).
- `npm run test:reset && npm run test:int`: 663 passed (78 files).
- **Matrix audit:**
  - Every Bought/Ordered toast row, Entry gone, Other failure, Remove and Remove cancelled: `wishlistPage` cases.
  - Undo: the page refresh case, plus `closeEntry.int.spec.ts` (7.8) for the reopen and copy removal.
  - Bad input: `wishlistActions` cases.
- The manual browser checks were not done.

**Residual risks.**
- That the back-then-replace renders a fresh list (not Next's cached one) holds only in a real browser. In jsdom both paths end in the same `router.replace`. Worth a manual check.
- After landing, keyboard focus falls to the page body, because the focused row is gone from the fresh list.
- If the layer is closed by hand while Bought, Ordered or Remove is still in flight, the list can show the closed entry until the next navigation.
- The implementation subagent committed early (`252acda`) and set the spec to done before review. Status went back through review; the patches and the finished spec land in a follow-up commit.
- Built in a cloud session against a local Postgres 16 cluster (ICU fi-FI, port 5433, gitignored `.env`), not the Docker Compose database. Not built beside other stories, so no shared files.
