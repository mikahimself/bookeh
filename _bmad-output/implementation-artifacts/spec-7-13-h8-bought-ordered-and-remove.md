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
