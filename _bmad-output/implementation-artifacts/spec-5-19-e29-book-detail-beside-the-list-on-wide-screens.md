---
title: '5.19 [E29] Book detail beside the list on wide screens'
type: 'feature'
created: '2026-10-23'
baseline_revision: 'a8d8d8973ed3f0c7a3b78372c181e1502d4a6ac9'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** From 900px, Book detail is still the phone's modal bottom sheet over a dimmed list, so I can't click through books at my desk while the list stays put (UX-DR23, UX-DR54).

**Approach:** From 900px, `BookDetail` renders the same content in a 360px side panel to the right of the list, as plain layout: no scrim, not modal, focus not trapped. Under 900px it stays the sheet. A row click while it is open swaps the Book in place; X and `Esc` close it the same way the sheet closes.

## Boundaries & Constraints

**Always:**
- One `BookDetail` server component and one content tree. Only the frame differs: a client switch on `useWide()` picks the panel or the existing `BookDetailSheet`.
- Panel (DESIGN.md, Detail panel and Elevation & Depth): `w-panel-width`, plain `bg-background`, a `stroke-hairline` `border` line on its left edge, and the one shadow, `-10px 0 24px -14px` in `--color-shadow`. The shadow is a named `@utility` in `styles.css` (the theme's shadows are cleared, as with `selection-bar`), never an inline literal. It is the third column of the existing `wide:flex` row after the list, flush with the screen's right edge. Its content stays in view while the list scrolls under it. X sits at the top right. It is an `<aside>` named by the Book's title.
- Closing: X, or `Esc` anywhere on the page, animates the panel out and then calls `useTaskBack(shelfHref(query), true)`, the sheet's close. `Esc` is ignored when `defaultPrevented`, or when its target is an `input`, `textarea` or `select` (so the search field's `Esc` still only clears the search).
- Swap: `?book=` changing while the panel is mounted keeps it mounted, open and in place. The new Book's content replaces the old and the panel's scroll returns to the top. Rows already replace while a Book is open (5.18).
- Motion: opening, the panel's width grows from 0 while the list (`flex-1`) narrows in step and the content slides in from the right. Closing reverses this. The gap before the panel is part of what grows, so nothing jumps. About `--default-transition-duration`. Under `prefers-reduced-motion: reduce` there is no transition and the close leaves at once. The close waits on `element.getAnimations()` finishing, and goes at once when there are none (reduce motion, jsdom).
- `Enter` on a focused row or tile opens it: they are already `next/link`s. Keep it that way; add no key handler.
- The 900–1199px Filter / Book detail exclusion (`FilterPanelProvider`) and select mode closing Book detail (`SelectionProvider`) stay as built and work unchanged with the panel.

**Never:**
- No change to `lib/shelf`, `ShelfRows.tsx`, `/data/shelf`, `Sheet.tsx` or Book detail's content and groups.
- No `Sheet`, `Dialog` or `Drawer` for the panel, no scrim, no focus trap, no `inert` on the list.
- No new content (read, rating, notes, chips, copy actions belong to later stories).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Open wide | 1300px, `/?book=5` | `complementary` "Tuntematon sotilas" beside the list with header, Your copies, Edit. No `dialog`, the list's links stay operable | — |
| Swap | panel on Book 5, `?book=6` | same panel element, now Sinuhe's content; no close, no `router.back`/`replace` | — |
| X | panel open, no in-app entry | `router.replace('/?q=linna', { scroll: false })` | — |
| Esc | panel open, focus on a row; then focus in the search field | first: closes as X; second: the panel stays | — |
| Phone | under 900px, `/?book=5` | the 5.18 sheet, unchanged | — |
| Not held | wide, `?book=99` | toast "Not in library", no panel | `NOT_FOUND` as in 5.18 |

</intent-contract>

## Code Map

- `src/app/(frontend)/(sections)/BookDetail.tsx:56` -- wraps the content in `BookDetailSheet`; switch to the new frame, passing `label`, `query` and `bookId`.
- `src/app/(frontend)/(sections)/BookDetailSheet.tsx` -- phone frame, unchanged. Its close (`useTaskBack(shelfHref(query), true)`) is the one to reuse.
- `src/app/(frontend)/(sections)/page.tsx:69-85` -- `<BookDetail>` sits outside the `wide:flex wide:gap-6` row. Move it into that row after the list column. The sheet portals, so the phone is unaffected. Let the row fill the section's height (`flex-1`) so the panel's border runs to the bottom of a short list.
- `src/app/(frontend)/components/ui/overlay.tsx:179` -- `useWide()`: `false` on the server and during hydration, then the real value. A direct wide load hydrates the sheet closed (its rAF is cancelled on unmount) and then mounts the panel.
- `src/app/(frontend)/components/CloseButton.tsx` -- the X; `overlay.close` is its label (`messages/*.json`).
- `src/app/(frontend)/(sections)/Selection.tsx:18-20,76-83` -- the document `Esc` listener pattern, with the `defaultPrevented` check.
- `src/app/(frontend)/(sections)/FilterPanel.tsx:31,66-91,111-116` -- `ONE_PANEL_QUERY` and the exclusion. The wide Filter panel is the plain-layout `<aside>` precedent.
- `src/app/(frontend)/styles.css:33,37,90,161-179,336-338,351-400` -- `--color-border`, `--color-shadow` (light and both dark blocks), `--spacing-panel-width`, the `selection-bar` utility precedent, and the overlay motion utilities with their reduce-motion blocks.
- `_bmad-output/planning-artifacts/ux-designs/ux-bookeh-2026-10-03/mockups/key-collection-wide.html:56-68` -- `.dp`: padding `14px 24px`, X at the top right, the panel as the last column of `.split`.
- `tests/unit/collectionPage.unit.spec.ts:114,449-556` -- the page harness. `matchMedia` is stubbed to the phone globally; the Book detail cases and `detail()` helper are here. `tests/unit/filterPanel.unit.spec.ts:78-125` shows per-describe wide stubs.

## Tasks & Acceptance

**Execution:**
- `src/app/(frontend)/(sections)/BookDetailPanel.tsx` -- new client file. `BookDetailFrame` picks `BookDetailPanel` when `useWide()`, else `BookDetailSheet`. `BookDetailPanel` is the `<aside>` with X, the `Esc` listener, open/close motion, the leave after the animation, and a scroll reset when `bookId` changes. Its doc comment says why it is plain layout.
- `src/app/(frontend)/(sections)/BookDetail.tsx` -- use `BookDetailFrame`; update the doc comment (sheet on the phone, panel from 900px).
- `src/app/(frontend)/(sections)/page.tsx` -- move `<BookDetail>` into the row as in the Code Map; update the doc comment.
- `src/app/(frontend)/styles.css` -- the panel's shadow utility and its open/close width transition with a reduce-motion block. Tokens only.
- `tests/unit/collectionPage.unit.spec.ts` -- a wide `describe` (1300px stub) with one case each for Open wide, Swap, X and Esc from the matrix.

**Acceptance Criteria:**
- Given a screen 900px or wider, when I open a Book, then its detail renders in a 360px panel on the right with the hairline border and the one shadow, and the list narrows beside it, without a scrim and without trapping focus.
- Given the panel open, when I click another row, then its content swaps without closing; when I press X or `Esc`, then it closes and the list keeps its rows and scroll position.
- Given a focused row or tile, when I press `Enter`, then that Book opens.
- Given a screen 900px or wider, when the panel opens or closes, then it slides from the right while the list narrows or widens in step; with reduce motion set, the change is immediate.
- Given 900–1199px, when I open Filter with the panel open, then the panel closes, and the other way round (unchanged from 5.14).

## Spec Change Log

## Review Triage Log

### 2026-10-23 — Review pass
- verdicts: 27 findings — high 0, medium 2, low 13, false 12, maybe-false 0
- findings:
  - `[low]` `[reject]` Verification gap: the scroll reset on a swap has no test. Test-only, and neither an AC nor a spine rule names it (CLAUDE.md triage rule).
  - `[low]` `[reject]` Verification gap: a new Book during the close keeping the panel open has no test. Test-only, and no AC or spine rule names it.
  - `[false]` `[reject]` Blind: tall detail is clipped and can't be scrolled when the list is short. The frame is a flex item of the `wide:flex` row, so its content height (the sticky box, capped at `max-h-dvh`) counts toward the row's cross size and its automatic minimum. The row grows to fit the panel, and `overflow-clip` never cuts content inside the aside's height.
  - `[low]` `[reject]` Blind: Base UI's document `Esc` listener runs after the panel's, so `defaultPrevented` can't see a popup's handling. Not reachable today: on `/` the only popups beside the panel are the Filter comboboxes, whose `input` targets the panel already ignores. Pickers and dialogs inside the panel arrive with 5.24/5.30 (residual risk).
  - `[medium]` `[patch]` Blind: focus falls to `<body>` when X or `Esc` closes the panel from inside. Fixed: before leaving, focus moves to the open Book's row link (`aria-current`) when focus was inside the panel.
  - `[false]` `[reject]` Blind: closes from Filter at 900–1199px and from select mode skip the exit motion, against the motion AC. The intent (Story 5.19's epic AC, UX-DR54) asks only for the opening slide. Only this spec's AC wording adds closing, and a fix that edits this build's spec is rejected.
  - `[low]` `[reject]` Blind: crossing 900px while the panel is closing loses the close. It needs a resize inside the 200 ms window, and the fix carries state across the frame switch. Crossing while open correctly turns the panel into the sheet.
  - `[low]` `[reject]` Blind: the panel's `Esc` exempts all fields, while select mode's exempts only the search. The select-mode rule is pre-existing, and unifying them is a shared helper with no reachable conflict.
  - `[false]` `[reject]` Blind: the wide Not in library test runs no new code. It covers the matrix's Not held row at wide width and the moved `<BookDetail>` placement inside the row. The matrix audit requires it.
  - `[false]` `[reject]` Blind: built despite `oversized`. Mika dismissed the `oversized` trigger for epic-sliced stories (Epic 4 retro, P4), as in 5.10–5.18.
  - `[false]` `[reject]` Blind: `BookDetailFrame` lives in `BookDetailPanel.tsx`. The spec puts both there, and no harm is named.
  - `[low]` `[reject]` Blind: no tests for the leave waiting on animations or for a new Book mid-close. Test-only, and no AC or spine rule names them.
  - `[false]` `[reject]` Edge: with a short list, `overflow-clip` cuts off the bottom of the panel. Same refutation as the Blind clipping row: the panel's content height counts toward the row's height.
  - `[false]` `[reject]` Edge: the panel stays stuck at width 0 if `leave()` does nothing. `closing` is set only by a back already in flight and clears on `popstate` or after 1 s. On `/` no task is mounted, and the replace branch always drops `book`.
  - `[low]` `[reject]` Edge: clicking the open Book's own row during the 200 ms close is ignored. Rare, and the fix needs a reopen channel into the panel.
  - `[low]` `[reject]` Edge: a different row clicked between `router.back()` and its `popstate` is lost. That window is milliseconds, and the fix is extra state.
  - `[low]` `[patch]` Edge: `Esc` closes the panel without `preventDefault`, so select mode's listener also fires (for example after Forward to a `?book=` entry while selecting). Fixed: `event.preventDefault()` when the panel takes the `Esc`.
  - `[medium]` `[patch]` Edge: focus falls to `<body>` on close. Same root and fix as the Blind row above.
  - `[low]` `[reject]` Edge: crossing 900px while leaving loses the close. Same as the Blind row above.
  - `[low]` `[reject]` Edge: a direct wide load has no panel in the server HTML and grows it in after hydration. Accepted in the Code Map (`useWide()` is `false` on the server), and server-rendering the panel is a restructure.
  - `[low]` `[patch]` Edge: the `Esc`-from-search assertion runs before the microtask that calls `leave()`, so it passes even with the field guard removed (the matrix's Esc row). Fixed: pending effects are flushed before the assertion.
  - `[false]` `[reject]` Edge: closes other than X and `Esc` skip the motion. Same refutation as the Blind row above.
  - `[false]` `[reject]` Intent: nothing committed and sprint status not updated. The commit and the sprint-status update happen at finalize.
  - `[false]` `[reject]` Intent: `oversized` built unsplit. Same refutation as the Blind row above.
  - `[low]` `[reject]` Intent: the branch is not rebased onto main, which has moved (5.16 touches `styles.css` and `FilterPanel.tsx`). This is a merge-time concern for the worktree branch and not a defect in the diff (residual risk).
  - `[false]` `[reject]` Intent: layout and motion are untested and the manual checks have no evidence. The implementer ran a Playwright check at 1300, 1000 and 600 px with reduce motion and dark mode (Auto Run Result). CSS is not unit-tested by convention.
  - `[false]` `[reject]` Intent: the phone matrix row has no new case. It is covered by the 5.18 Book detail cases, which still run under the default phone stub and passed.

## Design Notes

The panel is the address's open state like the sheet, so it has no history of its own: X and `Esc` leave the address, and the browser's Back drops the panel without the exit animation, as with the sheet.

The panel follows the list in DOM order, matching what is drawn. A keyboard user tabs through the loaded rows to reach it. That is accepted: the panel is not modal, and `Esc` closes it from anywhere.

Waiting on `getAnimations()` instead of `transitionend` means no event can go missing (an unchanged width fires nothing) and needs no timeout.

## Verification

**Commands:**
- `npm run typecheck` -- expected: no errors
- `npx eslint 'src/app/(frontend)' tests/unit` -- expected: no errors
- `npm run test:unit` -- expected: all pass, including the new wide cases

**Manual checks (if no CLI):**
- `npm run dev` at 1300px: a row opens the panel sliding in while the list narrows. Another row swaps it. X and `Esc` slide it out. At 1000px Filter and the panel exclude each other. With reduce motion emulated, all of it is immediate. Under 900px the sheet is unchanged.

## Auto Run Result

**Summary:** From 900px, Book detail opens as a 360px panel beside the list, not as the modal sheet. Under 900px it is still the 5.18 sheet.
- **Panel:** the hairline left border and the one shadow. No scrim, no focus trap, nothing inert. It sits flush with the screen's right edge, and its content stays in view while the list scrolls.
- **Motion:** the panel grows in from the right while the list narrows in step, and X or `Esc` shrinks it away before leaving the address. With reduce motion, both are immediate.
- **Swap:** a row click while the panel is open swaps the Book in the same panel and scrolls it to the top.
- **Focus and keys:** `Esc` from inside a field belongs to the field. A close from inside the panel returns focus to the open Book's row. `Enter` on a row already opened it, since rows are links.

**Files changed:**
- `src/app/(frontend)/(sections)/BookDetailPanel.tsx`: new. `BookDetailFrame` (panel or sheet, by `useWide()`) and the panel.
- `src/app/(frontend)/(sections)/BookDetail.tsx`: uses the frame.
- `src/app/(frontend)/(sections)/page.tsx`: Book detail moved into the `wide:flex` row, and the row fills the section's height.
- `src/app/(frontend)/styles.css`: the `panel-shadow` and `panel-motion` utilities.
- `tests/unit/collectionPage.unit.spec.ts`: switchable `matchMedia`, and a wide group for Open, Swap, X, `Esc` and Not held.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: 5.19 set to `done`.

**Review findings:** 27 (medium 2, low 13, false 12).
- **Patched:**
  - focus falling to `<body>` on close (medium, found by two layers);
  - `Esc` not marked handled, so select mode also took it (low);
  - the `Esc`-from-search assertion ran before the async leave (low).
- **Deferred:** none.
- **Rejected (low):**
  - three test-only gaps (scroll reset, mid-close swap, animation wait);
  - Base UI `Esc` listener order (unreachable today);
  - crossing 900px mid-close (×2);
  - the two `Esc` field rules;
  - own row clicked mid-close;
  - a row clicked between back and `popstate`;
  - the hydration reflow on a direct wide load;
  - not rebased onto main.
- **Rejected (false):**
  - clipping with a short list (×2);
  - closes from Filter or select mode skip the motion (×2);
  - the wide Not held test;
  - `oversized` (×2);
  - the file name;
  - the panel stuck at width 0;
  - not committed;
  - layout and motion unverified;
  - the phone row.

**Follow-up review recommendation:** false. Patched entries by verdict: high 0, medium 1, low 2.

**Verification:**
- `npm run typecheck`: passes.
- `npx eslint 'src/app/(frontend)' tests/unit`: clean, and prettier is clean.
- `npm run test:unit`: 59 files, 840 tests pass.
- Every I/O matrix row has a passing test; the Phone row is covered by the 5.18 cases under the default phone stub.
- The implementer checked it in Chromium with throwaway Playwright scripts at 1300, 1000 and 600px, against the worktree's own Postgres on port 5433. It covered:
  - the panel flush at the edge, the list narrowing in step, and the content sliding in;
  - sticky content, the swap, and X and `Esc` keeping `scrollY`;
  - `Enter` on a row, and `Esc` in search leaving the panel open;
  - reduce motion being immediate;
  - Filter and the panel excluding each other at 1000px;
  - the sheet at 600px;
  - a direct `?book=` load, and dark mode.

**Residual risks:**
- **Esc order:** Base UI's document `Esc` listener registers after the panel's. Once 5.24/5.30 put a picker or dialog inside the panel, one `Esc` could close both. Handle it there.
- **Close motion:** closes from Filter at 900–1199px, from select mode and from the browser's Back drop the panel without the exit motion. The epic AC asks only for the opening slide.
- **Direct wide load:** the panel appears after hydration (`useWide()` is `false` on the server), so the list reflows once.
- **`@starting-style`:** older browsers show the panel without the opening slide.
- **Branch base:** main has moved since `a8d8d89` (5.16 touches `styles.css` and `FilterPanel.tsx`). Rebase before merging.
- **Worktree database:** `bookeh-postgres-5-19` on port 5433 holds a seeded check user (`check519@bookeh.test`) and 60 Books. Remove the container after the merge.
