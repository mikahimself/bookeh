---
title: '7.15 [H17] On wishlists in Book detail'
type: 'feature'
created: '2026-10-28'
baseline_revision: '0d14436e195107d2414078bbc7a69f7527464095'
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

**Problem:** Book detail shows only the viewer's copies. `getHoldings()` already returns the viewer's open entries (7.3), but nothing renders them. Three more gaps:
- A Book held only through entries opens with an empty "Your copies" heading.
- Removing the last copy closes Book detail even while entries still hold the Book (`RemoveCopy`'s `last` is `copies.length === 1`, handed on by 7.3).
- After Add to wishlist in Book detail (7.14, `stay`), nothing re-renders, so a new entry and a list made on the way stay invisible (handed on by 7.14's Never and Residual risks).

FR-26, UX-DR43.

**Approach:** In `BookDetail`:
- Render an "On wishlists" group from `Holdings.entries`, after Lent before and before Genres (EXPERIENCE.md's group order).
- Render "Your copies" only when there are copies.
- Pass `RemoveCopy` a `last` that counts entries.

`AddToWishlist` with `stay` refreshes the server render after a successful save.

## Boundaries & Constraints

**Always:**
- **The group (EXPERIENCE.md, Book detail → On wishlists):**
  - It is a `<section>` with an `h3` `detail.onWishlists`, using the same classes as Lent before (`text-heading-group text-text-muted ui-case`).
  - It holds a `ul` with one `li` per open entry, in `getHoldings` order (oldest first).
  - A line reads `wishlists.entryFor` ("{list} · for {person}") when `forPerson` is set, or the list's name alone when it is the viewer's own.
  - Names stay as typed, in plain `text-body text-text`. There are no Filter chips and no links: the group shows where the Book is, and the list is opened from Wishlists.
  - The group is absent when `entries` is empty.
  - The section carries `tabIndex={-1}`, because it is the focus target named below.
- **One holdings read:** take `copies` and `entries` from the one existing `getHoldings(ctx, [bookId])` call. Add no new read and no new service.
- **No copies group:** with `copies.length === 0` the whole "Your copies" `<section>` (heading and list) is not rendered.
  - Lent before still shows if returned loans exist: a Book whose copies are all removed has none, but `returnedLoans` decides.
  - The foot is unchanged.
- **`RemoveCopy`'s `last`:** `BookDetail` passes `last={copies.length === 1 && entries.length === 0}`.
  - When the only copy goes while entries remain, Book detail stays open, and the refresh from `afterAction` re-renders it without "Your copies".
  - In that case focus moves to the On wishlists section, not to the copies section about to unmount, so it never falls to the body outside the sheet.
  - The On wishlists section is already mounted, and survives the refresh in place.
  - How `RemoveCopy` learns it is the only line is the implementer's choice: e.g. a prop, or "no sibling copy line in its section". Every other `RemoveCopy`, `MoveCopy`, `LendCopy`, `ReturnLoan` and `ReceiveCopy` focus behaviour is unchanged.
  - Update `RemoveCopy`'s doc comment: `last` means "removing it leaves the viewer holding nothing".
- **Refresh after a stay save:** in `AddToWishlist`, a successful save with `stay` calls `router.refresh()` inside the existing `startTransition`, so the On wishlists group and the picker's lists and counts follow the save.
  - The toast, the `requestId` rules and the non-`stay` path (held toast, `back()`, no refresh) are unchanged.
  - Undo already refreshes Book detail (`ReadAndRating`'s `onUndone`), so nothing is added for Undo.
- **i18n**, in `messages/en.json` and `fi.json`. Names go where they need no inflection.
  - `detail.onWishlists`: "On wishlists" / "Toivelistoilla"
  - `wishlists.entryFor`: "{list} · for {person}" / "{list} · kenelle: {person}"
- **Docs:** update `BookDetail`'s doc comment (the group, the absent copies group, and `last`) and `AddToWishlist`'s (the refresh under `stay`). Use design tokens only.

**Never:**
- No change in `lib/`, no migration and no spine change. `Holdings.entries`, `EntryLine` and `requireOwnBook`'s entry rule already exist (7.3).
- No actions on entry lines (Bought, Ordered, Remove, recipient). Those live on the opened entry (7.12, 7.13).
- No change to the Answer. The On wishlist heading is Epic 8.
- No change to the shelf's rows, and no Playwright test.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Copies and entries | 1 copy; entries on "Joululahjat" for Liisa and on "Luettavat" (own) | Your copies, then "On wishlists": "Joululahjat · for Liisa", "Luettavat" | — |
| No entries | copies only | no "On wishlists" heading | — |
| Wish-only Book | `copies: []`, 1 own entry | opens (not "Not in library"), no "Your copies" heading; On wishlists shows the entry; foot shows Edit and Add to wishlist | — |
| Last copy, entries remain | 1 copy, 1 entry; Remove confirmed, `removed: 1` | Book detail stays open (no `replace`/`back`); `afterAction` refresh runs; focus on the On wishlists section | — |
| Last copy, no entries | 1 copy, no entries | closes as today | — |
| Stay save | Book detail, Add to wishlist succeeds | toast as 7.14, `router.refresh()` once | — |
| Answer save | non-`stay` | no refresh, `back()` as 7.14 | — |

</intent-contract>

## Code Map

- `src/app/(frontend)/(sections)/BookDetail.tsx`:
  - `:78` reads `(await getHoldings(ctx, [bookId])).get(bookId)?.copies ?? []`. Take the whole `Holdings` (both arrays).
  - `:106-164` is the "Your copies" section (`tabIndex={-1}`, the focus target for line actions). Wrap it in `copies.length > 0`.
  - `:145` is `RemoveCopy last={copies.length === 1}`.
  - `:165-180` is the Lent before section: the pattern to copy for On wishlists, placed right after it.
  - `:31-62` is the doc comment.
- `src/app/(frontend)/(sections)/CopyLine.tsx:119-180`:
  - `RemoveCopy({ copyId, last })`.
  - `ok && last && removed > 0` → `closeDetail()`. Otherwise `link.current?.closest('section')?.focus()`. Adjust this focus for the only-line-with-entries case.
- `src/lib/books/holdings.ts:22-29` (read-only):
  - `EntryLine = { entryId, wishlist: Named, forPerson: Named | null }`.
  - `Holdings = { copies, entries }`.
- `src/app/(frontend)/heldBook.ts` (read-only): `requireOwnBook` already passes for an entry-only Book (7.3), so no change.
- `src/app/(frontend)/scan/AddToWishlist.tsx`:
  - The `useSavePress` success callback (`stay` branch).
  - `router` and `startTransition` already exist (used for `NOT_FOUND`).
- `src/app/(frontend)/(sections)/ReadAndRating.tsx:39-48` (read-only): Undo refreshes while Book detail is mounted.
- `messages/en.json`, `messages/fi.json` -- the `detail` and `wishlists` namespaces. `wishlists.forPerson` ("For {person}" / "Kenelle: {person}") sets the Finnish style.
- `tests/unit/collectionPage.unit.spec.ts`:
  - `holds(b, copies)` at `:243` hardcodes `entries: []`. Give it an optional `entries` argument.
  - The Book detail cases at `:899-1412`, including `confirmRemove`, `detail`, `reloads` and "closes Book detail after removing the last copy" at `:1361`: the pattern for the new cases.
- `tests/unit/addToWishlist.unit.spec.ts:144` -- the `stay` case. `refresh` is already mocked at `:10`.

## Tasks & Acceptance

**Execution:**
- `src/app/(frontend)/(sections)/BookDetail.tsx` -- entries from holdings; the On wishlists group; copies group only with copies; `last` counting entries; doc comment.
- `src/app/(frontend)/(sections)/CopyLine.tsx` -- `RemoveCopy` focus for the only-copy-with-entries case; doc comment.
- `src/app/(frontend)/scan/AddToWishlist.tsx` -- refresh after a successful `stay` save; doc comment.
- `messages/en.json`, `messages/fi.json` -- `detail.onWishlists`, `wishlists.entryFor`.
- `tests/unit/collectionPage.unit.spec.ts` -- `holds` takes entries, plus these cases in Book detail:
  - (a) the group lines "Joululahjat · for Liisa" and "Luettavat";
  - (b) no heading without entries (assert in an existing case or the new one);
  - (c) a wish-only Book opens with no "Your copies" heading and with the group;
  - (d) removing the only copy with an entry left keeps Book detail open (no `replace`/`back`), refreshes, and focuses the On wishlists section.
- `tests/unit/addToWishlist.unit.spec.ts` -- the `stay` case asserts one `refresh` per successful save. A non-`stay` success case asserts no `refresh`.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `7-15-h17-on-wishlists-in-book-detail: done` when done. If 7.15 is the epic's last story, leave the epic's own status for the retrospective.

**Acceptance Criteria:**
- Given an opened Book with open entries, when Book detail renders, then an "On wishlists" group lists each entry as "{list} · for {person}", or "{list}" alone when it is the viewer's own.
- Given a Book with no open entries, when Book detail renders, then there is no "On wishlists" group.
- Given a Book held only through entries, when it is opened at `?book=`, then Book detail opens with the group and with no "Your copies" group.
- Given a Book with one copy and an open entry, when that copy is removed, then Book detail stays open on the Book (now without "Your copies"), and focus stays inside it on the On wishlists group.
- Given Book detail, when Add to wishlist saves, then Book detail re-renders, so the new entry shows in the group.

## Spec Change Log

## Review Triage Log

### 2026-10-28 — Review pass
- verdicts: 18 findings — high 0, medium 0, low 6, false 12, maybe-false 0
- findings:
  - `[false]` `[reject]` Blind: no spec file for 7.15 — this spec exists; it was kept out of the review diff on purpose (only the edge-case layer reads it).
  - `[low]` `[patch]` Blind: `focusAfter` passed with no entries, pointing at a section that is not rendered — now passed only when `copies.length === 1 && entries.length > 0`.
  - `[low]` `[reject]` Blind: no focus fallback when entries were closed in another tab before the refresh — needs a concurrent close in another tab within one removal's round trip; the refresh then renders `NotInLibrary`, which toasts and replaces the address, so only focus is lost; a fallback adds branches.
  - `[low]` `[reject]` Blind: the On wishlists section, now a focus target, has no `aria-labelledby` — the copies section, the long-standing focus target, follows the same pattern; focus lands on content that starts with its heading; changing one group alone would split the convention.
  - `[false]` `[reject]` Blind: an entry for a Person whose name lookup misses shows as the viewer's own — `forPerson` is an owned relation (`WishlistEntries.ts:34`), so the viewer's read reaches it, and 7.4 refuses deleting a Person with any entry; `getHoldings` (7.3, unchanged) cannot miss it.
  - `[low]` `[patch]` Blind: the `stay` refresh ran after unmount, unlike `back()` — the success callback now returns after the toast when unmounted. The "button disabled during refresh" part is false: it is the intended `busy` state, and the second-press test still saves again with a new `requestId`.
  - `[low]` `[reject]` Blind: the order test checks On wishlists right after Your copies, not against Lent before — a test-only finding naming no acceptance criterion or spine rule (CLAUDE.md, Tests); the code follows EXPERIENCE.md's order (after Lent before, before Genres).
  - `[false]` `[reject]` Blind: no screen links to a wish-only Book — the criterion is that such a Book opens in Book detail at `?book=`, which it does; linking from elsewhere is not in the intent (the On wishlist Answer is Epic 8).
  - `[false]` `[reject]` Edge: unresolved recipient shown as own — same refutation as the Blind row above.
  - `[false]` `[reject]` Edge: Book detail stays open showing Not in library when entries closed elsewhere — `NotInLibrary` toasts and `router.replace(back)`, so Book detail closes; the remaining focus loss is the rejected Blind row above.
  - `[low]` `[reject]` Verification gap: `removed: 0` with `focusAfter` untested (filed `defer`) — test-only, naming no criterion or spine rule (CLAUDE.md, Tests).
  - `[low]` `[patch]` Verification gap (other): `focusAfter` passed without entries — same root as the Blind patch row; fixed there.
  - `[false]` `[reject]` Intent: open-only and wish-only access are mocked, not exercised — 7.3's `holdings.int.spec.ts` and `requireOwnBook.int.spec.ts` cover them; this story changes neither.
  - `[false]` `[reject]` Intent: the last-copy path does not run a real refresh — the unit test asserts what this story changes (`last` false, open sheet, focus); the server re-render is the existing `afterAction` path.
  - `[false]` `[reject]` Intent: the refresh goes past the epic's literal criteria — 7.14 handed it on (its Never and Residual risks), and CLAUDE.md makes a handed-on item the receiving story's criterion.
  - `[false]` `[reject]` Intent: "for me" read as no recipient — the epic context says an empty recipient means the entry is for the user.
  - `[false]` `[reject]` Intent: the order test is weaker than the UX order — same as the Blind order row; the code is right.
  - `[false]` `[reject]` Intent: the focus target goes beyond the criteria — it follows from criterion (d) keeping Book detail open while the copies section unmounts.

## Design Notes

**Focus after the last copy.** The copies section is the focus target for line actions, and it unmounts when its last line goes. The On wishlists section is mounted before and after the refresh, in the same slot (a `false` child holds the copies slot), so focusing it keeps focus in the sheet without waiting for the refresh.

**Refresh, not `afterAction`.** An entry changes no shelf row (the shelf lists copies), so a plain `router.refresh()` is enough. `afterAction` would reload the rows for nothing.

## Verification

**Commands:**
- `npm run typecheck` -- expected: clean.
- `npm run lint` -- expected: 0 errors.
- `npm run test:unit` -- expected: all pass.
- `npm run test:reset && npm run test:int` -- expected: all pass (no `lib/` change; regression only).

**Manual checks:**
- Open a Book with a copy and add it to a wishlist from Book detail. The group appears with the list. Remove the copy: Book detail stays, now with only the group.

## Auto Run Result

**Summary.** Book detail now shows which wishlists a Book is on (FR-26, UX-DR43):
- An "On wishlists" group sits after Lent before and before Genres. It has one line per open entry: "{list} · for {person}", or the list's name alone for the viewer's own. It is absent with no entries.
- A Book held only through entries opens with no "Your copies" group.
- Removing the only copy while entries remain keeps Book detail open (`RemoveCopy`'s `last` counts entries, handed on by 7.3), and focus moves to the On wishlists group.
- Add to wishlist in Book detail refreshes the server render after the save, so the new entry and any list made on the way show (handed on by 7.14).

**Files changed.**
- `src/app/(frontend)/(sections)/BookDetail.tsx` -- the group, the copies group only with copies, `last` and `focusAfter`, doc comment.
- `src/app/(frontend)/(sections)/CopyLine.tsx` -- `RemoveCopy`'s optional `focusAfter`, doc comment.
- `src/app/(frontend)/scan/AddToWishlist.tsx` -- refresh after a `stay` save while mounted, doc comment.
- `messages/en.json`, `messages/fi.json` -- `detail.onWishlists`, `wishlists.entryFor`.
- `tests/unit/collectionPage.unit.spec.ts` -- `holds` takes entries; new cases for the group, a wish-only Book, and the last copy with an entry left.
- `tests/unit/addToWishlist.unit.spec.ts` -- the refresh counts.
- `sprint-status.yaml` -- 7.15 done. The epic's own status is left for the retrospective.

**Review.** One pass, 18 findings: low 6, false 12.
- **Patched (low, 2 entries):**
  - `focusAfter` is passed only when entries remain;
  - the `stay` refresh runs only while mounted.
- **Rejected, with reasons in the triage log:**
  - focus loss when entries close in another tab mid-removal;
  - no `aria-labelledby` on the group, matching the copies section;
  - a test-only order check and the untested `removed: 0` focus branch (CLAUDE.md, Tests);
  - the false rows: missing spec, unresolved recipient, wish-only reachability, and the intent auditor's descriptive points.
- Nothing deferred.

**Follow-up review:** not recommended. Patched entries this pass: high 0, medium 0, low 2.

**Verification.** After the patches:
- `npm run typecheck`: clean.
- `npm run lint`: 0 errors (56 existing warnings). Prettier is clean on the changed files.
- `npm run test:unit`: 1046 passed (74 files).
- `npm run test:reset && npm run test:int`: 663 passed (78 files).
- **Matrix audit:** every row is covered by a test that ran.
  - `collectionPage` cases: copies and entries, no entries, wish-only, last copy with entries remaining, last copy without entries (existing case).
  - `addToWishlist` cases: the stay save and the Answer save.
- The manual browser check was not done.

**Residual risks.**
- If entries are closed in another tab during a removal of the only copy, focus can fall to the body as Book detail closes.
- The On wishlists group has no accessible name of its own, like the copies group.
- Built in a cloud session against a local Postgres 16 cluster (ICU fi-FI, port 5433, gitignored `.env`). Not built beside other stories, so there are no shared files.
