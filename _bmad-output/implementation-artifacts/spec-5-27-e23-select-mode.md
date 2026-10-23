---
title: 'Story 5.27: [E23] Select mode'
type: 'feature'
created: '2026-10-23'
status: 'done'
baseline_revision: 'd2ed78744379811b51dde8b9ac5f4bc1c8f7f68a'
review_loop_iteration: 0
followup_review_recommended: true
context: []
warnings: []
deferred:
  - summary: >-
      The history-back branch of start() (Book detail open with in-app history) is never exercised by a test.
    evidence: |-
      collectionPage.unit.spec.ts covers only the replace branch (canGoBackInApp() is false without navigation tracking). Nothing on main pushes ?book= yet, so the branch is unreachable today; the spec's Design Notes move start() onto 5.18's close function, whose tests should pin back versus replace.
    location: >-
      src/app/(frontend)/(sections)/Selection.tsx
    severity: low
---

<intent-contract>

## Intent

**Problem:** Select in the tools row is disabled, so there is no way to tick several copies. Stories 5.28–5.30 need a selection and an action bar to act on it.

**Approach:** A client `SelectionProvider` on the collection page holds select mode and the ticked copy ids. It sits above `ShelfRowsProvider`, so the selection outlives query changes. In select mode, rows and tiles tick on tap. A sticky action bar (count and Done) replaces the phone's pinned Scan book. Done or `Esc` leaves the mode.

## Boundaries & Constraints

**Always:**
- The selection is a set of copy ids (AD-18). The count is the set's size, so ticked rows out of view or filtered out still count. There is no select all. It survives search, filters, sort and scrolling.
- Entering closes Book detail when the address has `book`: history back if `canGoBackInApp()`, otherwise `router.replace(shelfHref(query), { scroll: false })`.
- In select mode a row or tile is one `<label>` around a native checkbox: a tap anywhere toggles it, keyboard reachable, 44px tap area. Checkbox per DESIGN.md: 20px square, 2px `text` outline; checked draws a tick in `text` and is not filled. It goes before the cover on a row and before the title on a tile.
- Action bar per DESIGN.md: full width, `background`, 2px `text` top edge, sticky bottom with the pinned Scan book's safe-area padding. "{n} selected" on the left, Done (primary) on the right. Phone: one row in this story; 5.28–5.30 add the actions row. It carries `data-action-bar data-pinned-bottom data-pinned-wide`, so toasts rise above it.
- While the bar shows, the layout's pinned Scan book is `display: none`. The header Scan book on wide screens stays. Select is not rendered in the tools row (mock-up).
- `Esc` leaves the mode unless the event is already `defaultPrevented`.
- Strings in en and fi; tokens only.

**Never:** No bar actions (5.28–5.30, 9.8). No keeping the selection across routes or reloads. No change to `lib/shelf` or the server.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Enter | Tap Select | Checkboxes on all rows/tiles, bar "0 selected" + Done, Select gone | — |
| Tick | Tap a row twice | Ticked, then unticked; count 1, then 0 | — |
| Query change | 2 ticked; a search drops one from the list | Still "2 selected"; that row is ticked when it comes back | — |
| Leave | Done or `Esc` | Checkboxes, bar gone; Select and Scan book back; re-entering shows "0 selected" | — |
| Detail open | `/?book=5` loaded directly, tap Select | `router.replace` to the address without `book` | — |

</intent-contract>

## Code Map

- `src/app/(frontend)/(sections)/page.tsx` -- wrap tools and list/`LoadFailed` in `SelectionProvider` (inside `CollectionDisplayProvider`); render `SelectBar` last.
- `src/app/(frontend)/(sections)/CollectionTools.tsx:28` -- disabled Select `ActionLink`: wire to `start()`, hide while selecting, update the doc comment.
- `src/app/(frontend)/(sections)/CollectionList.tsx:105-117` -- pass selection state per `row.copy.copyId`.
- `src/app/(frontend)/(sections)/BookRow.tsx`, `CoverTile.tsx` -- hook-free. Optional `select?: { ticked: boolean; onToggle: () => void }`; when present, the `<li>`'s content sits in the `<label>`. The title stays the row's first `<p>` (the page test reads it).
- `src/app/(frontend)/styles.css` -- hide the layout's pinned Scan book (`layout.tsx:47`): `:root:has([data-action-bar]) [data-pinned-bottom]:not([data-action-bar]) { display: none; }`. The toast lift (`ToastProvider.tsx:124`) assumes one `--spacing-pinned-bar` of height.
- `src/app/(frontend)/components/navigation.ts:72` -- `canGoBackInApp()`.
- `src/app/(frontend)/(sections)/SearchField.tsx:39,66-76` -- `useSearchParams` + `parseShelfQuery`; the document `keydown` pattern.
- `messages/en.json`, `fi.json` → `collection` -- add `selected` ("{n} selected" / "{n} valittu"), `done` ("Done" / "Valmis").
- `tests/unit/collectionPage.unit.spec.ts` -- harness: router mock, `renderPage`, re-render for a new query (line 152).

## Tasks & Acceptance

**Execution:**
- `src/app/(frontend)/(sections)/Selection.tsx` -- new: `SelectionProvider`, `useSelection()` → `{ selecting, ticked: ReadonlySet<number>, start, toggle(copyId), done }`. `start` closes Book detail. The `Esc` listener is mounted while selecting.
- `src/app/(frontend)/(sections)/SelectBar.tsx` -- new: nothing unless selecting, else the bar.
- `src/app/(frontend)/components/Checkbox.tsx` -- new, hook-free: native input, tick as inline SVG in `currentColor`.
- `page.tsx`, `CollectionTools.tsx`, `CollectionList.tsx`, `BookRow.tsx`, `CoverTile.tsx`, `styles.css`, en/fi messages -- the change named on each one's Code Map line.
- `tests/unit/collectionPage.unit.spec.ts` -- one case through Enter, Tick, Query change and Leave (Done, then `Esc` after re-entering); one for Detail open.

**Acceptance Criteria:**
- Given the collection, when I tap Select, then checkboxes appear on every row or tile, tapping ticks instead of opening, and the bar shows the count and Done.
- Given select mode on the phone, when the bar shows, then the pinned Scan book is not rendered. On wide screens the bar is at the bottom and Scan book stays in the header.
- Given ticked rows, when search or filters change or I scroll, then ticks and count hold, including rows out of view.
- Given select mode, when I tap Done or press `Esc`, then it ends and the selection clears.
- Given `?book=` in the address, when I enter select mode, then the address loses `book`.

## Spec Change Log

## Review Triage Log

### 2026-10-23 — Review pass
- verdicts: 23 findings — high 0, medium 3, low 11, false 9, maybe-false 0
- findings:
  - `[low]` `[patch]` Verification gap: select mode in the covers layout (`CoverTile` with `select`) is untested (AC 1, "every row or tile") — added "ticks a cover tile in select mode" to `collectionPage.unit.spec.ts`.
  - `[low]` `[defer]` Verification gap: the `router.back()` branch of `start()` is never exercised — unreachable on main (nothing pushes `?book=`); deferred to 5.18's close function per Design Notes.
  - `[false]` `[reject]` Intent (a): the phone bar has one row, not the epic's two — the epic says this story's bar holds only the count and Done; an empty actions row would draw nothing.
  - `[false]` `[reject]` Intent (b): "Book detail closes" / "ticks instead of opening" are shown only via the address — Book detail (5.18) does not exist on main; the address is its whole state, and Design Notes hand the rest to whichever story merges second.
  - `[false]` `[reject]` Intent (c): survival across a query is tested by `rerender`, not real navigation — Next keeps the page across search params; `SearchField`'s own-replace logic and 5.12's keep-my-place already rely on it in the browser.
  - `[low]` `[reject]` Intent (d): filtering and scrolling are not exercised — Filter is still disabled, and the state lives above the list, so a load-more cannot touch it; a test would restate the tree structure.
  - `[false]` `[reject]` Intent (e): phone/wide placement and Scan book hiding are CSS-only and untested — CLAUDE.md bars CSS tests; the implementer checked both widths in a real browser (Playwright screenshots at 390px and 1280px).
  - `[low]` `[patch]` Intent (f): cover tiles untested in select mode — same root as the first verification-gap row; same test.
  - `[false]` `[reject]` Edge: `router.back()` may land on another route or query — nothing on main pushes `?book=` (only `SearchField` writes it, by replace), so `canGoBackInApp()` with `book` set cannot reach a foreign entry; 5.18's close function takes over.
  - `[medium]` `[patch]` Edge: `Esc` in the search field clears the search and also ends select mode — `Selection.tsx` now ignores `Esc` from inside `[role="search"]` (a plain `editable()` check would also have swallowed `Esc` on a focused checkbox).
  - `[low]` `[reject]` Edge: ticked ids of a copy removed meanwhile (toast Undo) stay counted — takes an Undo of a lingering save toast with that copy ticked; pruning adds a reload hook, and 5.28's all-or-none action reports `NOT_FOUND` through `afterAction` anyway.
  - `[low]` `[reject]` Edge: Select is offered on First run and Load failed — tapping it shows "0 selected" until Done; rare, and the guard needs a new prop from the page.
  - `[low]` `[reject]` Edge: the live region mounts holding "0 selected", so entry is not announced — focus now lands on Done (see Blind focus row), which announces the bar; keeping the region mounted restructures `SelectBar`.
  - `[false]` `[reject]` Edge: `layout.tsx`'s `flex flex-col` shifts other sections — Loans and Wishlists render `null`; Settings' root is a padded `div` with no margins, so stretch and block layout match.
  - `[false]` `[reject]` Edge: the address may keep another book after `back()` — same as the first Edge row: no push of `?book=` exists to go back over.
  - `[medium]` `[patch]` Blind: focus drops to `<body>` when Select unmounts on entry — Done now takes `autoFocus`. The exit side (Done unmounting) is left: Select reappears first in the tools row.
  - `[medium]` `[patch]` Blind: `Esc` in the search field wipes the selection — same root as the Edge `Esc` row; same fix.
  - `[low]` `[reject]` Blind: a sideways swipe changes section and drops the ticks — `swipeDirection` needs 48px sideways and twice the vertical travel, a deliberate gesture; leaving the section ending select mode is the spec's Never (no keeping across routes).
  - `[false]` `[reject]` Blind: `start()` assumes the entry below has the same address — same as the first Edge row.
  - `[low]` `[reject]` Blind: Select offered with nothing to select — same as the Edge First run row.
  - `[low]` `[patch]` Blind: the bar takes `view-transition-name: pinned-bottom` during a section slide and stays frozen over the new section — the rule in `styles.css` now excludes `[data-action-bar]`, so the bar slides away with the collection.
  - `[low]` `[reject]` Blind: ticked ids never pruned — same as the Edge toast-Undo row.
  - `[false]` `[reject]` Blind: `CoverTile`'s normal markup reshaped and its branches repeated — moving `pt-1` to the wrapper draws the same; the two branches differ in structure (label, checkbox row), and no harm is named.

## Design Notes

5.18 (Book detail) is being built in parallel. Whichever of the two merges second makes `start()` close the detail through 5.18's close function, and has rows open the detail only when `select` is absent. When 5.28–5.30 add the phone's actions row, the toast lift has to grow past `--spacing-pinned-bar`.

## Verification

**Commands:**
- `npm run typecheck` -- expected: no errors
- `npx eslint 'src/app/(frontend)' tests/unit/collectionPage.unit.spec.ts` -- expected: clean
- `npm run test:unit` -- expected: all pass, including the new cases

## Auto Run Result

**Summary:** Select in the collection's tools row enters select mode. Rows and cover tiles become labels around a checkbox that tick on tap. A sticky action bar shows "{n} selected" and Done; it replaces the phone's pinned Scan book (CSS `:has()`), and Scan book stays in the header on wide screens. The selection is a set of copy ids in `SelectionProvider` above `ShelfRowsProvider`, so it survives search and filter changes. Done or `Esc` leaves and clears. Entering removes `?book=` from the address.

**Files changed:**
- `src/app/(frontend)/(sections)/Selection.tsx` -- new: provider and `useSelection()`, the Book detail close, and the `Esc` listener (ignored inside the search).
- `src/app/(frontend)/(sections)/SelectBar.tsx` -- new: the action bar (count, Done with `autoFocus`), `data-action-bar data-pinned-bottom data-pinned-wide`.
- `src/app/(frontend)/components/Checkbox.tsx` -- new: native checkbox drawn per DESIGN.md.
- `src/app/(frontend)/(sections)/page.tsx` -- wraps tools and list in `SelectionProvider`, renders `SelectBar`; the root is a flex column so the bar sits at the bottom of a short list.
- `src/app/(frontend)/(sections)/layout.tsx` -- the content wrapper is a flex column (outside the Code Map, needed for the above).
- `src/app/(frontend)/(sections)/CollectionTools.tsx` -- Select wired and hidden while selecting.
- `src/app/(frontend)/(sections)/CollectionList.tsx`, `BookRow.tsx`, `CoverTile.tsx` -- optional `select` prop (`RowSelect`) with the label and checkbox.
- `src/app/(frontend)/styles.css` -- hides the pinned Scan book while the bar shows; keeps the bar out of the section-slide `pinned-bottom` name.
- `messages/en.json`, `messages/fi.json` -- `collection.selected`, `collection.done`.
- `tests/unit/collectionPage.unit.spec.ts` -- three cases: the select-mode flow, a cover tile, and closing Book detail. `tests/unit/collectionList.unit.spec.ts` -- harness wrapped in `SelectionProvider`.

**Review findings:** 23 findings. 4 patch entries applied: `Esc` in the search (medium), focus to Done on entry (medium), the bar out of the section-slide transition (low), and a covers-layout test (low). 1 deferred: the untested `router.back()` branch (low). The other 18 were rejected; the reasons are in the triage log above.

**Follow-up review:** recommended (`true`). Two medium entries were patched by the orchestrator directly, not re-reviewed, and the patches are unverified in a real browser: whether Done's `autoFocus` scrolls or jumps on the phone, and whether `Esc` leaves select mode from a focused checkbox while staying in the search field. Patched counts: high 0, medium 2, low 2.

**Verification:** `npm run typecheck` -- no errors. `npx eslint 'src/app/(frontend)' tests/unit/collectionPage.unit.spec.ts tests/unit/collectionList.unit.spec.ts` -- clean. `npm run test:unit` -- 57 files, 817 tests passed. Prettier clean. Before review, the implementer ran `next dev` against the worktree's Postgres (5466) and took Playwright screenshots at 390px and 1280px, in rows and covers.

**Residual risks:**
- 5.18 (Book detail) is in another worktree. Whichever merges second routes `start()` through 5.18's close and makes rows open the detail only without `select`.
- When 5.28–5.30 add the phone's actions row, the bar outgrows `--spacing-pinned-bar` and the toast lift has to follow.
- Focus is not restored to Select on Done.


**Rebase onto 5.18 and 5.14 (2026-10-23):** 5.27 merged second, so it carries the Design Notes hand-off:
- `start()` now closes Book detail through 5.18's own close, `useTaskBack(shelfHref(query), true)`, which replaces the earlier `canGoBackInApp()` branch. The deferred back-branch item now falls under 5.18's close tests.
- In select mode, `BookRow` and `CoverTile` render the `<label>` instead of 5.18's `<Link>`, so a tap ticks and opens nothing.
- `SelectionProvider` and `SelectBar` sit inside 5.14's `FilterPanelProvider`.
- The `filterPanel.unit.spec.ts` and `collectionList.unit.spec.ts` harnesses gain `SelectionProvider` (and `useSearchParams` for the list).

After the rebase: typecheck clean, eslint clean, Prettier clean, `npm run test:unit` 59 files and 832 tests passed.
